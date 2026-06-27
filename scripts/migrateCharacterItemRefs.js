#!/usr/bin/env node
/*
 * One-off data migration: repoint retired flat consumable ids in live character
 * inventories to the current variant model, in the production CampaignContent DO.
 *
 * Why this can't ride the normal content apply: a character's `inventory` is a
 * LIVE_CHARACTER_FIELD (src/utils/gmApi.js) — preserved from the live doc and
 * NEVER overwritten by "Apply content update (diff)". So when the catalog moved
 * healing potions / elixirs of life to a single variant item (`healing-potion`
 * with Minor/Lesser/… variants, `elixir-of-life` with Minor/Lesser), the live
 * character inventories kept pointing at the old flat ids (`minor-healing-potion`
 * etc.). Those refs are now dangling (the flat items are gone from the catalog),
 * so the potions don't resolve in-app. The seed was already migrated; only the
 * live DO inventories are stale. This script fixes them at the source.
 *
 * A flat id maps to `{ ref: <variant item>, level: <variant level> }`, dropping
 * any stray fields the flat form carried. uid / quantity / container nesting and
 * every other field are preserved verbatim.
 *
 * Run:  node scripts/migrateCharacterItemRefs.js --dry-run        (read-only)
 *       GM_PUSH_TOKEN=… node scripts/migrateCharacterItemRefs.js  (writes)
 *   base url: argv[2] or CNMH_SNAPSHOT_URL or the production default.
 */

const DEFAULT_BASE = 'https://cnmh.mooknop.workers.dev';

// Retired flat id -> { ref, level } in the current variant catalog.
const REF_MAP = {
  'minor-healing-potion': { ref: 'healing-potion', level: 1 },
  'lesser-healing-potion': { ref: 'healing-potion', level: 3 },
  'minor-elixir-of-life': { ref: 'elixir-of-life', level: 1 },
};

// Repoint one inventory entry (and its nested container contents) in place,
// returning the migrated entry and counting how many refs changed.
function migrateEntry(entry, counter) {
  if (!entry || typeof entry !== 'object') return entry;
  let out = entry;
  const target = entry.ref != null ? REF_MAP[String(entry.ref)] : null;
  if (target) {
    out = { ...entry, ref: target.ref, level: target.level };
    counter.n += 1;
    counter.refs.push(`${entry.ref} -> ${target.ref}@${target.level}`);
  }
  if (out.container && Array.isArray(out.container.contents)) {
    out = {
      ...out,
      container: { ...out.container, contents: out.container.contents.map((e) => migrateEntry(e, counter)) },
    };
  }
  return out;
}

function migrateCharacter(doc) {
  const counter = { n: 0, refs: [] };
  const inventory = (Array.isArray(doc.inventory) ? doc.inventory : []).map((e) => migrateEntry(e, counter));
  return { changed: counter.n > 0, count: counter.n, refs: counter.refs, doc: { ...doc, inventory } };
}

function authHeaders() {
  const token = process.env.GM_PUSH_TOKEN;
  if (!token) {
    throw new Error('Writes need GM_PUSH_TOKEN (a Worker secret). Pass --dry-run to skip writes.');
  }
  return { Authorization: `Bearer ${token}` };
}

(async () => {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const baseUrl = (argv.find((a) => /^https?:\/\//.test(a)) || process.env.CNMH_SNAPSHOT_URL || DEFAULT_BASE).replace(/\/$/, '');

  const res = await fetch(`${baseUrl}/api/content`);
  if (!res.ok) {
    console.error(`  ✗ Couldn't read live content: HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const body = await res.json();
  const snapshot = body && body.payload && typeof body.payload === 'object' ? body.payload : body;
  const characters = Array.isArray(snapshot.character) ? snapshot.character : [];
  if (characters.length === 0) {
    console.error('  ✗ No characters in live content — aborting.');
    process.exit(1);
  }

  const headers = dryRun ? null : authHeaders();
  const plan = characters.map(migrateCharacter).filter((p) => p.changed);

  console.log(`${dryRun ? '[dry-run] ' : ''}Migrating character inventory refs against ${baseUrl}`);
  if (plan.length === 0) {
    console.log('  Nothing to migrate — no stale refs found.');
    return;
  }
  for (const p of plan) {
    console.log(`  ${p.doc.id}: ${p.count} ref(s)`);
    for (const r of p.refs) console.log(`      ${r}`);
  }

  if (dryRun) {
    console.log(`\n[dry-run] would PUT ${plan.length} character doc(s). Re-run without --dry-run (with GM_PUSH_TOKEN) to apply.`);
    return;
  }

  for (const p of plan) {
    const r = await fetch(`${baseUrl}/api/gm/character/${encodeURIComponent(p.doc.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(p.doc),
    });
    if (!r.ok) {
      console.error(`  ✗ PUT ${p.doc.id} failed: HTTP ${r.status} ${r.statusText}`);
      process.exit(1);
    }
    console.log(`  ✓ PUT ${p.doc.id}`);
  }
  console.log(`\n✓ Migrated ${plan.length} character doc(s). Re-pull the snapshot to capture the clean state.`);
})();
