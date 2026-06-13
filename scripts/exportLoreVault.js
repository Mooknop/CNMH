#!/usr/bin/env node
/*
 * One-time (re-runnable) export of the live CampaignContent `lore` collection
 * into `lore-vault/` — an Obsidian-openable, git-managed vault (epic #285,
 * slice #286).
 *
 * Run:  node scripts/exportLoreVault.js [<base-url>]
 *   or: CNMH_SNAPSHOT_URL=https://... node scripts/exportLoreVault.js
 *
 * Default base URL: https://cnmh.mooknop.workers.dev
 * /api/content is public — no auth required (same pattern as snapshotContent.js).
 *
 * Idempotent: re-running regenerates the vault deterministically (docs sorted by
 * id) so `git status` is clean when nothing changed upstream.
 */

const fs = require('fs');
const path = require('path');
const { serializeDoc } = require('./lib/loreVault');

const DEFAULT_BASE = 'https://cnmh.mooknop.workers.dev';
const baseUrl = (process.argv[2] || process.env.CNMH_SNAPSHOT_URL || DEFAULT_BASE).replace(/\/$/, '');
const endpoint = `${baseUrl}/api/content`;
const vaultDir = path.join(__dirname, '..', 'lore-vault');

// Remove every generated category folder (anything that isn't a top-level file
// such as README.md or the .obsidian workspace) so renamed/deleted entries
// don't leave stragglers behind. Re-created fresh on each run.
function clearCategoryFolders() {
  if (!fs.existsSync(vaultDir)) return;
  for (const entry of fs.readdirSync(vaultDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '.obsidian') continue;
    fs.rmSync(path.join(vaultDir, entry.name), { recursive: true, force: true });
  }
}

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

  const snapshot = body && body.payload && typeof body.payload === 'object' ? body.payload : body;
  const lore = Array.isArray(snapshot.lore) ? snapshot.lore : [];

  // Guard: an error page or empty response must never wipe the committed vault.
  if (lore.length === 0) {
    console.error('  ✗ Guard failed: "lore" is missing or empty. Aborting to protect the committed vault.');
    process.exit(1);
  }

  const idToTitle = new Map(lore.map((d) => [d.id, d.title]));

  // Deterministic order for clean re-run diffs.
  const docs = [...lore].sort((a, b) => String(a.id).localeCompare(String(b.id)));

  clearCategoryFolders();
  fs.mkdirSync(vaultDir, { recursive: true });

  const counts = {};
  const dropped = [];
  for (const doc of docs) {
    const { category, filename, markdown } = serializeDoc(doc, idToTitle);
    const dir = path.join(vaultDir, category || 'Uncategorized');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), markdown);
    counts[category || 'Uncategorized'] = (counts[category || 'Uncategorized'] || 0) + 1;

    // Surface dead `related` pointers that were dropped (ids with no doc).
    for (const id of doc.related || []) {
      if (!idToTitle.has(id)) dropped.push(`${doc.id} → ${id}`);
    }
  }

  for (const category of Object.keys(counts).sort()) {
    console.log(`  ${category.padEnd(14)} ${counts[category]} docs`);
  }
  console.log(`  ${'TOTAL'.padEnd(14)} ${docs.length} docs`);

  if (dropped.length) {
    console.log(`\n  ⚠ Dropped ${dropped.length} dead "related" pointer(s) (no matching doc; app already ignores these):`);
    for (const d of dropped) console.log(`     ${d}`);
  }

  console.log(`\n✓ Vault written to ${path.relative(process.cwd(), vaultDir)}`);
})();
