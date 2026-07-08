#!/usr/bin/env node
/*
 * One-off backfill for room `claimed` accumulators (#1281 WB2).
 *
 * finalizeDrop only started stamping `claimed: { gold, itemsValue }` with this
 * slice, so rooms distributed before it have lost the claimed portion of their
 * cache (the cache was overwritten with the unclaimed remainder). This script
 * reconstructs it: value the room's ORIGINAL cache from the committed adventure
 * dump, subtract the live remainder, and write the difference as `claimed`.
 *
 *   node scripts/backfillRoomClaims.js [<baseUrl>] [--dump <rooms.json>] [--apply]
 *
 * Default base URL: https://cnmh.mooknop.workers.dev (reads are public).
 * Default dump: adventure-dumps/rooms.json (transformed room docs).
 * Dry-run by default — prints the per-room reconstruction. With --apply it
 * uploads via POST /api/gm/import/room (per-id upsert, archives prior
 * versions); that route is Cloudflare Access-gated, so set
 * CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET or the POST will 403.
 *
 * Only rooms with `distributedAt` set and no existing `claimed` are touched.
 * Rooms distributed and later reopened (stamp cleared) can't be detected and
 * are skipped. GM cache edits made after import make the reconstruction
 * approximate — review the dry run before applying.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_BASE = 'https://cnmh.mooknop.workers.dev';
const DEFAULT_DUMP = path.join(__dirname, '..', 'adventure-dumps', 'rooms.json');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dumpIdx = args.indexOf('--dump');
const dumpValue = dumpIdx !== -1 ? args[dumpIdx + 1] : null;
const dumpPath = dumpValue || DEFAULT_DUMP;
const baseUrl = (args.find((a) => !a.startsWith('--') && a !== dumpValue) || DEFAULT_BASE).replace(/\/$/, '');

// Per-unit gp value of a cache line — same order as src/utils/lootDrop.js
// lineUnitValue (catalog price when positive, else the line's inline value).
const lineUnitValue = (line, catalogById) => {
  const cat = line && line.ref ? catalogById.get(line.ref) : null;
  const price = cat ? Number(cat.price) : NaN;
  if (Number.isFinite(price) && price > 0) return price;
  const v = Number(line && line.value);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

const cacheItemsValue = (cache, catalogById) =>
  ((cache && cache.items) || []).reduce(
    (sum, line) => sum + Math.max(1, Math.floor(Number(line.qty) || 1)) * lineUnitValue(line, catalogById),
    0,
  );

const cacheGold = (cache) => Math.max(0, Number(cache && cache.gold) || 0);

(async () => {
  const originals = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  const originalById = new Map(originals.filter((d) => d && d.id != null).map((d) => [String(d.id), d]));

  console.log(`Fetching ${baseUrl}/api/content ...`);
  const res = await fetch(`${baseUrl}/api/content`);
  if (!res.ok) {
    console.error(`  ✗ HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const body = await res.json();
  const content = body && body.payload && typeof body.payload === 'object' ? body.payload : body;
  const rooms = content.room || [];
  const catalogById = new Map();
  for (const r of content.rune || []) catalogById.set(r.id, r);
  for (const i of content.item || []) catalogById.set(i.id, i); // item wins on collision

  const updates = [];
  for (const room of rooms) {
    if (room.distributedAt == null) continue;
    if (room.claimed) continue; // already tracked — never double-count
    const original = originalById.get(String(room.id));
    if (!original || !original.treasureCache) {
      console.warn(`  ? ${room.code || room.id}: distributed but no original cache in the dump — skipped`);
      continue;
    }
    const gold = Math.max(0, cacheGold(original.treasureCache) - cacheGold(room.treasureCache));
    const itemsValue = Math.max(
      0,
      cacheItemsValue(original.treasureCache, catalogById) - cacheItemsValue(room.treasureCache, catalogById),
    );
    if (gold === 0 && itemsValue === 0) continue;
    updates.push({ ...room, claimed: { gold, itemsValue } });
    console.log(`  ${String(room.code || room.id).padEnd(6)} claimed ≈ ${gold} gp + ${itemsValue} gp in items`);
  }

  if (updates.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }
  if (!apply) {
    console.log(`\nDry run: ${updates.length} room(s) would be updated. Re-run with --apply to write.`);
    return;
  }

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
  }
  const url = `${baseUrl}/api/gm/import/room`;
  const postRes = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ docs: updates }) });
  const text = await postRes.text();
  console.log(`POST ${url} → ${postRes.status}: ${text}`);
  if (!postRes.ok) process.exit(1);
})();
