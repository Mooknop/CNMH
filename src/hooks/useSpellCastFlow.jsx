// useSpellCastFlow — shared cast-button wiring for the spell-list hosts
// (SpellsList tab and the encounter MagicModal). Tracks whose turn it is,
// builds per-source onCast callbacks for the individual lists, and holds the
// pending cast request (spell + chosen action cost + casting source) that the
// host feeds into CastSpellModal.

import { useState, useCallback } from 'react';
import { useEncounter } from './useEncounter';
import { isCharTurn } from '../utils/encounterUtils';

export const useSpellCastFlow = (character) => {
  const { encounter } = useEncounter();
  const [castRequest, setCastRequest] = useState(null); // { spell, cost, source } | null

  const encounterLive = !!(encounter?.active && encounter.phase === 'in-progress');
  const isMyTurn = encounterLive && isCharTurn(encounter, character?.id);

  // One factory per list: makeOnCast('slot' | 'focus' | 'staff' | 'wand' |
  // 'scroll' | 'innate'). Warn-not-hide (#1575 D1): the chip shows on ANY
  // live-encounter turn — casting off-turn is allowed, and the cast modal's
  // OutOfTurnNotice makes the state visible. Outside a live encounter the
  // chip still hides (there is no resolution to run).
  const makeOnCast = useCallback(
    (source) =>
      encounterLive
        ? (spell, cost) => setCastRequest({ spell, cost, source })
        : undefined,
    [encounterLive]
  );

  const clearCast = useCallback(() => setCastRequest(null), []);

  return { isMyTurn, makeOnCast, castRequest, clearCast };
};

export default useSpellCastFlow;
