/*
 * PURE transform core for the GM Adventure Room Guide (#1074): turns a raw
 * adventure-module journal dump (from scripts/exportAdventureJournals.foundryMacro.js,
 * PR #1073) into `room` collection docs. No fs / fetch / process here — this
 * module is imported by BOTH the Node CLI (scripts/importAdventureRoomsCli.js)
 * AND the in-app GM upload button (src/components/gm/RoomsImportButton.jsx), so
 * it must stay side-effect-free and browser-safe. It's CommonJS (module.exports)
 * so the CJS CLI can require it; Vite/Vitest import it via CJS→ESM interop.
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

// --- treasure (#1085) --------------------------------------------------------

// Coins are named exactly "<Metal> Pieces" with the denomination in the unit
// price ({gp:1}/{sp:1}/{cp:1}/{pp:1}); everything else of type "treasure" is a
// valuable (art/gem/jewelry) with a gp price. stackGroup is absent in this
// module, so match by name.
const COIN_RE = /^(?:Gold|Silver|Copper|Platinum) Pieces$/i;

// A price {gp,sp,cp,pp} → its value in gp.
function coinValueGp(v) {
  if (!v || typeof v !== 'object') return 0;
  return (v.pp || 0) * 10 + (v.gp || 0) + (v.sp || 0) / 10 + (v.cp || 0) / 100;
}

// Classify one embedded loot-actor item into a cache contribution:
//   { kind:'coin', gp }        — folds into the cache gold total
//   { kind:'item', entry }     — real item, ref = PF2e slug (resolved in-app)
//   { kind:'valuable', entry } — art/gem, no ref, per-unit gp `value`
//   { kind:'story', entry }    — slug-less plot item (key/collection/map)
function classifyLootItem(it) {
  const sys = it.system || {};
  const qty = sys.quantity ?? 1;
  const unitGp = coinValueGp(sys.price?.value);
  if (it.type === 'treasure') {
    if (COIN_RE.test(it.name || '')) return { kind: 'coin', gp: unitGp * qty };
    return { kind: 'valuable', entry: { name: it.name, qty, value: Math.round(unitGp) } };
  }
  if (sys.slug) return { kind: 'item', entry: { ref: sys.slug, name: it.name, qty } };
  return { kind: 'story', entry: { name: it.name, qty } };
}

// Actor ids referenced inside a room's Treasure paragraph(s) — the loot chests
// whose contents make up the cache. (Uses the raw paragraph HTML, before the
// UUID flattening that `extractLabeledParagraph` does.)
function extractTreasureActorRefs(html) {
  const refs = [];
  for (const m of html.matchAll(/<p[^>]*>\s*<strong>Treasure:<\/strong>([\s\S]*?)<\/p>/gi)) {
    for (const u of m[1].matchAll(/@UUID\[Actor\.([A-Za-z0-9]+)\]/g)) refs.push(u[1]);
  }
  return [...new Set(refs)];
}

// Build a room's structured treasure cache by merging every referenced loot
// actor's embedded items: coins → gold, real items → refs, valuables/story →
// name entries. Always returns { gold, items } (empty for prose-only rooms,
// which the GM fills in the T3 editor).
function extractTreasureCache(html, lootIndex) {
  let gold = 0;
  const items = [];
  for (const id of extractTreasureActorRefs(html)) {
    const actor = lootIndex[id];
    if (!actor) continue;
    for (const it of actor.items || []) {
      const c = classifyLootItem(it);
      if (c.kind === 'coin') gold += c.gp;
      else items.push(c.entry);
    }
  }
  return { gold: Math.round(gold), items };
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

// loot-actor id → the actor (with its embedded `items`), for treasure caches.
function buildLootIndex(dump) {
  const idx = {};
  for (const la of dump.lootActors || []) idx[la._id] = la;
  return idx;
}

const isFeaturesPage = (name) => /\bFeatures$/i.test(name || '');
const isRoomPage = (page, moduleId) =>
  page.flags?.[moduleId]?.pageNumberClass === 'location' || /^[A-Z]\d*\.\s/.test(page.name || '');

function transformDump(dump) {
  const moduleId = dump.module;
  const hazardIndex = buildHazardIndex(dump);
  const lootIndex = buildLootIndex(dump);
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
        treasureCache: extractTreasureCache(html, lootIndex),
        reward: extractLabeledParagraph(html, 'Reward'),
        notes: '',
      });
    }
  }

  const cachesWithLoot = rooms.filter((r) => r.treasureCache.gold || r.treasureCache.items.length).length;
  return {
    rooms,
    features,
    stats: {
      journals: (dump.journals || []).length,
      rooms: rooms.length,
      features: features.length,
      hazards: Object.keys(hazardIndex).length,
      lootActors: Object.keys(lootIndex).length,
      checks: rooms.reduce((n, r) => n + r.checks.length, 0),
      treasureCaches: cachesWithLoot,
    },
  };
}

// Preserve GM-authored fields across a re-import. The transform re-derives
// notes ('') and treasureCache (from the dump) every run, so without this a
// re-run would wipe the GM's campaign notes (#1078) and any curated or
// already-distributed treasure cache (#1085). For every doc id that still
// exists, carry over the existing `notes` (if non-empty), `treasureCache` (the
// GM's copy wins once a room has been imported — even an empty one is a GM
// decision), and `distributedAt` (never regress distribution state). New ids
// keep the freshly transformed values.
function mergeGmFields(docs, existingDocs) {
  const byId = new Map();
  for (const d of existingDocs || []) {
    if (d && d.id != null) byId.set(String(d.id), d);
  }
  return docs.map((d) => {
    const ex = byId.get(d.id);
    if (!ex) return d;
    const merged = { ...d };
    if (ex.notes) merged.notes = ex.notes;
    if (ex.treasureCache) merged.treasureCache = ex.treasureCache;
    if (ex.distributedAt != null) merged.distributedAt = ex.distributedAt;
    return merged;
  });
}

module.exports = {
  transformDump,
  mergeGmFields,
  buildLootIndex,
  classifyLootItem,
  coinValueGp,
  extractTreasureActorRefs,
  extractTreasureCache,
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
