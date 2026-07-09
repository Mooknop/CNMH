import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { APP, globalKey } from '../sync/keys';

// Single writer for the party's Sandpoint location support (#1152 S1).
//   cnmh_support_global = { [employerId]: { earnedAt } }
// An entry's presence means the party has earned that location's support, which
// unlocks its Earn Income tasks (see data/earnIncomeEmployers). `earnedAt` is a
// free-form stamp (game date or ts) recorded when support was granted, for
// display only. A global key — like cnmh_shops_global there is no owner id, the
// whole party shares one support map. The GM Town Support panel writes through
// here; the player Earn Income resolver reads `supported` (#1154 S2).
//
// Key type token is `support` (single token, no underscores) per the synced-key
// rule cnmh_<type>_<id>.
export const useLocationSupport = () => {
  const [supported, setSupported] = useSyncedState(globalKey(APP.SUPPORT), {});

  const isSupported = useCallback(
    (id) => Boolean(id && (supported || {})[id]),
    [supported],
  );

  // Grant (on=true) or revoke (on=false) support for one location. Granting
  // stamps `earnedAt` if provided; revoking drops the entry entirely so the map
  // only ever holds currently-supported locations. Re-granting an already
  // supported location leaves its existing stamp untouched.
  const setSupport = useCallback(
    (id, on, earnedAt = null) => {
      if (!id) return;
      setSupported((cur) => {
        const map = cur || {};
        if (on) {
          if (map[id]) return map; // already supported — keep the original stamp
          return { ...map, [id]: { earnedAt } };
        }
        if (!(id in map)) return map;
        const next = { ...map };
        delete next[id];
        return next;
      });
    },
    [setSupported],
  );

  return { supported: supported || {}, isSupported, setSupport };
};

export default useLocationSupport;
