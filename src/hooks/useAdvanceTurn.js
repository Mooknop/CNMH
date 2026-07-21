import { useCallback } from 'react';
import { useEncounter } from './useEncounter';
import { useSession } from '../contexts/SessionContext';
import { RELAY } from '../sync/keys';

// GM turn advance for non-PC turns (#1537 S1 — the dock's "End enemy turn").
// Deliberately NOT a relaxation of useEndTurn: that hook owns the acting PC's
// submission side effects (omen expiry, sustain lapse, next-PC turnstate
// pre-reset) and stays PC-gated. Advancing off an enemy/unresolved turn needs
// none of that — the next PC's own client sweeps its turnstate on turn start
// (TurnTrackerPanel's turnToken mismatch), exactly as it does when the GM
// clicks next-turn in Foundry today.
//
// Foundry-linked combat → cnmh_turncmd_global (the bridge calls
// combat.nextTurn() and pushes the advanced encounter back); offline sandbox →
// the app-side advance, same fallback shape as useEndTurn.
export function useAdvanceTurn() {
  const { encounter, advanceTurn: advanceLocal, appendLog } = useEncounter();
  const { sendUpdate } = useSession();

  const advance = useCallback((logName) => {
    if (logName) {
      appendLog?.({ type: 'system', text: `${logName}'s turn ended (dock)` });
    }
    if (encounter?.foundryCombatId) {
      sendUpdate('global', RELAY.TURNCMD, { action: 'next-turn', ts: Date.now() });
    } else {
      advanceLocal?.();
    }
  }, [encounter?.foundryCombatId, sendUpdate, advanceLocal, appendLog]);

  return { advance };
}

export default useAdvanceTurn;
