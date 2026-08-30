#!/usr/bin/env node
/*
 * Node CLI for the research-topic import (#1840). Thin wrapper over the pure
 * transform in ./importResearchTopics.mjs — reads the (gitignored) Foundry
 * journal dump and either prints a summary or POSTs the docs to the live
 * content DO's bulk import endpoint for the `research` collection.
 *
 *   node scripts/importResearchTopicsCli.js <dump.json> [--post <baseUrl>]
 *
 * Default (no --post): prints a summary only — id, title, level, per-source
 * name + Maximum RP, tier RPs, and total max RP. Never prints tier prose: the
 * dump is gitignored verbatim Paizo book text and this repo is public, so a
 * terminal transcript that could get pasted anywhere must stay prose-free.
 *
 * With --post it uploads to <baseUrl>/api/gm/import/research; that route is
 * Cloudflare Access-gated, so set CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET
 * (a service token) in the env or the POST will 403. NOTE: --post also
 * requires slice S1 (#1839) to have landed first — it adds `research` to the
 * worker's COLLECTIONS allowlist; until then the DO rejects the collection.
 */

const fs = require('fs');

const args = process.argv.slice(2);
const dumpPath = args.find((a) => !a.startsWith('--'));
const postIdx = args.indexOf('--post');
if (!dumpPath) {
  console.error('Usage: node scripts/importResearchTopicsCli.js <dump.json> [--post <baseUrl>]');
  process.exit(1);
}

// The transform is native ESM (.mjs — matches scripts/importAdventureRooms.mjs
// so both stay reachable from a future in-app upload button without a Vite
// CJS-interop issue), so this CJS CLI reaches it via dynamic import().
let transformResearchTopics;
let mergeGmFields;

// POST the docs, preserving any live-only fields already on the existing docs
// (#1078-style GM merge) via a read + mergeGmFields before uploading.
async function postCollection(baseUrl, docs) {
  const base = baseUrl.replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
  }
  let toPost = docs;
  try {
    // /api/content is public (read), so no auth is needed for this fetch.
    const contentRes = await fetch(`${base}/api/content`);
    if (contentRes.ok) {
      const content = await contentRes.json();
      const existing = (content.payload || content).research || [];
      toPost = mergeGmFields(docs, existing);
    }
  } catch {
    console.warn('Could not read existing research docs to preserve GM fields — proceeding without merge.');
  }
  const url = `${base}/api/gm/import/research`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ docs: toPost }) });
  const text = await res.text();
  console.log(`POST ${url} → ${res.status}: ${text}`);
  return res.ok;
}

function summarize(docs) {
  console.log(`Parsed ${docs.length} research topic${docs.length === 1 ? '' : 's'}.`);
  for (const d of docs) {
    const totalMaxRp = d.sources.reduce((n, s) => n + s.maxRp, 0);
    const sourceSummary = d.sources.map((s) => `${s.name} (max ${s.maxRp})`).join(', ');
    const tierRps = d.unlocks.map((u) => u.rp).join(', ');
    console.log(`- ${d.id}: "${d.title}" (level ${d.level})`);
    console.log(`    sources (${d.sources.length}): ${sourceSummary}`);
    console.log(`    tiers (${d.unlocks.length}): ${tierRps} RP — total max RP across sources: ${totalMaxRp}`);
  }
}

async function main() {
  ({ transformResearchTopics, mergeGmFields } = await import('./importResearchTopics.mjs'));

  const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  const docs = transformResearchTopics(dump);

  const post = postIdx !== -1 ? args[postIdx + 1] : null;
  if (post) {
    const ok = await postCollection(post, docs);
    if (!ok) process.exit(1);
  } else {
    summarize(docs);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
