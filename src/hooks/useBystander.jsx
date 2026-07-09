import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { APP, syncKey } from '../sync/keys';

// Harmless Bystander state (#226 Slice D) — Izzy's level-4 skill feat lets her
// roll initiative with Deception instead of Perception and pretend she's not
// part of the fight. Declaring it is a per-encounter status the GM and order
// strip can see:
//   cnmh_bystander_<charId> = { active, mod, ts }
// `mod` records which skill seeded initiative ('deception'). Like useStance the
// hook is intentionally dumb — the initiative math lives at the call site
// (InitiativeEntry), which has the modifiers and the order entry in scope.

const IDLE_BYSTANDER = { active: false, mod: null, ts: 0 };

export const useBystander = (charId) => {
  const [state, setState] = useSyncedState(
    syncKey(APP.BYSTANDER, charId || 'none'),
    IDLE_BYSTANDER
  );

  const declare = useCallback(
    (mod) => setState({ active: true, mod: mod || 'deception', ts: Date.now() }),
    [setState]
  );

  const clear = useCallback(
    () => setState({ active: false, mod: null, ts: Date.now() }),
    [setState]
  );

  return {
    active: !!state?.active,
    mod: state?.active ? state?.mod || null : null,
    declare,
    clear,
  };
};

export default useBystander;
