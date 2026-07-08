// Area-level loot aggregation for the GM Loot Ledger (#1281 WB4). An "area" is
// the letter prefix of a room's code ("A1", "A3" → area "A") — one dungeon
// level of the adventure, which the GM maps to a PF2e level via the synced
// cnmh_lootareas_global key so the area's stocked loot can be checked against
// the Table 10-9 treasure budget.
import { lineUnitValue } from './lootDrop';
import { roomTreasureCache } from './rooms';

// The letter prefix of a room's code, or null for codeless docs (site Features
// pages and anything hand-added without a code).
export const areaKey = (room) => {
  const m = /^([A-Z]+)/.exec(String(room?.code || '').trim().toUpperCase());
  return m ? m[1] : null;
};

// Group room docs into areas ordered by letter. Each group carries the site
// name of its first room as a display title (the letter and the imported
// `site` field correlate 1:1 in practice).
export const groupRoomsByArea = (rooms) => {
  const map = new Map();
  for (const room of rooms || []) {
    const key = areaKey(room);
    if (!key) continue;
    if (!map.has(key)) map.set(key, { key, site: '', rooms: [] });
    const g = map.get(key);
    if (!g.site && (room.site || room.chapter)) g.site = room.site || room.chapter;
    g.rooms.push(room);
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
};

// Remaining gp value of a room's cache: gold + every line at qty × unit value
// (catalog price, else the line's inline value — same pricing as claims).
export const cacheValueGp = (room, catalogById) => {
  const cache = roomTreasureCache(room);
  if (!cache) return 0;
  return (
    Math.max(0, cache.gold) +
    cache.items.reduce(
      (sum, line) => sum + Math.max(1, Math.floor(Number(line.qty) || 1)) * lineUnitValue(line, catalogById),
      0,
    )
  );
};

// gp the party has already taken from the room (the WB2 accumulator).
export const claimedValueGp = (room) =>
  Math.max(0, Number(room?.claimed?.gold) || 0) + Math.max(0, Number(room?.claimed?.itemsValue) || 0);

// Roll an area's rooms up into { total, claimed, remaining, lootRooms,
// distributedRooms }. `total` is the area as stocked (remaining + claimed), so
// distributing a cache never changes the area total — only its claimed share.
export const areaLootSummary = (rooms, catalogById) => {
  let remaining = 0;
  let claimed = 0;
  let lootRooms = 0;
  let distributedRooms = 0;
  for (const room of rooms || []) {
    const rem = cacheValueGp(room, catalogById);
    const cl = claimedValueGp(room);
    if (rem > 0 || cl > 0) {
      lootRooms += 1;
      if (room.distributedAt != null || (cl > 0 && rem === 0)) distributedRooms += 1;
    }
    remaining += rem;
    claimed += cl;
  }
  return { total: remaining + claimed, remaining, claimed, lootRooms, distributedRooms };
};
