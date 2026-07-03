#!/usr/bin/env node
/*
 * Transform a raw adventure-module journal dump (produced by
 * scripts/exportAdventureJournals.foundryMacro.js, PR #1073) into `room`
 * collection docs for the GM Adventure Room Guide (#1074), then either write
 * them to a file or POST them to the live DO's bulk import endpoint (S1 #1075).
 *
 *   node scripts/importAdventureRooms.js <dump.json> [--out <file>]
 *                                        [--post <baseUrl>]
 *
 * Default: writes <dump>.rooms.json next to the dump. With --post it uploads to
 * <baseUrl>/api/gm/import/room; that route is Cloudflare Access-gated, so set
 * CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET (a service token) in the env or
 * the POST will 403. The transform itself is pure and unit-tested against
 * synthetic fixtures — the real dump is Paizo book text and never committed
 * (repo is public; dumps live in the gitignored /adventure-dumps).
 *
 * The parser is regex-based on purpose: the input is one consistent premium
 * module, so a full DOM parser would be a dependency we don't need. Every
 * extraction lives in a small exported function so the fixtures can pin it.
 */

const ID_PREFIX = 'sd4s'; // Seven Dooms for Sandpoint

// --- text helpers ----------------------------------------------------------

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[’'"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const titleCase = (s) =>
  String(s)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

// Flatten @UUID[...]{Label} → Label, and drop label-less @UUID[...] refs.
function flattenUuids(html) {
  return html
    .replace(/@UUID\[[^\]]+\]\{([^}]*)\}/g, '$1')
    .replace(/@UUID\[[^\]]+\]/g, '');
}

// Foundry inline rolls: [[/r 2d6[bludgeoning]]] → "2d6 bludgeoning";
// [[/r 1d20+5]] → "1d20+5". Covers the typed- and untyped-damage forms the
// module actually uses.
function stripInlineRolls(html) {
  return html
    .replace(/\[\[\/[a-z]+\s*([^[\]]+)\[([a-z]+)\]\]\]/gi, '$1 $2')
    .replace(/\[\[\/[a-z]+\s*([^[\]]+)\]\]/gi, '$1');
}

// Drop <img> tags (Forge asset URLs — noise in a text aid) and unwrap the
// <span class="link"> wrappers the module puts around token references.
function stripImages(html) {
  return html.replace(/<img\b[^>]*>/gi, '');
}
function unwrapLinks(html) {
  return html.replace(/<span class="link">([\s\S]*?)<\/span>/gi, '$1');
}

// Parse one @Check[...] enricher into structured form. Shape:
//   @Check[<statistic>|dc:N|traits:a,b,action:slug|name:Label|basic:true]
// The traits segment is itself comma-joined and may embed `action:slug`.
function parseCheck(raw) {
  const inner = raw.replace(/^@Check\[/, '').replace(/\]$/, '');
  const segs = inner.split('|');
  const statistic = segs.shift();
  const out = { statistic, dc: null, secret: false, basic: false, action: null, traits: [], label: '' };
  let name = '';
  for (const seg of segs) {
    const i = seg.indexOf(':');
    if (i === -1) continue;
    const key = seg.slice(0, i);
    const val = seg.slice(i + 1);
    if (key === 'dc') out.dc = Number(val);
    else if (key === 'name') name = val;
    else if (key === 'basic') out.basic = val === 'true';
    else if (key === 'traits') {
      for (const t of val.split(',')) {
        if (t.startsWith('action:')) out.action = t.slice('action:'.length);
        else if (t) out.traits.push(t);
      }
    }
  }
  out.secret = out.traits.includes('secret');
  out.label = name || deriveCheckLabel(out);
  return out;
}

// A human label when the enricher carries no explicit name:. Prefer the action
// (what the PC does), else the statistic, with save/flat spelled out.
function deriveCheckLabel(check) {
  if (check.action) return titleCase(check.action);
  const saves = { fortitude: 'Fortitude', reflex: 'Reflex', will: 'Will' };
  if (saves[check.statistic]) return `${saves[check.statistic]}${check.basic ? ' (basic)' : ''} save`;
  if (check.statistic === 'flat') return 'Flat check';
  return titleCase(check.statistic);
}

// Every @Check in a chunk of HTML, structured. Order-preserving, not deduped —
// two identical checks in different paragraphs are both real prompts.
function extractChecks(html) {
  return [...html.matchAll(/@Check\[[^\]]+\]/g)].map((m) => parseCheck(m[0]));
}

// Render @Check inline for display: @Check[...] → "DC 19 Athletics (Force Open)".
function renderChecksInline(html) {
  return html.replace(/@Check\[[^\]]+\]/g, (m) => {
    const c = parseCheck(m);
    const stat = titleCase(c.statistic === 'flat' ? 'flat check' : c.statistic);
    const dc = c.dc != null ? `DC ${c.dc} ` : '';
    const named = c.label && c.label !== titleCase(c.statistic) ? ` (${c.label})` : '';
    return `<strong>${dc}${stat}${c.secret ? ', secret' : ''}${named}</strong>`;
  });
}

// Full readable-text pipeline for a body/read-aloud chunk.
function cleanHtml(html) {
  return unwrapLinks(stripImages(stripInlineRolls(renderChecksInline(flattenUuids(html))))).trim();
}

// --- structural extraction -------------------------------------------------

// The room heading: <h2 ...><span>A3. Name</span><span>Trivial 4</span></h2>
// or the plain <h2 ...>A1. Name</h2>. Returns { code, name, encounterLabel }.
function parseHeading(html, fallbackName) {
  const h2 = html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
  let title = fallbackName || '';
  let encounterLabel = null;
  if (h2) {
    const spans = [...h2[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)].map((m) => m[1].trim());
    if (spans.length) {
      title = spans[0];
      if (spans.length > 1) encounterLabel = spans[spans.length - 1].trim() || null;
    } else {
      title = h2[1].replace(/<[^>]+>/g, '').trim();
    }
  }
  const codeMatch = title.match(/^([A-Z]\d*)\.\s*(.*)$/);
  return {
    code: codeMatch ? codeMatch[1] : null,
    name: (codeMatch ? codeMatch[2] : title).trim() || fallbackName || '',
    encounterLabel,
  };
}

// Read-aloud boxes: <p class="read-aloud">…</p> and <div class="read-aloud">…</div>.
function extractReadAloud(html) {
  const blocks = [
    ...html.matchAll(/<p class="read-aloud">([\s\S]*?)<\/p>/gi),
    ...html.matchAll(/<div class="read-aloud">([\s\S]*?)<\/div>/gi),
  ].map((m) => cleanHtml(m[1]).replace(/\s+/g, ' ').trim());
  return blocks.filter(Boolean).join('\n\n');
}

// A <strong>Label:</strong>-led paragraph (Treasure, Reward, …), flattened to text.
function extractLabeledParagraph(html, label) {
  const re = new RegExp(`<p[^>]*>\\s*<strong>${label}:</strong>([\\s\\S]*?)</p>`, 'i');
  const m = html.match(re);
  return m ? cleanHtml(m[1]).replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim() : '';
}

// Combatant names = the token link in each <section class="encounter"> header
// whose actor id is NOT a hazard. (Hazards share that markup, so they're
// filtered by id; body-prose actor refs like props are ignored.)
function extractCreatures(html, hazardIndex) {
  const names = [];
  for (const sec of html.matchAll(/<section class="encounter">([\s\S]*?)<\/section>/gi)) {
    const link = sec[1].match(/<span class="link">@UUID\[Actor\.([A-Za-z0-9]+)\]\{([^}]*)\}/i);
    if (link && !hazardIndex[link[1]] && link[2].trim()) names.push(link[2].trim());
  }
  return [...new Set(names)];
}

// Every distinct hazard referenced anywhere in the page, enriched from the dump.
function extractHazards(html, hazardIndex) {
  const seen = new Set();
  const out = [];
  for (const m of html.matchAll(/@UUID\[Actor\.([A-Za-z0-9]+)\]/g)) {
    const h = hazardIndex[m[1]];
    if (h && !seen.has(m[1])) {
      seen.add(m[1]);
      out.push(h);
    }
  }
  return out;
}

// Body = the page HTML minus its heading and read-aloud blocks, cleaned.
function extractBody(html) {
  const stripped = html
    .replace(/<h2\b[^>]*>[\s\S]*?<\/h2>/i, '')
    .replace(/<p class="read-aloud">[\s\S]*?<\/p>/gi, '')
    .replace(/<div class="read-aloud">[\s\S]*?<\/div>/gi, '');
  return cleanHtml(stripped);
}

// --- dump → docs -----------------------------------------------------------

function buildHazardIndex(dump) {
  const idx = {};
  for (const h of dump.hazards || []) {
    const sys = h.system || {};
    idx[h._id] = {
      name: h.name,
      level: sys.details?.level?.value ?? null,
      // This module stores every hazard's Stealth DC in stealth.value; keep the
      // .dc fallback in case a future dump uses the other field.
      stealthDc: sys.attributes?.stealth?.value ?? sys.attributes?.stealth?.dc ?? null,
      complex: !!sys.details?.isComplex,
    };
  }
  return idx;
}

const isFeaturesPage = (name) => /\bFeatures$/i.test(name || '');
const isRoomPage = (page, moduleId) =>
  page.flags?.[moduleId]?.pageNumberClass === 'location' || /^[A-Z]\d*\.\s/.test(page.name || '');

function transformDump(dump) {
  const moduleId = dump.module;
  const hazardIndex = buildHazardIndex(dump);
  const rooms = [];
  const features = [];

  for (const journal of dump.journals || []) {
    const chapter = journal.name;
    const pages = [...(journal.pages || [])].sort((a, b) => (a.sort || 0) - (b.sort || 0));
    let currentSite = null;

    for (const page of pages) {
      const html = page.text?.content || '';
      if (isFeaturesPage(page.name)) {
        currentSite = page.name.replace(/\s*Features$/i, '').trim();
        features.push({
          id: `${ID_PREFIX}-features-${slug(currentSite)}`,
          name: page.name,
          site: currentSite,
          chapter,
          sort: page.sort || 0,
          isFeatures: true,
          body: extractBody(html),
          checks: extractChecks(html),
          notes: '',
        });
        continue;
      }
      if (!isRoomPage(page, moduleId)) continue;

      const flagCode = page.flags?.[moduleId]?.pageNumber || null;
      const heading = parseHeading(html, page.name);
      const code = flagCode || heading.code;
      rooms.push({
        id: `${ID_PREFIX}-${slug(code || page.name)}`,
        code,
        name: heading.name,
        site: currentSite || chapter, // Ch 9 rooms have no Features page — fall back to chapter.
        chapter,
        sort: page.sort || 0,
        encounterLabel: heading.encounterLabel,
        readAloud: extractReadAloud(html),
        body: extractBody(html),
        checks: extractChecks(html),
        creatures: extractCreatures(html, hazardIndex),
        hazards: extractHazards(html, hazardIndex),
        treasure: extractLabeledParagraph(html, 'Treasure'),
        reward: extractLabeledParagraph(html, 'Reward'),
        notes: '',
      });
    }
  }

  return {
    rooms,
    features,
    stats: {
      journals: (dump.journals || []).length,
      rooms: rooms.length,
      features: features.length,
      hazards: Object.keys(hazardIndex).length,
      checks: rooms.reduce((n, r) => n + r.checks.length, 0),
    },
  };
}

// Preserve GM-authored `notes` (campaign significance, #1078) across a
// re-import: the transform always emits notes:'' , so without this a re-run
// would wipe every note the GM wrote. Carries over the existing non-empty note
// for any doc id that still exists; new/renamed ids just keep their empty note.
function mergeNotes(docs, existingDocs) {
  const byId = new Map();
  for (const d of existingDocs || []) {
    if (d && d.id != null && d.notes) byId.set(String(d.id), d.notes);
  }
  return docs.map((d) => (byId.has(d.id) ? { ...d, notes: byId.get(d.id) } : d));
}

module.exports = {
  transformDump,
  mergeNotes,
  parseCheck,
  deriveCheckLabel,
  extractChecks,
  renderChecksInline,
  cleanHtml,
  flattenUuids,
  stripInlineRolls,
  parseHeading,
  extractReadAloud,
  extractLabeledParagraph,
  extractCreatures,
  extractHazards,
  extractBody,
  buildHazardIndex,
  transformDump,
};

// --- CLI -------------------------------------------------------------------

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const args = process.argv.slice(2);
  const dumpPath = args.find((a) => !a.startsWith('--'));
  const outIdx = args.indexOf('--out');
  const postIdx = args.indexOf('--post');
  if (!dumpPath) {
    console.error('Usage: node scripts/importAdventureRooms.js <dump.json> [--out <file>] [--post <baseUrl>]');
    process.exit(1);
  }

  const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  const { rooms, features, stats } = transformDump(dump);
  const docs = [...features, ...rooms];
  console.log(`Parsed ${stats.rooms} rooms + ${stats.features} site features from ${stats.journals} journals (${stats.checks} checks, ${stats.hazards} hazards).`);

  const post = postIdx !== -1 ? args[postIdx + 1] : null;
  if (post) {
    const url = `${post.replace(/\/$/, '')}/api/gm/import/room`;
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
      headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
      headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
    }
    (async () => {
      // Preserve any GM notes already in the live store (#1078) before POSTing.
      // /api/content is public (read), so no auth is needed for this fetch.
      let toPost = docs;
      try {
        const contentRes = await fetch(`${post.replace(/\/$/, '')}/api/content`);
        if (contentRes.ok) {
          const content = await contentRes.json();
          const existing = (content.payload || content).room || [];
          toPost = mergeNotes(docs, existing);
          const kept = toPost.filter((d) => d.notes).length;
          if (kept) console.log(`Preserved ${kept} existing GM note(s).`);
        }
      } catch {
        console.warn('Could not read existing rooms to preserve notes — proceeding without merge.');
      }
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ docs: toPost }) });
      const text = await res.text();
      console.log(`POST ${url} → ${res.status}: ${text}`);
      if (!res.ok) process.exit(1);
    })();
  } else {
    const out = outIdx !== -1 ? args[outIdx + 1] : `${dumpPath.replace(/\.json$/, '')}.rooms.json`;
    fs.writeFileSync(out, JSON.stringify(docs, null, 2));
    console.log(`Wrote ${docs.length} docs → ${path.resolve(out)}`);
  }
}
