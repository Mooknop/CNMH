import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';

// Per-player initiative-roll channel for the Foundry-linked initiative flow (#494,
// Slice 2). cnmh_initroll_<charId> = { d20, mod, total, skill, ts }.
//
// Each player owns their own key, so there's no cross-player last-write-wins, and
// being a separate key makes it immune to the bridge's cnmh_encounter_global
// overwrites on every Foundry updateCombat — the reason writing player initiative
// into the encounter order is a dead end against a Foundry combat. Slice 3's bridge
// tallies these rolls against the PC combatant set to auto-commit; this slice just
// collects and displays them.
//
// Like useBystander, the hook is intentionally dumb about PF2e math — the call site
// (InitiativeEntry) owns the modifier/skill computation and passes the finished
// numbers in.

export const useInitiativeRoll = (charId) => {
  const [roll, setRoll] = useSyncedState(`cnmh_initroll_${charId || 'none'}`, null);

  const submit = useCallback(
    ({ d20, mod, total, skill }) =>
      setRoll({ d20, mod, total, skill, ts: Date.now() }),
    [setRoll]
  );

  const clear = useCallback(() => setRoll(null), [setRoll]);

  return { roll, submit, clear };
};

export default useInitiativeRoll;
