import { useEffect, useRef } from 'react';
import { useEncounter } from './useEncounter';
import { useReactors } from './useReactors';
import { useGmAuth } from './useGmAuth';
import { turnToken, shouldClearReactors, reactorClearLog } from '../utils/reactorUtils';

// Off-turn reactor-presence sweep (#477). Reactions are declared against the
// acting combatant (useReactors → cnmh_reactors_global) and shown on every
// device's stage. If a turn ends with a reaction still declared (the player
// armed it but never resolved, or it lapsed), it would linger into the next
// turn. This watcher retires those on the turn boundary and logs it.
//
// GM-owned single writer (like useEncounterTurnEffects): every client sees the
// turn change, but only the GM clears + appends, so the log line isn't written
// five times. Not gated on foundryCombatId — stale reactors can accrue in
// app-driven combats too. Mounted once app-wide via TurnEffectsSync.
export function useReactorTurnClear() {
  const { encounter, appendLog } = useEncounter();
  const { reactors, clearAll } = useReactors();
  const { isGm } = useGmAuth();

  const prevTokenRef = useRef(null);

  useEffect(() => {
    const active = encounter?.active ?? false;
    const phase = encounter?.phase;

    // Outside an in-progress combat, forget the snapshot so the next encounter's
    // first turn isn't treated as a transition.
    if (!active || phase !== 'in-progress') {
      prevTokenRef.current = null;
      return;
    }

    const nextToken = turnToken(encounter);
    const prevToken = prevTokenRef.current;

    if (shouldClearReactors({ prevToken, nextToken, isGm, reactorCount: reactors.length })) {
      const logText = reactorClearLog(reactors);
      clearAll();
      appendLog({ type: 'system', text: logText });
    }
    prevTokenRef.current = nextToken;
  }, [
    encounter,
    encounter?.active,
    encounter?.phase,
    encounter?.round,
    encounter?.currentTurnIndex,
    isGm,
    reactors,
    clearAll,
    appendLog,
  ]);
}

export default useReactorTurnClear;
