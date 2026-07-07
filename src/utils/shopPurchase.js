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

// Expand one bought ware into the inventory entries it grants (#1138). Most wares
// grant one copy (reuid). A GM Sale Shelf ware (#1134) grants more shape:
//   • scroll pack → FOUR loose scroll entries (the same minimal, re-resolvable
//     `{ scroll:{spellRef,rank?}, uid }` a bought scroll lands as), from the
//     ware's carried `scrolls`;
//   • rune item → ONE ref entry carrying the `runes` block (rune IDS) + the ring
//     grade `level`, minting a fresh uid and dropping every sale/ware-only field.
//     resolveInventoryItem re-derives the base item, applies the grade variant,
//     and overlays the runes so the runed name/summary derive exactly as they do
//     for an item runed through the etch flow — no baked display name to go stale.
export const expandWare = (item) => {
  if (!item || typeof item !== 'object') return [];
  if (item.sale === 'scrollpack' && Array.isArray(item.scrolls)) {
    return item.scrolls.map((s) => {
      const scroll = { spellRef: s.spellRef };
      if (s.rank != null) scroll.rank = s.rank;
      return { uid: newEntryUid(), scroll };
    });
  }
  if (item.sale === 'rune' && item.ref != null) {
    const entry = { ref: String(item.ref), runes: item.runes || {}, uid: newEntryUid() };
    if (item.level != null) entry.level = item.level;
    return [entry];
  }
  // A dragonbreath weapon ware (#1210 M4g): lands as a lean ref entry carrying
  // just the template block. resolveInventoryItem overlays it onto the base
  // weapon and the display re-derives (name, Strike dice, breath) — no baked
  // display name to go stale — mirroring the runed sale item above.
  if (item.dragonbreath && item.ref != null && item.ref !== 'runestone') {
    return [{ ref: String(item.ref), dragonbreath: item.dragonbreath, uid: newEntryUid() }];
  }
  return [reuid(item)];
};

// A purchase line: { item: <resolved ware>, qty }. Returns the floored, positive
// qty or 0 when the line is unusable.
export const lineQty = (p) => {
  const n = Math.floor(Number(p?.qty));
  return p && p.item && Number.isFinite(n) && n > 0 ? n : 0;
};
