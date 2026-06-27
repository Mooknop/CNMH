import { buildChildrenMap, getChildren } from './loreUtils';
import { isRunestoneEntry, resolveRunestone } from './runestone';

// Shop selectors over the app-managed wares store `cnmh_shops_global` (#696 S1).
//
// A "shop" is a Location lore entry that has an entry in the store with at least
// one ware: `shops[loreId] = { wares: [{ ref, price?, stock? }] }`. The `shop`
// lore tag is flavor only — the store is the source of truth, since wares are
// authored in-app (GM editor, S2), not in the read-only lore vault.

// True when `loreId` has ≥1 ware in the store. This is the player-facing
// predicate (a shop is worth browsing only when it has something to sell).
export function isShop(loreId, shops) {
  const wares = shops && loreId != null ? shops[loreId]?.wares : null;
  return Array.isArray(wares) && wares.length > 0;
}

// True when `loreId` has a store entry at all, regardless of ware count — the
// GM editor's "is a shop" (#822 S1). A shop is declared explicitly ("Set up as
// shop") and can exist with zero wares, so the editor keys off entry presence,
// not isShop's ≥1-ware test.
export function isSetUp(loreId, shops) {
  return !!(shops && loreId != null && shops[loreId]);
}

// True when the shop is revealed to players (#822). Legacy entries authored
// before the field existed have no `revealed` key and default to visible, so
// they don't vanish; only an explicit `revealed:false` hides a shop.
export function isShopRevealed(loreId, shops) {
  const entry = shops && loreId != null ? shops[loreId] : null;
  return !!entry && entry.revealed !== false;
}

// True when the shop is open for trading (#822). Legacy entries with no `open`
// key default to open; only an explicit `open:false` marks a shop closed.
export function isShopOpen(loreId, shops) {
  const entry = shops && loreId != null ? shops[loreId] : null;
  return !!entry && entry.open !== false;
}

// Shop-flagged direct children of the current location that players may see,
// title-sorted (reuses the containment `parent` edge via loreUtils). `entries`
// is the full lore list. A child is included only when it both has wares
// (isShop) and is revealed (#822): an explicit `revealed:false` hides it; a
// legacy shop with no `revealed` field stays visible. A closed shop is NOT
// filtered here — it still appears, but as not-trading (see isShopOpen / the
// ShopModal closed state).
export function getShopsForLocation(locationId, entries, shops) {
  if (!locationId || !shops) return [];
  const childrenMap = buildChildrenMap(entries);
  return getChildren({ id: locationId }, childrenMap).filter(
    (e) => isShop(e.id, shops) && isShopRevealed(e.id, shops)
  );
}

// Resolve a shop's wares into displayable items: each ware `ref` → catalog item,
// with `price` overridden when the ware sets one (else the variant/catalog price)
// and `stock` carried through when present. Unresolved refs are dropped.
//
// A ware may pin a `level` to stock a specific variant of a multi-level item
// (#798): the matching `variants[]` entry is merged over the base (name/price/
// effect/consumable — same merge as resolveInventoryItem) and the `variants`
// array is dropped from the resolved ware. Every resolved ware carries a
// `wareKey` that is unique per stocked variant — the bare `ref` for a flat item,
// `"${ref}@${level}"` for a variant — so the cart and React/test keys don't
// collide when a shop stocks two variants of the same item (both share `id`).
//
// A rune sold as a Runestone (#801) is a `{ ref: 'runestone', runeRef }` ware:
// resolved from the rune catalog (`runeMap`) via R1's resolveRunestone into a
// runestone display item (name/value = stone + rune), with a per-rune wareKey.
export function resolveShopWares(loreId, shops, catalogMap, runeMap) {
  const wares = shops && loreId != null ? shops[loreId]?.wares : null;
  if (!Array.isArray(wares) || !catalogMap) return [];
  return wares
    .map((w) => {
      if (!w || w.ref == null) return null;

      if (isRunestoneEntry(w)) {
        const resolved = resolveRunestone({ ref: 'runestone', runeRef: w.runeRef }, runeMap);
        const override = typeof w.price === 'number' && Number.isFinite(w.price) ? w.price : null;
        if (override != null) resolved.price = override;
        resolved.wareKey = w.runeRef != null ? `runestone@${w.runeRef}` : 'runestone';
        if (w.stock != null) resolved.stock = w.stock;
        return resolved;
      }

      const item = catalogMap.get(String(w.ref));
      if (!item) return null;

      let resolved = { ...item };
      let wareKey = String(w.ref);
      if (w.level != null && Array.isArray(item.variants)) {
        const variant = item.variants.find((v) => v.level === w.level);
        if (variant) {
          const { variants, ...base } = resolved;
          resolved = { ...base, ...variant };
          wareKey = `${w.ref}@${w.level}`;
        }
      }

      const override = typeof w.price === 'number' && Number.isFinite(w.price) ? w.price : null;
      const price = override != null ? override : resolved.price;
      resolved.price = Number.isFinite(price) ? price : 0;
      resolved.wareKey = wareKey;
      if (w.stock != null) resolved.stock = w.stock;
      return resolved;
    })
    .filter(Boolean);
}
