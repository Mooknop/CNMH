import { buildChildrenMap, getChildren } from './loreUtils';

// Shop selectors over the app-managed wares store `cnmh_shops_global` (#696 S1).
//
// A "shop" is a Location lore entry that has an entry in the store with at least
// one ware: `shops[loreId] = { wares: [{ ref, price?, stock? }] }`. The `shop`
// lore tag is flavor only — the store is the source of truth, since wares are
// authored in-app (GM editor, S2), not in the read-only lore vault.

// True when `loreId` has ≥1 ware in the store.
export function isShop(loreId, shops) {
  const wares = shops && loreId != null ? shops[loreId]?.wares : null;
  return Array.isArray(wares) && wares.length > 0;
}

// Shop-flagged direct children of the current location, title-sorted (reuses the
// containment `parent` edge via loreUtils). `entries` is the full lore list.
export function getShopsForLocation(locationId, entries, shops) {
  if (!locationId || !shops) return [];
  const childrenMap = buildChildrenMap(entries);
  return getChildren({ id: locationId }, childrenMap).filter((e) => isShop(e.id, shops));
}

// Resolve a shop's wares into displayable items: each ware `ref` → catalog item,
// with `price` overridden when the ware sets one (else the catalog price) and
// `stock` carried through when present. Unresolved refs are dropped.
export function resolveShopWares(loreId, shops, catalogMap) {
  const wares = shops && loreId != null ? shops[loreId]?.wares : null;
  if (!Array.isArray(wares) || !catalogMap) return [];
  return wares
    .map((w) => {
      if (!w || w.ref == null) return null;
      const item = catalogMap.get(String(w.ref));
      if (!item) return null;
      const price = typeof w.price === 'number' && Number.isFinite(w.price) ? w.price : item.price;
      const resolved = { ...item, price };
      if (w.stock != null) resolved.stock = w.stock;
      return resolved;
    })
    .filter(Boolean);
}
