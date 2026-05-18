#!/usr/bin/env node
/*
 * Slice 3 (one-time, dev-only — NOT bundled, NOT run by the app).
 *
 * Extracts EVERY distinct inventory item (including items nested in container
 * contents) from the 5 bundled character sheets into a single shared catalog
 * (src/data/items.json), then rewrites each character's inventory so every
 * entry is a pure reference: { ref, quantity, [invested], [container:{contents}] }.
 *
 * Catalog candidate = the item minus per-character fields (quantity, invested,
 * top-level id) and, for containers, minus contents (capacity/ignored are
 * intrinsic and stay). Items are keyed by slug(name); if two characters carry
 * the same-named item with DIFFERENT shared definitions the script aborts and
 * reports the conflict — nothing is written until the gate passes.
 *
 * Gate (in-memory, before any file write): for every character,
 *   resolve(refInventory, catalog) deep-equals the original inventory
 *   (ignoring item-level id, which resolution restamps), AND
 *   bulk(resolved) === bulk(original).
 * The authoritative gate is src/data/itemCatalog.bundled.test.js, which runs
 * the REAL src/utils functions in CI; this in-script check is a fast fail-safe
 * and produces the pre-catalog fixture that test compares against.
 *
 * Run:  node scripts/buildItemCatalog.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const FIXTURE_DIR = path.join(DATA_DIR, '__fixtures__');
// Order mirrors src/data/index.js `sampleCharacters`.
const CHARACTER_FILES = ['AshkaBGosh', 'Blu-Kakke', 'IzzyUncut', 'JadeInferno', 'Pellias'];

// Must match contentUtils.slugify exactly (catalog ids == resolution lookup keys).
const slugify = (str) =>
  String(str || '')
    .toLowerCase()
    .trim()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';

const clone = (v) => JSON.parse(JSON.stringify(v));

// Stable stringify for deep-equality / conflict detection (key-order agnostic).
const stable = (v) => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
};
const deepEq = (a, b) => stable(a) === stable(b);

// ---- bulk: mirrors src/utils/InventoryUtils.calculateItemsBulk ------------
const calculateItemsBulk = (items) => {
  if (!Array.isArray(items)) return 0;
  return items.reduce((total, item) => {
    const itemBulk = (item.weight || 0) * (item.quantity || 1);
    let contentsBulk = 0;
    if (item.container && Array.isArray(item.container.contents)) {
      contentsBulk = calculateItemsBulk(item.container.contents);
    }
    const ignoredBulk = (item.container && item.container.ignored) || 0;
    return total + itemBulk + Math.max(0, contentsBulk - ignoredBulk);
  }, 0);
};

// ---- resolution: mirrors src/utils/contentUtils.resolveInventory* ---------
const resolveInventory = (list, catalogMap) =>
  (Array.isArray(list) ? list : []).map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    if (entry.ref == null) return entry; // (no inline items remain post-rewrite)
    const quantity = entry.quantity != null ? entry.quantity : 1;
    const cat = catalogMap.get(String(entry.ref));
    if (!cat) return { name: `(unknown item: ${entry.ref})`, weight: 0, quantity };
    const resolved = { ...cat, quantity, id: entry.id || cat.id };
    if (entry.invested != null) resolved.invested = entry.invested;
    if (cat.container) {
      resolved.container = {
        ...cat.container,
        contents: resolveInventory(entry.container && entry.container.contents, catalogMap),
      };
    }
    return resolved;
  });

// Strip item-level `id` recursively (resolution restamps it; the original
// sheets only sporadically carry one, so it is "stray" for equality).
const stripIds = (list) =>
  (Array.isArray(list) ? list : []).map((it) => {
    if (!it || typeof it !== 'object') return it;
    const out = { ...it };
    delete out.id;
    if (out.container && Array.isArray(out.container.contents)) {
      out.container = { ...out.container, contents: stripIds(out.container.contents) };
    }
    return out;
  });

// ---- extraction ----------------------------------------------------------
const catalog = new Map(); // id -> candidate
const conflicts = [];

const candidateOf = (item) => {
  const c = clone(item);
  delete c.quantity;
  delete c.invested;
  delete c.id;
  if (c.container) {
    const { contents, ...intrinsic } = c.container; // drop per-character contents
    c.container = intrinsic;
  }
  return c;
};

const register = (item) => {
  const id = slugify(item.name);
  const cand = candidateOf(item);
  if (catalog.has(id)) {
    if (!deepEq(catalog.get(id), cand)) {
      conflicts.push({ id, name: item.name, a: catalog.get(id), b: cand });
    }
  } else {
    catalog.set(id, cand);
  }
};

const collect = (list) => {
  (Array.isArray(list) ? list : []).forEach((item) => {
    if (!item || typeof item !== 'object') return;
    register(item);
    if (item.container && Array.isArray(item.container.contents)) {
      collect(item.container.contents);
    }
  });
};

const toRef = (item) => {
  const ref = { ref: slugify(item.name), quantity: item.quantity != null ? item.quantity : 1 };
  if (item.invested != null) ref.invested = item.invested;
  if (item.container && Array.isArray(item.container.contents)) {
    ref.container = { contents: item.container.contents.map(toRef) };
  }
  return ref;
};

// ---- run -----------------------------------------------------------------
const sheets = CHARACTER_FILES.map((base) => {
  const file = path.join(DATA_DIR, `${base}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { base, file, data, originalInventory: clone(data.inventory || []) };
});

sheets.forEach((s) => collect(s.originalInventory));

if (conflicts.length) {
  console.error(`\n✗ ${conflicts.length} same-named item(s) have DIFFERENT shared definitions:`);
  conflicts.forEach((c) => {
    console.error(`\n  • ${c.name} (id "${c.id}")`);
    console.error(`    A: ${stable(c.a)}`);
    console.error(`    B: ${stable(c.b)}`);
  });
  console.error('\nResolve these by hand (rename the variant or align the data). Nothing written.');
  process.exit(1);
}

const catalogList = Array.from(catalog.entries())
  .map(([id, cand]) => ({ id, ...cand }))
  .sort((a, b) => a.id.localeCompare(b.id));
const catalogMap = new Map(catalogList.map((it) => [it.id, it]));

// In-memory gate BEFORE writing anything.
const fixture = {};
let failed = false;
sheets.forEach((s) => {
  const refInventory = s.originalInventory.map(toRef);
  const resolved = resolveInventory(refInventory, catalogMap);
  const okShape = deepEq(stripIds(resolved), stripIds(s.originalInventory));
  const okBulk = calculateItemsBulk(resolved) === calculateItemsBulk(s.originalInventory);
  fixture[s.data.id || s.base] = s.originalInventory;
  s.refInventory = refInventory;
  const tag = okShape && okBulk ? '✓' : '✗';
  console.log(
    `  ${tag} ${s.base}: ${s.originalInventory.length} entries · ` +
      `shape ${okShape ? 'ok' : 'MISMATCH'} · ` +
      `bulk ${calculateItemsBulk(resolved)} vs ${calculateItemsBulk(s.originalInventory)}`
  );
  if (!okShape || !okBulk) failed = true;
});

if (failed) {
  console.error('\n✗ Gate failed — resolution would not reproduce the original sheets. Nothing written.');
  process.exit(1);
}

// All good — write catalog, rewritten sheets, and the pre-catalog fixture.
fs.writeFileSync(path.join(DATA_DIR, 'items.json'), JSON.stringify({ items: catalogList }, null, 2));
sheets.forEach((s) => {
  const next = { ...s.data, inventory: s.refInventory };
  fs.writeFileSync(s.file, JSON.stringify(next, null, 2)); // 2-space, no trailing NL (matches repo)
});
if (!fs.existsSync(FIXTURE_DIR)) fs.mkdirSync(FIXTURE_DIR, { recursive: true });
fs.writeFileSync(
  path.join(FIXTURE_DIR, 'preCatalogInventories.json'),
  JSON.stringify(fixture, null, 2)
);

console.log(
  `\n✓ Wrote ${catalogList.length} catalog items, ${sheets.length} rewritten sheets, ` +
    `and the pre-catalog fixture. Gate passed.`
);
