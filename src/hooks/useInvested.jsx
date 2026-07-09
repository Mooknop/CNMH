import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { APP, syncKey } from '../sync/keys';

// Player-writable attunement overlay for the inventory "Loadout Grid".
//   cnmh_invested_<characterId> = { [uid]: true }
// PF2e lets you invest up to 10 items carrying the Invested trait to gain their
// magic. This is a display/state overlay layered on top of placement (an
// invested item keeps its worn/held placement; it just renders in the Attuned
// area instead of its bag), mirroring the consumed / affixed / itemEffects
// overlays. Eligibility (the Invested trait) is enforced by callers via
// isInvestable; the cap is enforced here.
export const ATTUNE_CAP = 10;

export const useInvested = (characterId) => {
  const [invested, setInvested] = useSyncedState(
    syncKey(APP.INVESTED, characterId || 'none'),
    {}
  );

  const investedCount = Object.values(invested || {}).filter(Boolean).length;

  const isInvested = useCallback(
    (uid) => !!(uid != null && invested && invested[uid]),
    [invested]
  );

  // Attune a uid. No-op at the cap or if already invested, so a double-fire (a
  // drag that also taps, say) can't push past 10 or re-write the same entry.
  const attune = useCallback(
    (uid) =>
      uid != null &&
      setInvested((cur) => {
        const m = cur || {};
        if (m[uid]) return m;
        if (Object.values(m).filter(Boolean).length >= ATTUNE_CAP) return m;
        return { ...m, [uid]: true };
      }),
    [setInvested]
  );

  const unattune = useCallback(
    (uid) =>
      uid != null &&
      setInvested((cur) => {
        if (!cur || !(uid in cur)) return cur || {};
        const m = { ...cur };
        delete m[uid];
        return m;
      }),
    [setInvested]
  );

  return { invested, investedCount, isInvested, attune, unattune };
};

export default useInvested;
