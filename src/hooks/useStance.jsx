import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { APP, syncKey } from '../sync/keys';

// Stance state (#224) — Dragon Stance and other 1-action stances. Entering a
// stance unlocks its gated strikes (e.g. Dragon Tail) and persists until the
// character leaves it or the encounter ends. Only one stance can be active at a
// time, so entering simply overwrites the previous one. State is synced so the
// GM and turn tracker see it:
//   cnmh_stance_<charId> = { active, name, ts }
// The hook is intentionally dumb: action-spend and logging live at the call
// sites, which have the encounter/session log in scope (mirrors useAura).

const IDLE_STANCE = { active: false, name: null, ts: 0 };

export const useStance = (charId) => {
  const [stance, setStance] = useSyncedState(
    syncKey(APP.STANCE, charId || 'none'),
    IDLE_STANCE
  );

  const enter = useCallback(
    (name) => setStance({ active: true, name: name || null, ts: Date.now() }),
    [setStance]
  );

  const leave = useCallback(
    () => setStance({ active: false, name: null, ts: Date.now() }),
    [setStance]
  );

  return {
    active: !!stance?.active,
    stanceName: stance?.active ? stance?.name || null : null,
    enter,
    leave,
  };
};

export default useStance;
