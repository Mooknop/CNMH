#!/usr/bin/env node
/*
 * Fetches the live CampaignContent snapshot from the production Durable Object
 * and writes it to src/data/snapshot/<collection>.json — the canonical seed
 * source, one file per collection (sharded from the old monolithic snapshot.json
 * so content PRs no longer collide on a single 20k-line file).
 *
 * Run:  node scripts/snapshotContent.js [<base-url>]
 *   or: CNMH_SNAPSHOT_URL=https://... node scripts/snapshotContent.js
 *
 * Default base URL: https://cnmh.mooknop.workers.dev
 * /api/content is public — no auth required.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_BASE = 'https://cnmh.mooknop.workers.dev';
const COLLECTION_KEYS = ['quest', 'faction', 'calendar', 'lore', 'trait', 'character', 'item', 'spell', 'effect', 'rune', 'image', 'theme'];
const REQUIRED_NON_EMPTY = ['character', 'quest'];

const baseUrl = (process.argv[2] || process.env.CNMH_SNAPSHOT_URL || DEFAULT_BASE).replace(/\/$/, '');
const endpoint = `${baseUrl}/api/content`;
const outDir = path.join(__dirname, '..', 'src', 'data', 'snapshot');

(async () => {
  console.log(`Fetching ${endpoint} ...`);
  let res;
  try {
    res = await fetch(endpoint);
  } catch (err) {
    console.error(`  ✗ Fetch failed: ${err.message}`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`  ✗ HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  let body;
  try {
    body = await res.json();
  } catch (err) {
    console.error(`  ✗ Response is not JSON: ${err.message}`);
    process.exit(1);
  }

  // Unwrap the /api/content envelope ({ payload: {...} }) or a bare snapshot.
  const snapshot =
    body && body.payload && typeof body.payload === 'object' ? body.payload : body;

  // Guard: reject if required collections are missing or empty — an error page
  // or empty response must never clobber the committed seed.
  for (const key of REQUIRED_NON_EMPTY) {
    if (!Array.isArray(snapshot[key]) || snapshot[key].length === 0) {
      console.error(
        `  ✗ Guard failed: "${key}" is missing or empty. Aborting to protect the committed seed.`
      );
      process.exit(1);
    }
  }

  // Build output with a stable key order, and within each collection sort docs
  // by `id`, so a no-op DO pull yields a zero diff (#632). The DO returns docs in
  // storage order, which otherwise reshuffles the seed on every pull and drowns
  // real drift in reorder noise. Sort is code-unit (locale-independent) for
  // deterministic output across machines/CI; docs without an `id` sink to the end.
  const byId = (a, b) => {
    const x = a && a.id != null ? String(a.id) : '￿';
    const y = b && b.id != null ? String(b.id) : '￿';
    return x < y ? -1 : x > y ? 1 : 0;
  };
  fs.mkdirSync(outDir, { recursive: true });
  for (const key of COLLECTION_KEYS) {
    const arr = Array.isArray(snapshot[key]) ? snapshot[key] : [];
    const sorted = [...arr].sort(byId);
    fs.writeFileSync(path.join(outDir, `${key}.json`), JSON.stringify(sorted, null, 2) + '\n');
    console.log(`  ${key.padEnd(10)} ${sorted.length} docs`);
  }
  console.log(`\n✓ Written to ${path.relative(process.cwd(), outDir)}/<collection>.json`);
})();
