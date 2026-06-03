#!/usr/bin/env node
/*
 * Fetches the live CampaignContent snapshot from the production Durable Object
 * and writes it to src/data/snapshot.json — the canonical seed source.
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
const COLLECTION_KEYS = ['quest', 'faction', 'calendar', 'lore', 'trait', 'character', 'item', 'spell', 'image', 'theme'];
const REQUIRED_NON_EMPTY = ['character', 'quest'];

const baseUrl = (process.argv[2] || process.env.CNMH_SNAPSHOT_URL || DEFAULT_BASE).replace(/\/$/, '');
const endpoint = `${baseUrl}/api/content`;
const outPath = path.join(__dirname, '..', 'src', 'data', 'snapshot.json');

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

  // Build output with a stable key order for clean diffs.
  const out = {};
  for (const key of COLLECTION_KEYS) {
    out[key] = Array.isArray(snapshot[key]) ? snapshot[key] : [];
  }

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

  for (const key of COLLECTION_KEYS) {
    console.log(`  ${key.padEnd(10)} ${out[key].length} docs`);
  }
  console.log(`\n✓ Written to ${path.relative(process.cwd(), outPath)}`);
})();
