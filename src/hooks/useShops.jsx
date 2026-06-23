import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';

// Single writer for the app-managed shop wares store (#696 S1).
//   cnmh_shops_global = { [loreId]: { wares: [{ ref, price?, stock? }] } }
// loreId = a Location lore entry id; ref = a catalog item id; price = optional gp
// override (else the catalog price); stock = optional integer. The GM editor (S2)
// writes through here; the player browse/buy flow (S3–S6) reads `shops` and runs
// it through the selectors in utils/shopUtils.js. A global key, so unlike the
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

  return { shops, setWares };
};

export default useShops;
