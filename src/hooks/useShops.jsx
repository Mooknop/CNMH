import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';

// Single writer for the app-managed shop store (#696 S1).
//   cnmh_shops_global = { [loreId]: { keeper?, open?, revealed?, wares: [...] } }
// loreId = a Location lore entry id; a ware is { ref, level?, runeRef?, price?,
// stock?, maxStock? } — `stock` is the LIVE remaining count (purchases decrement
// it, #1139) and `maxStock` the authored capacity the decrement stamps, read
// only by the GM restock UX. The shop-level fields are additive (#822): `keeper` = shopkeeper
// flavor, `open` = trading, `revealed` = visible to players; all optional and
// back-compatible (absence = legacy defaults, see shopUtils). The GM editor
// writes through here; the player browse/buy flow reads `shops` and runs it
// through the selectors in utils/shopUtils.js. A global key, so unlike the
// per-character overlays there is no owner id — every client shares one store.
export const useShops = () => {
  const [shops, setShops] = useSyncedState('cnmh_shops_global', {});

  // Replace a single shop's wares list (empty array leaves it a non-shop).
  const setWares = useCallback(
    (loreId, wares) => {
      if (!loreId) return;
      setShops((cur) => ({
        ...(cur || {}),
        [loreId]: { ...((cur || {})[loreId] || {}), wares: Array.isArray(wares) ? wares : [] },
      }));
    },
    [setShops]
  );

  // Shallow-merge a patch of shop fields (keeper/open/revealed/wares) onto the
  // entry, creating it if absent (#822 S1). This is how the editor declares a
  // shop ("Set up as shop" commits { keeper:'', open:true, revealed:false,
  // wares:[] }) and saves meta + wares together. A `wares` key in the patch
  // replaces the list wholesale; omitted fields are left untouched.
  const setShop = useCallback(
    (loreId, patch) => {
      if (!loreId) return;
      setShops((cur) => ({
        ...(cur || {}),
        [loreId]: { ...((cur || {})[loreId] || {}), ...(patch || {}) },
      }));
    },
    [setShops]
  );

  // Delete a shop entry entirely ("Remove shop"). A no-op when absent.
  const removeShop = useCallback(
    (loreId) => {
      if (!loreId) return;
      setShops((cur) => {
        if (!cur || !(loreId in cur)) return cur;
        const next = { ...cur };
        delete next[loreId];
        return next;
      });
    },
    [setShops]
  );

  return { shops, setWares, setShop, removeShop };
};

export default useShops;
