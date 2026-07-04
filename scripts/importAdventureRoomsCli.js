#!/usr/bin/env node
/*
 * Node CLI for the adventure-room + chapter-event import (#1074/#1112). Thin
 * wrapper over the pure transform in ./importAdventureRooms.js — reads a dump
 * file and either writes the docs to disk or POSTs them to the live DO's bulk
 * import endpoint. Both `room` and `event` are distinct capture-only
 * collections, so each is merged and uploaded separately.
 *
 *   node scripts/importAdventureRoomsCli.js <dump.json> [--out <file>]
 *                                           [--post <baseUrl>]
 *
 * Default: writes <dump>.rooms.json and <dump>.events.json next to the dump.
 * With --post it uploads to <baseUrl>/api/gm/import/{room,event}; that route is
 * Cloudflare Access-gated, so set CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET
 * (a service token) in the env or the POST will 403.
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
const { rooms, features, events, stats } = transformDump(dump);
const roomDocs = [...features, ...rooms];
console.log(
  `Parsed ${stats.rooms} rooms + ${stats.features} site features + ${stats.events} events from ${stats.journals} journals ` +
    `(${stats.checks} checks, ${stats.hazards} hazards, ${stats.treasureCaches} treasure caches).`,
);

const post = postIdx !== -1 ? args[postIdx + 1] : null;

// POST one collection's docs, preserving GM-authored fields already in the live
// store (#1078/#1112) via a read + mergeGmFields before uploading.
async function postCollection(baseUrl, collection, docs) {
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
      const existing = (content.payload || content)[collection] || [];
      toPost = mergeGmFields(docs, existing);
    }
  } catch {
    console.warn(`Could not read existing ${collection} docs to preserve GM fields — proceeding without merge.`);
  }
  const url = `${base}/api/gm/import/${collection}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ docs: toPost }) });
  const text = await res.text();
  console.log(`POST ${url} → ${res.status}: ${text}`);
  return res.ok;
}

if (post) {
  (async () => {
    const okRooms = roomDocs.length ? await postCollection(post, 'room', roomDocs) : true;
    const okEvents = events.length ? await postCollection(post, 'event', events) : true;
    if (!okRooms || !okEvents) process.exit(1);
  })();
} else {
  const base = outIdx !== -1 ? args[outIdx + 1].replace(/\.rooms\.json$|\.json$/, '') : dumpPath.replace(/\.json$/, '');
  const roomOut = `${base}.rooms.json`;
  const eventOut = `${base}.events.json`;
  fs.writeFileSync(roomOut, JSON.stringify(roomDocs, null, 2));
  fs.writeFileSync(eventOut, JSON.stringify(events, null, 2));
  console.log(`Wrote ${roomDocs.length} room docs → ${path.resolve(roomOut)}`);
  console.log(`Wrote ${events.length} event docs → ${path.resolve(eventOut)}`);
}
