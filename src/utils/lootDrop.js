import { roomTreasureCache } from './rooms';

// Treasure distribution (#1090, epic #1085 T4). A room's structured treasure
// cache is handed to the party as a single global "loot drop"
// (cnmh_lootdrop_global) that players claim against (T5); the GM is the single
// writer at finalize. These helpers are the pure shape/logic layer — the synced
// lifecycle lives in hooks/useLootDrop, the UI in RoomDistributeControl.

// A room's display label ("A3. Shrine to Kabriri"), code-prefixed when present.
export const roomLabel = (room) =>
  room ? `${room.code ? `${room.code}. ` : ''}${room.name || 'Room'}` : '';

let _seq = 0;
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${(_seq += 1).toString(36)}`;

// Does the cache hold a placeholder line the import couldn't bind to the catalog
// (a coin-valuable or story item)? Those can't land in an inventory, so they
// block distribution until the GM resolves them in the cache editor (T3).
export const cacheHasUnmatched = (room) => {
  const cache = roomTreasureCache(room);
  return !!cache && cache.items.some((it) => !it.ref);
};

// Can this room be distributed right now? It needs a cache with content, no
// unmatched lines, and no prior `distributedAt` stamp. (A currently-open drop
// elsewhere is a separate, session-wide guard handled by the hook/UI.)
export const roomDistributable = (room) => {
  if (!room || room.distributedAt != null) return false;
  const cache = roomTreasureCache(room);
  if (!cache) return false;
  return !cache.items.some((it) => !it.ref);
};

// Build the loot-drop payload from a room's cache — the shape written to
// cnmh_lootdrop_global. Only ref-bound item lines make it in (unmatched
// placeholders are dropped; roomDistributable gates them out up front anyway).
// Returns null when there's nothing distributable (no gold and no bound items).
export const buildLootDrop = (room) => {
  const cache = roomTreasureCache(room);
  if (!cache) return null;
  const items = cache.items
    .filter((it) => it.ref)
    .map((it) => ({
      lineId: uid('loot'),
      ref: it.ref,
      name: it.name,
      qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
      ...(it.variant ? { variant: it.variant } : {}),
      ...(it.value != null ? { value: it.value } : {}),
      claimedBy: null,
    }));
  if (cache.gold <= 0 && items.length === 0) return null;
  return {
    id: uid('drop'),
    roomId: room.id,
    roomName: roomLabel(room),
    gold: cache.gold,
    items,
    goldSplit: null, // null = even split; T5 may override per character
    status: 'open', // open | finalized | cancelled
    ts: Date.now(),
  };
};

// Total item units in a drop (summed quantities, not line count).
export const lootItemCount = (drop) =>
  (drop?.items || []).reduce((sum, it) => sum + (Math.floor(Number(it.qty) || 1)), 0);

// Short summary for the confirm dialog and session log: "25 gp + 3 items".
export const lootDropSummary = (drop) => {
  if (!drop) return '';
  const parts = [];
  if (drop.gold > 0) parts.push(`${drop.gold} gp`);
  const count = lootItemCount(drop);
  if (count > 0) parts.push(`${count} item${count === 1 ? '' : 's'}`);
  return parts.join(' + ') || 'nothing';
};
