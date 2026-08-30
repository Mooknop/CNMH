/*
 * PURE transform core for the research-topic import (#1840, slice S2 of the
 * research-topics train started at #1839). Turns a raw adventure-module
 * journal dump (from the same gitignored Foundry export used by the
 * adventure-room importer) into `research` collection docs. No fs / fetch /
 * process here — mirrors scripts/importAdventureRooms.mjs so the module stays
 * side-effect-free and reusable from a browser upload button later if one
 * ever gets built; today it's only consumed by scripts/importResearchTopicsCli.js.
 *
 * The parser is regex-based on purpose (same rationale as the rooms
 * importer): the dump is one consistent premium module, so a full DOM parser
 * would be a dependency we don't need.
 *
 * CRITICAL: the source dump contains verbatim Paizo book text and this repo
 * is PUBLIC. Nothing in this file (or its test) may quote that dump — every
 * fixture in importResearchTopics.test.js is synthetic prose invented for the
 * test, shaped like the real markup without reproducing it.
 *
 * Exactly three pages are extracted, matched by (journal name, page name) —
 * see PAGE_MATCHERS below. Each page's first <section class="action"> holds
 * one research stat block: a split heading (title + "Research Topic N"), an
 * optional traits list, one or more sources (each `<hr />`-separated pair of
 * paragraphs: "<strong>Name</strong> prose; <strong>Maximum RP</strong> N"
 * followed by a "<strong>Research Checks</strong> ..." paragraph carrying one
 * or more @Check[...] enrichers), then a run of un-separated
 * "<strong>N Research Point(s)</strong> text" tier paragraphs. An optional
 * "<strong>Reward:</strong> ..." paragraph can follow the section; anything
 * else after the section (e.g. a bonus reaction stat block) is ignored.
 */

// --- text helpers ------------------------------------------------------

function titleCase(s) {
  return String(s)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Flatten @UUID[...]{Label} → Label, and drop label-less @UUID[...] refs.
function flattenUuids(html) {
  return html.replace(/@UUID\[[^\]]+\]\{([^}]*)\}/g, '$1').replace(/@UUID\[[^\]]+\]/g, '');
}

// Render an inline @Check[...] enricher (rare inside tier/description prose)
// as readable "Skill DC N" text, e.g. @Check[arcana|dc:30] → "Arcana DC 30".
function renderChecksInline(html) {
  return html.replace(/@Check\[([^\]]+)\]/g, (_, inner) => {
    const skill = inner.split('|')[0];
    const dcMatch = inner.match(/dc:(\d+)/);
    const dc = dcMatch ? dcMatch[1] : '?';
    const label = skill === 'flat' ? 'Flat Check' : titleCase(skill);
    return `${label} DC ${dc}`;
  });
}

function stripImages(html) {
  return html.replace(/<img\b[^>]*>/gi, '');
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '');
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// Full readable-text pipeline for a prose chunk (description/note/tier text).
function cleanHtml(html) {
  return collapseWhitespace(stripTags(stripImages(renderChecksInline(flattenUuids(html)))));
}

// Every @Check[...] in a chunk of HTML, structured as {skill, dc}. The skill
// slug is kept VERBATIM (dumps mix e.g. academia-lore / academic-lore — never
// normalize, that's what tells two topics' sources apart from each other).
function extractChecks(html) {
  return [...html.matchAll(/@Check\[([^\]]+)\]/g)].map((m) => {
    const inner = m[1];
    const skill = inner.split('|')[0];
    const dcMatch = inner.match(/dc:(\d+)/);
    return { skill, dc: dcMatch ? Number(dcMatch[1]) : null };
  });
}

// --- structural extraction ----------------------------------------------

// Every <p> before the first <section class="action"> → description.
function extractIntroParagraphs(introHtml) {
  return [...introHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => cleanHtml(m[1]))
    .filter(Boolean)
    .join('\n\n');
}

// <ul class="traits"><li class="trait">X</li>...</ul>, kept verbatim (dumps
// mix casing, e.g. "unique" / "Linguistic") — no ul at all is valid (empty).
function extractTraits(sectionHtml) {
  const ul = sectionHtml.match(/<ul class="traits">([\s\S]*?)<\/ul>/i);
  if (!ul) return [];
  return [...ul[1].matchAll(/<li class="trait">([\s\S]*?)<\/li>/gi)].map((m) => cleanHtml(m[1])).filter(Boolean);
}

// <h2 class="split ..."><span>Title</span><span>Research Topic N</span></h2>
function parseSplitHeading(sectionHtml) {
  const h2 = sectionHtml.match(/<h2[^>]*class="split[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
  if (!h2) throw new Error('no <h2 class="split"> topic heading found');
  const spans = [...h2[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)].map((m) => m[1].trim());
  if (spans.length < 2) throw new Error('topic heading is missing its title/level spans');
  const title = spans[0];
  const levelMatch = spans[1].match(/Research Topic\s+(\d+)/i);
  if (!levelMatch) throw new Error(`could not parse research level from "${spans[1]}"`);
  return { title, level: Number(levelMatch[1]) };
}

// A source is "charged" (Brodert Quink-style — 5 sp per check without his
// Support) when some sentence of its prose mentions both charging and a coin
// denomination. costNote is that sentence, cleaned; note text with no
// sentence punctuation counts as one whole "sentence" so a single run-on
// clause still matches.
function detectCostNote(note) {
  const sentences = note.match(/[^.!?]+[.!?]?/g) || [note];
  for (const raw of sentences) {
    const s = raw.trim();
    if (/charge/i.test(s) && /\bsp\b/i.test(s)) return s;
  }
  return null;
}

// One <hr />-delimited source chunk → { name, note, costNote?, maxRp, checks }.
function parseSourceChunk(chunkHtml) {
  const paragraphs = [...chunkHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1]);
  if (!paragraphs.length) throw new Error('source chunk has no <p> paragraphs');
  const p1 = paragraphs[0];
  const nameMatch = p1.match(/<strong>([^<]+)<\/strong>/);
  if (!nameMatch) throw new Error('source paragraph has no <strong> name');
  const name = cleanHtml(nameMatch[1]);
  const maxRpMatch = p1.match(/<strong>Maximum RP<\/strong>\s*(\d+)/i);
  if (!maxRpMatch) throw new Error(`source "${name}" has no Maximum RP`);
  const proseRaw = p1.slice(nameMatch.index + nameMatch[0].length, maxRpMatch.index).replace(/;\s*$/, '');
  const note = cleanHtml(proseRaw);

  const checksP = paragraphs.find((p) => p !== p1 && /Research Checks/i.test(p));
  if (!checksP) throw new Error(`source "${name}" has no Research Checks paragraph`);
  const checks = extractChecks(checksP);
  if (!checks.length) throw new Error(`source "${name}" has a Research Checks paragraph with no @Check tokens`);

  const source = { name, note };
  const costNote = detectCostNote(note);
  if (costNote) source.costNote = costNote;
  source.maxRp = Number(maxRpMatch[1]);
  source.checks = checks;
  return source;
}

// Hardcoded lore wiring for tier unlocks, keyed by doc id + rp (per #1840).
const LORE_ID_MAP = {
  'the-pit-research': { 1: 'the-pit', 6: 'arika-avertin', 10: 'whistlefangs' },
  'hellstorm-focus-research': { 3: 'hellstorm-focus' },
};

// The tail chunk after the last <hr /> — a run of un-separated
// "<strong>N Research Point(s)</strong> text" paragraphs → unlocks[], sorted
// ascending. Any paragraph that doesn't start with that pattern is ignored
// (defensive — every page seen so far has only tier paragraphs here).
function parseTierChunk(tierChunkHtml, docId) {
  const paragraphs = [...tierChunkHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1]);
  const unlocks = [];
  for (const p of paragraphs) {
    const m = p.match(/^\s*<strong>(\d+)\s*Research Points?<\/strong>/i);
    if (!m) continue;
    const rp = Number(m[1]);
    const text = cleanHtml(p.slice(m[0].length));
    const unlock = { rp, text };
    const loreId = LORE_ID_MAP[docId] && LORE_ID_MAP[docId][rp];
    if (loreId) unlock.loreId = loreId;
    unlocks.push(unlock);
  }
  unlocks.sort((a, b) => a.rp - b.rp);
  return unlocks;
}

// An optional "<p><strong>Reward:</strong> ...</p>" AFTER the first section.
function extractReward(afterSectionHtml) {
  const m = afterSectionHtml.match(/<p[^>]*>\s*<strong>Reward:<\/strong>([\s\S]*?)<\/p>/i);
  return m ? cleanHtml(m[1]) : null;
}

// --- dump → one doc --------------------------------------------------------

function transformPage(matcher, dump) {
  const journal = (dump.journals || []).find((j) => j.name === matcher.journal);
  if (!journal) {
    throw new Error(`research topic "${matcher.id}": journal "${matcher.journal}" not found in dump`);
  }
  const page = (journal.pages || []).find((p) => p.name === matcher.page);
  if (!page) {
    throw new Error(`research topic "${matcher.id}": page "${matcher.page}" not found in journal "${matcher.journal}"`);
  }
  const html = page.text?.content || '';

  const sectionMatch = html.match(/<section class="action">([\s\S]*?)<\/section>/i);
  if (!sectionMatch) {
    throw new Error(`research topic "${matcher.id}": no <section class="action"> found on page "${matcher.page}"`);
  }
  const sectionHtml = sectionMatch[1];
  const description = extractIntroParagraphs(html.slice(0, sectionMatch.index));

  let heading;
  try {
    heading = parseSplitHeading(sectionHtml);
  } catch (err) {
    throw new Error(`research topic "${matcher.id}": ${err.message}`);
  }
  const traits = extractTraits(sectionHtml);

  // Strip the heading, the traits list, and any images before splitting the
  // remainder into <hr />-delimited chunks.
  const remainder = sectionHtml
    .replace(/<h2\b[^>]*>[\s\S]*?<\/h2>/i, '')
    .replace(/<ul class="traits">[\s\S]*?<\/ul>/i, '')
    .replace(/<img\b[^>]*>/gi, '');

  const chunks = remainder.split(/<hr\s*\/?>/i);
  if (chunks.length < 2) {
    throw new Error(`research topic "${matcher.id}": no <hr /> source separators found`);
  }
  const sourceChunks = chunks.slice(0, -1);
  const sources = sourceChunks.map((chunk, i) => {
    try {
      return parseSourceChunk(chunk);
    } catch (err) {
      throw new Error(`research topic "${matcher.id}" source #${i + 1}: ${err.message}`);
    }
  });

  const unlocks = parseTierChunk(chunks[chunks.length - 1], matcher.id);
  if (!unlocks.length) {
    throw new Error(`research topic "${matcher.id}": no research-point tiers found`);
  }

  const reward = extractReward(html.slice(sectionMatch.index + sectionMatch[0].length));

  const doc = { id: matcher.id, title: heading.title, level: heading.level, traits, description, sources, unlocks };
  if (reward) doc.reward = reward;
  return doc;
}

// journal name + page name → doc id, per #1840.
const PAGE_MATCHERS = [
  { journal: 'Ch 2: Strange Times in Sandpoint', page: 'Researching the Pit', id: 'the-pit-research' },
  { journal: 'Ch 2: Strange Times in Sandpoint', page: 'Hellstorm Focus', id: 'hellstorm-focus-research' },
  { journal: 'Adventure Toolbox', page: 'Researching the Eighth', id: 'the-eighth-runelord' },
];

function transformResearchTopics(dump) {
  return PAGE_MATCHERS.map((matcher) => transformPage(matcher, dump));
}

// Preserve any live-only fields a research doc has picked up (e.g. future
// party-progress tracking) across a re-import. Unlike the rooms importer,
// this collection's GM-authored surface isn't defined yet in this slice, so
// rather than hardcode field names we don't know, everything the fresh
// transform doesn't itself author is carried forward verbatim from the
// existing doc — the authored content fields (title/level/traits/description/
// sources/unlocks/reward) always come from the fresh parse.
const AUTHORED_FIELDS = new Set(['id', 'title', 'level', 'traits', 'description', 'sources', 'unlocks', 'reward']);

function mergeGmFields(docs, existingDocs) {
  const byId = new Map();
  for (const d of existingDocs || []) {
    if (d && d.id != null) byId.set(String(d.id), d);
  }
  return docs.map((d) => {
    const ex = byId.get(d.id);
    if (!ex) return d;
    const merged = { ...d };
    for (const [key, value] of Object.entries(ex)) {
      if (!AUTHORED_FIELDS.has(key)) merged[key] = value;
    }
    return merged;
  });
}

export {
  transformResearchTopics,
  mergeGmFields,
  transformPage,
  PAGE_MATCHERS,
  LORE_ID_MAP,
  flattenUuids,
  renderChecksInline,
  stripImages,
  cleanHtml,
  extractChecks,
  extractIntroParagraphs,
  extractTraits,
  parseSplitHeading,
  detectCostNote,
  parseSourceChunk,
  parseTierChunk,
  extractReward,
};
