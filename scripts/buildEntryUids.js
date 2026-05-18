#!/usr/bin/env node
/*
 * Slice 1 (one-time, dev-only — NOT bundled, NOT run by the app).
 *
 * Stamps a stable unique `uid` on EVERY inventory entry (top-level and every
 * entry nested in container contents, recursively) across the 5 bundled
 * character sheets. uid lets the durable live-loadout layer
 * (cnmh_loadout_<characterId>, later slices) target one specific entry and
 * makes duplicate items independently trackable.
 *
 * Idempotent: an entry that already has a non-empty `uid` is left untouched;
 * only missing ones are minted. Bundled uids are deterministic and readable
 * (`<charId>-<n>`, DFS order) for clean diffs; the GM editor mints random ids
 * (src/utils/uid.newEntryUid) for entries added at runtime — the two schemes
 * never collide.
 *
 * uid is inert metadata: bulk ignores it and resolution merely carries it, so
 * stamping changes no player-visible behaviour. The authoritative guarantees
 * (uniqueness, resolution carry-through, lossless GM round-trip) live in
 * src/data/entryUids.bundled.test.js.
 *
 * Run:  node scripts/buildEntryUids.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
// Order mirrors src/data/index.js `sampleCharacters`.
const CHARACTER_FILES = ['AshkaBGosh', 'Blu-Kakke', 'IzzyUncut', 'JadeInferno', 'Pellias'];

// Recursively rebuild an entry list, putting `uid` first (clean diffs) and
// preserving every other key + nested container contents verbatim.
const stampList = (list, mint) =>
  (Array.isArray(list) ? list : []).map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const uid =
      typeof entry.uid === 'string' && entry.uid.trim() ? entry.uid : mint();
    const out = { uid, ...entry };
    out.uid = uid;
    if (out.container && Array.isArray(out.container.contents)) {
      out.container = {
        ...out.container,
        contents: stampList(out.container.contents, mint),
      };
    }
    return out;
  });

const collectUids = (list, acc = []) => {
  (Array.isArray(list) ? list : []).forEach((e) => {
    if (e && typeof e === 'object') {
      acc.push(e.uid);
      if (e.container && Array.isArray(e.container.contents)) {
        collectUids(e.container.contents, acc);
      }
    }
  });
  return acc;
};

let failed = false;
const summary = [];

CHARACTER_FILES.forEach((base) => {
  const file = path.join(DATA_DIR, `${base}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const charId = data.id || base;
  let n = 0;
  const mint = () => `${charId}-${n++}`;
  const stamped = stampList(data.inventory || [], mint);

  const uids = collectUids(stamped);
  const unique = new Set(uids);
  const allValid = uids.every((u) => typeof u === 'string' && u.trim());
  if (uids.length !== unique.size || !allValid) {
    failed = true;
    console.error(
      `  ✗ ${base}: ${uids.length} entries but ${unique.size} unique uids` +
        (allValid ? '' : ' (some empty/invalid)')
    );
  }
  data.inventory = stamped;
  fs.writeFileSync(file, JSON.stringify(data, null, 2)); // 2-space, no trailing NL (matches repo)
  summary.push(`  ✓ ${base}: ${uids.length} entries, ${unique.size} unique uids`);
});

if (failed) {
  console.error('\n✗ uid uniqueness gate failed. Fix by hand.');
  process.exit(1);
}
summary.forEach((s) => console.log(s));
console.log(`\n✓ Stamped uids on ${CHARACTER_FILES.length} character sheets.`);
