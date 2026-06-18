// Declared-reaction presence (#476). When a player presses a reaction on the
// off-turn stage, their PC is broadcast here so every device shows them stepping
// onto the acting combatant's banner until the reaction resolves (modal confirm
// or cancel clears it). One shared global key, fanned out like the rest:
//   cnmh_reactors_global = [ { pcId, label, status: 'resolving' } ]
// Last-write-wins per useSyncedState — fine for a 5-player table; two players
// declaring in the same instant is vanishingly rare. Turn-change auto-clear of
// stale entries is handled separately (#477).
import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';

const EMPTY = [];

export const useReactors = () => {
  const [reactors, setReactors] = useSyncedState('cnmh_reactors_global', EMPTY);

  // Add (or refresh) this PC's declaration. Replaces any prior entry for the
  // same pcId so a re-press never stacks duplicates.
  const declare = useCallback(
    (pcId, label) =>
      setReactors((cur) => [
        ...(cur || []).filter((r) => r.pcId !== pcId),
        { pcId, label, status: 'resolving' },
      ]),
    [setReactors]
  );

  const clear = useCallback(
    (pcId) => setReactors((cur) => (cur || []).filter((r) => r.pcId !== pcId)),
    [setReactors]
  );

  return { reactors: reactors || EMPTY, declare, clear };
};

export default useReactors;
