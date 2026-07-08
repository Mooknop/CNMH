import { roomTreasureCache } from './rooms';
import { newEntryUid } from './uid';

// Treasure distribution (#1090/#1091, epic #1085 T4/T5). A room's structured
// treasure cache is handed to the party as a single global "loot drop"
// (cnmh_lootdrop_global). Players claim lines against it (T5); the GM is the
// single writer at finalize. These helpers are the pure shape/logic layer — the
// synced lifecycle lives in hooks/useLootDrop, the UI in RoomDistributeControl
// (GM) and LootClaimSheet (players).
//
// Claim model (T5): each drop item line carries `claims: [{ charId, qty }]`.
// Sum of claim qty never exceeds the line qty; the remainder stays claimable, so
// a stack (qty > 1) can be split across characters.

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
      claims: [], // [{ charId, qty }] — filled in as players claim (T5)
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

const qtyOf = (n) => Math.max(0, Math.floor(Number(n) || 0));

// ── Claim helpers (T5) ───────────────────────────────────────────────────────
// Total units claimed on a line (across all characters).
export const lineClaimedQty = (line) =>
  (line?.claims || []).reduce((s, c) => s + qtyOf(c.qty), 0);

// Units still up for grabs on a line.
export const lineRemaining = (line) => Math.max(0, qtyOf(line?.qty) - lineClaimedQty(line));

// Units a specific character has claimed on a line.
export const charClaimQty = (line, charId) =>
  (line?.claims || []).filter((c) => c.charId === charId).reduce((s, c) => s + qtyOf(c.qty), 0);

// Apply a claim change to a drop, returning a NEW drop. `qty` is the character's
// desired TOTAL on that line (0 releases). Clamped to what's left after other
// claimants, so it can never over-allocate a stack. Used for claim, release, and
// split alike.
export const applyClaim = (drop, lineId, charId, qty) => {
  if (!drop) return drop;
  const items = (drop.items || []).map((line) => {
    if (line.lineId !== lineId) return line;
    const others = (line.claims || []).filter((c) => c.charId !== charId);
    const otherQty = others.reduce((s, c) => s + qtyOf(c.qty), 0);
    const cap = Math.max(0, qtyOf(line.qty) - otherQty);
    const want = Math.min(qtyOf(qty), cap);
    return { ...line, claims: want > 0 ? [...others, { charId, qty: want }] : others };
  });
  return { ...drop, items };
};

// Even gold split across the party (all PC ids), floored per head with the
// remainder to the first — unless the GM set a per-character override map
// (`goldSplit`), in which case that wins verbatim. Returns { charId: gp }.
export const goldShares = (gold, ids, goldSplit) => {
  const list = ids || [];
  if (goldSplit && typeof goldSplit === 'object') {
    return Object.fromEntries(list.map((id) => [id, Math.max(0, Number(goldSplit[id]) || 0)]));
  }
  const g = Math.max(0, Math.floor(Number(gold) || 0));
  const n = list.length;
  if (n === 0 || g === 0) return Object.fromEntries(list.map((id) => [id, 0]));
  const base = Math.floor(g / n);
  const rem = g - base * n;
  return Object.fromEntries(list.map((id, i) => [id, base + (i === 0 ? rem : 0)]));
};

// The lines a character has claimed, condensed for a session-log receipt:
// [{ name, qty, variant }].
export const charClaimedLines = (drop, charId) =>
  (drop?.items || [])
    .map((line) => ({ name: line.name, variant: line.variant, qty: charClaimQty(line, charId) }))
    .filter((l) => l.qty > 0);

// Build one additive-overlay entry (cnmh_acquired_<charId>) for a single claimed
// unit of a line — a minimal, re-resolvable ref entry, exactly like a bought or
// gifted item (resolveInventoryItem re-derives name/value from the catalog). The
// generic Treasure Item carries its per-instance identity (name + worth); other
// refs carry an optional variant label.
export const acquiredEntry = (line) => {
  if (line.ref === 'treasure-item') {
    const e = { ref: 'treasure-item', name: line.name, uid: newEntryUid() };
    if (line.value != null) e.value = line.value;
    return e;
  }
  const e = { ref: line.ref, uid: newEntryUid() };
  if (line.variant) e.variant = line.variant;
  return e;
};

// The cache remainder after a finalize: unclaimed item units + any gold the GM's
// override left undistributed, in the room's treasureCache shape. Empty
// ({ gold: 0, items: [] }) when everything was claimed.
export const unclaimedCache = (drop, distributedGold) => {
  const items = (drop?.items || [])
    .map((line) => {
      const remaining = lineRemaining(line);
      if (remaining <= 0) return null;
      const entry = { ref: line.ref, name: line.name, qty: remaining };
      if (line.variant) entry.variant = line.variant;
      if (line.value != null) entry.value = line.value;
      return entry;
    })
    .filter(Boolean);
  const returnedGold = Math.max(0, qtyOf(drop?.gold) - Math.max(0, Math.floor(Number(distributedGold) || 0)));
  return { gold: returnedGold, items };
};

// Per-unit gp value of a drop/cache line: the bound catalog doc's price when
// it has one, else the line's own inline `value` (coin-valuables and generic
// treasure items), else 0. Mirrors resolveTreasure's price-then-value order.
export const lineUnitValue = (line, catalogById) => {
  const cat = line?.ref && catalogById ? catalogById.get(line.ref) : null;
  const price = cat ? Number(cat.price) : NaN;
  if (Number.isFinite(price) && price > 0) return price;
  const v = Number(line?.value);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

// The gp value a finalize actually handed out: the gold credited to characters
// plus every claimed unit at its unit value. Feeds the room's `claimed`
// accumulator so area budgeting (#1281) can tell claimed from unclaimed loot
// after the cache has been overwritten with the remainder.
export const claimedDelta = (drop, distributedGold, catalogById) => ({
  gold: Math.max(0, Math.floor(Number(distributedGold) || 0)),
  itemsValue: (drop?.items || []).reduce(
    (sum, line) => sum + lineClaimedQty(line) * lineUnitValue(line, catalogById),
    0,
  ),
});

// Fold a finalize's delta onto the room's historical `claimed` accumulator
// ({ gold, itemsValue } gp). The accumulator survives cache reopens and
// re-imports — it records what the party has ever taken from the room.
export const accumulateClaimed = (prev, delta) => ({
  gold: (Number(prev?.gold) || 0) + (Number(delta?.gold) || 0),
  itemsValue: (Number(prev?.itemsValue) || 0) + (Number(delta?.itemsValue) || 0),
});

// "Acid Flask ×2, +6 gp" — the claimed-items + gold-share half of a receipt.
export const receiptText = (lines, gold) => {
  const parts = (lines || []).map((l) => `${l.name}${l.variant ? ` (${l.variant})` : ''}${l.qty > 1 ? ` ×${l.qty}` : ''}`);
  if (gold > 0) parts.push(`+${gold} gp`);
  return parts.join(', ');
};
