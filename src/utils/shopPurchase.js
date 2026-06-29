import { newEntryUid } from './uid';

// Shared shop-purchase primitives (#857 #878). Extracted from useBuyItems so the
// unified checkout (useShopCheckout) and the legacy buy hook clone wares the same
// way. Pure — no hooks, no overlay writes.

// Deep-clone a ware into a clean inventory entry: strip live/loadout-only fields
// and mint fresh uids throughout (including container contents) so a bought copy
// can't collide with an entry the buyer already owns; the buyer's effective tree
// re-derives placement. A Runestone / Scroll / Wand lands as a minimal,
// re-resolvable ref entry (resolveInventoryItem / finishItem re-derive name /
// value / level from the catalog), mirroring how those resolve elsewhere.
export const reuid = (item) => {
  if (item && item.runestone) {
    const stone = { ref: 'runestone', uid: newEntryUid() };
    if (item.runestone.runeRef != null) stone.runeRef = item.runestone.runeRef;
    return stone;
  }
  if (item && (item.scroll || item.wand)) {
    const kind = item.scroll ? 'scroll' : 'wand';
    const block = item[kind] || {};
    const entry = { uid: newEntryUid(), [kind]: {} };
    if (block.spellRef != null) entry[kind].spellRef = block.spellRef;
    if (block.rank != null) entry[kind].rank = block.rank;
    return entry;
  }
  const { state, hand, stock, wareKey, variants, ...rest } = item || {};
  const next = { ...rest, uid: newEntryUid() };
  if (next.container && Array.isArray(next.container.contents)) {
    next.container = { ...next.container, contents: next.container.contents.map((c) => reuid(c)) };
  }
  return next;
};

// A purchase line: { item: <resolved ware>, qty }. Returns the floored, positive
// qty or 0 when the line is unusable.
export const lineQty = (p) => {
  const n = Math.floor(Number(p?.qty));
  return p && p.item && Number.isFinite(n) && n > 0 ? n : 0;
};
