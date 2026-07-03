#!/usr/bin/env node
/*
 * Node CLI for the adventure-room import (#1074). Thin wrapper over the pure
 * transform in ./importAdventureRooms.js — reads a dump file and either writes
 * the docs to disk or POSTs them to the live DO's bulk import endpoint.
 *
 *   node scripts/importAdventureRoomsCli.js <dump.json> [--out <file>]
 *                                           [--post <baseUrl>]
 *
 * Default: writes <dump>.rooms.json next to the dump. With --post it uploads to
 * <baseUrl>/api/gm/import/room; that route is Cloudflare Access-gated, so set
 * CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET (a service token) in the env or
 * the POST will 403.
 *
 * NOTE: most GMs won't need this — the in-app "Import rooms" button
 * (World → Rooms) does the same transform + upload in the browser with no
 * command line. This CLI is the scriptable/automation path.
 */

const fs = require('fs');
const path = require('path');
const { transformDump, mergeGmFields } = require('./importAdventureRooms');

const args = process.argv.slice(2);
const dumpPath = args.find((a) => !a.startsWith('--'));
const outIdx = args.indexOf('--out');
const postIdx = args.indexOf('--post');
if (!dumpPath) {
  console.error('Usage: node scripts/importAdventureRoomsCli.js <dump.json> [--out <file>] [--post <baseUrl>]');
  process.exit(1);
}

const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
const { rooms, features, stats } = transformDump(dump);
const docs = [...features, ...rooms];
console.log(`Parsed ${stats.rooms} rooms + ${stats.features} site features from ${stats.journals} journals (${stats.checks} checks, ${stats.hazards} hazards, ${stats.treasureCaches} treasure caches).`);

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
        toPost = mergeGmFields(docs, existing);
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
