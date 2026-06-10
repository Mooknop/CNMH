// useSpellCastFlow — shared cast-button wiring for the spell-list hosts
// (SpellsList tab and the encounter MagicModal). Tracks whose turn it is,
// builds per-source onCast callbacks for the individual lists, and holds the
// pending cast request (spell + chosen action cost + casting source) that the
// host feeds into CastSpellModal.

import { useState, useCallback } from 'react';
import { useEncounter } from './useEncounter';

export const useSpellCastFlow = (character) => {
  const { encounter } = useEncounter();
  const [castRequest, setCastRequest] = useState(null); // { spell, cost, source } | null

  const currentEntry = encounter?.order?.[encounter?.currentTurnIndex];
  const isMyTurn = !!(
    encounter?.active &&
    encounter.phase === 'in-progress' &&
    currentEntry?.kind === 'pc' &&
    currentEntry?.charId === character?.id
  );

  // One factory per list: makeOnCast('slot' | 'focus' | 'staff' | 'wand' |
  // 'scroll' | 'innate'). Returns undefined off-turn so the Cast chip hides.
  const makeOnCast = useCallback(
    (source) =>
      isMyTurn
        ? (spell, cost) => setCastRequest({ spell, cost, source })
        : undefined,
    [isMyTurn]
  );

  const clearCast = useCallback(() => setCastRequest(null), []);

  return { isMyTurn, makeOnCast, castRequest, clearCast };
};

export default useSpellCastFlow;
