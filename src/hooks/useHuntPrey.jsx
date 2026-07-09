import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { makePreyEntry } from '../utils/huntPrey';
import { APP, syncKey } from '../sync/keys';

// Hunt Prey state (#223) — Ashka's designated prey. One creature at a time, so
// setting overwrites. Synced so the GM and turn tracker see the badge:
//   cnmh_huntprey_<charId> = { targetKey, targetName, ts } | null
// Cleared at daily prep (dailyPrep.computeResets already reads this key). The
// hook is intentionally dumb: action-spend and logging live at the call sites
// (mirrors useStance/useAura).
export const useHuntPrey = (charId) => {
  const [prey, setPrey] = useSyncedState(syncKey(APP.HUNTPREY, charId || 'none'), null);

  const designate = useCallback(
    ({ targetKey, targetName }) => setPrey(makePreyEntry({ targetKey, targetName })),
    [setPrey]
  );

  const clear = useCallback(() => setPrey(null), [setPrey]);

  return { prey: prey || null, designate, clear };
};

export default useHuntPrey;
