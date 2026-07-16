// src/components/encounter/commandsheet/useEndTurn.js
// End Turn, extracted from the retired ActionDial so the Segmented Deck's
// fused header owns the turn submission: omen expiry (#227), sustain-lapse
// sweep (#220), advance (Foundry or local), and the next-PC turnstate
// pre-reset. (Movement cancellation stays in TurnTrackerPanel, which closes
// its own move UI when isMyTurn flips false.)
import { useEncounter } from '../../../hooks/useEncounter';
import { useTurnState } from '../../../hooks/useTurnState';
import { useSession } from '../../../contexts/SessionContext';
import { useOmen } from '../../../hooks/useOmen';
import { useSustains } from '../../../hooks/useSustains';
import { nextTurnIndex } from '../../../utils/encounterUtils';
import { RESET_STATE, writeLocal } from './turnEnd';
import { RELAY, APP, syncKey } from '../../../sync/keys';

export function useEndTurn(charId, characterName) {
  const { encounter, advanceTurn, appendLog } = useEncounter();
  const { turnState } = useTurnState(charId);
  const { sendUpdate } = useSession();
  const omen = useOmen(charId);
  const { sustains, end: endSustain } = useSustains(charId);

  const order = encounter?.order || [];
  const currentEntry = order[encounter?.currentTurnIndex ?? 0] || null;
  const isMyTurn =
    !!currentEntry && currentEntry.kind === 'pc' && currentEntry.charId === charId;
  const canSubmit = isMyTurn && (turnState?.actionsSpent ?? 0) <= 3;

  const endTurn = () => {
    if (!canSubmit) return;

    // A failed Harrow Cast flat check loses the omen at end of turn (#227).
    if (omen.pendingLoss && omen.suit) {
      appendLog({
        type: 'system',
        text: `${characterName}'s harrow omen (${omen.suit}) is lost (failed Harrow Cast flat check)`,
      });
      omen.clear();
    }

    // Sustained spells not sustained this round lapse when the turn ends (#220).
    sustains.forEach((s) => {
      if (s.lastSustainedRound !== encounter.round) {
        appendLog({ type: 'system', text: `${s.spellName} ends (not sustained)` });
        endSustain(s.id);
      }
    });

    // Determine next actor BEFORE advancing so we can reset their state.
    const { currentTurnIndex: nextIdx } = nextTurnIndex(
      order,
      encounter.currentTurnIndex || 0,
      encounter.round || 1
    );
    const nextEntry = order[nextIdx] || null;

    appendLog({
      type: 'action',
      charId,
      text: `${characterName} submitted their turn`,
    });

    if (encounter.foundryCombatId) {
      sendUpdate('global', RELAY.TURNCMD, { action: 'next-turn', ts: Date.now() });
    } else {
      advanceTurn();
    }

    if (nextEntry && nextEntry.kind === 'pc') {
      const key = syncKey(APP.TURNSTATE, nextEntry.charId);
      writeLocal(key, RESET_STATE);
      sendUpdate(nextEntry.charId, APP.TURNSTATE, RESET_STATE);
    }
  };

  return { endTurn, canSubmit, isMyTurn };
}
