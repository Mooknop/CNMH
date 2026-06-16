// src/components/encounter/commandsheet/ActionDial.jsx
// Command Sheet "hero" (#411) — the always-visible turn budget. Lifts the action
// pips, MAP readout, reaction indicator, round, and turn submission out of
// TurnTrackerPanel into a single fixed dial. On the actor's own turn it shows the
// full budget + End Turn; off-turn it slims to a waiting line plus quick access to
// the character's reactions (Shield Block, etc.) per the off-turn-dial decision.
import React from 'react';
import { useEncounter } from '../../../hooks/useEncounter';
import { useTurnState, defaultTurnState } from '../../../hooks/useTurnState';
import { useSyncedState } from '../../../hooks/useSyncedState';
import { useSession } from '../../../contexts/SessionContext';
import { useOmen } from '../../../hooks/useOmen';
import { useSustains } from '../../../hooks/useSustains';
import { getReactions } from '../../../utils/actionUtils';
import { nextTurnIndex } from '../../../utils/encounterUtils';
import { RESET_STATE, writeLocal } from './turnEnd';
import './ActionDial.css';

const formatCombatTime = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const ActionDial = ({ charId, characterName, character = null }) => {
  const { encounter, advanceTurn, appendLog } = useEncounter();
  const { turnState, spendReaction } = useTurnState(charId);
  const { sendUpdate } = useSession();
  const omen = useOmen(charId);
  const { sustains, end: endSustain } = useSustains(charId);
  const [combatSecs] = useSyncedState('cnmh_combatsecs_global', 0);

  if (!encounter || encounter.phase === 'idle') return null;

  const order = encounter.order || [];
  const currentTurnIndex = encounter.currentTurnIndex ?? 0;
  const currentEntry = order[currentTurnIndex] || null;
  const isMyTurn =
    !!currentEntry && currentEntry.kind === 'pc' && currentEntry.charId === charId;
  const isInProgress = encounter.phase === 'in-progress';
  const isSetup = encounter.phase === 'setup';

  const { actionsSpent, reactionAvailable, reactionSpent, hasStartedFirstTurn } =
    turnState || defaultTurnState();
  const attacksMade = turnState?.attacksMade ?? 0;
  const mapPenalty = Math.min(attacksMade, 2) * 5;
  const actionsLeft = Math.max(0, 3 - actionsSpent);
  const canSubmit = isMyTurn && actionsSpent <= 3;

  const reactionState = !hasStartedFirstTurn
    ? 'unavailable'
    : reactionSpent
    ? 'spent'
    : reactionAvailable
    ? 'available'
    : 'unavailable';

  const reactionLabels = {
    unavailable: 'Reaction (unavailable until your first turn)',
    available: 'Reaction (available)',
    spent: 'Reaction (spent)',
  };

  // End Turn — the former TurnTrackerPanel.handleSubmit, moved here intact: omen
  // expiry, sustain-lapse sweep, advance (Foundry or local), and the next-PC
  // turnstate pre-reset. (Movement cancellation stays in TurnTrackerPanel, which
  // closes its own move UI when isMyTurn flips false.)
  const handleEndTurn = () => {
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
      sendUpdate('global', 'turncmd', { action: 'next-turn', ts: Date.now() });
    } else {
      advanceTurn();
    }

    if (nextEntry && nextEntry.kind === 'pc') {
      const key = `cnmh_turnstate_${nextEntry.charId}`;
      writeLocal(key, RESET_STATE);
      sendUpdate(nextEntry.charId, 'turnstate', RESET_STATE);
    }
  };

  // Off-turn reactions (Shield Block, Counterspell, …) surface here while it
  // isn't the player's turn. Tapping spends the reaction + logs it; deeper
  // resolution (targets/rolls) still lives on the existing ReactionPrompt /
  // Reactions tab path — the dial just gives quick off-turn access.
  const offTurnReactions =
    !isMyTurn && reactionState === 'available' && character
      ? getReactions(character).filter((r) => r.active !== false)
      : [];

  const handleUseReaction = (r) => {
    spendReaction(r.name);
    appendLog({
      type: 'action',
      charId,
      text: `${characterName} used ${r.name} (reaction)`,
    });
  };

  return (
    <div className="cmd-dial" role="region" aria-label="Turn budget">
      <div className="cmd-dial-status">
        {isSetup && <span className="cmd-dial-setup">Waiting for initiative…</span>}
        {isInProgress && (
          <>
            <span className="cmd-dial-round">Round {encounter.round}</span>
            {combatSecs > 0 && (
              <span
                className="cmd-dial-elapsed"
                aria-label={`${combatSecs} seconds elapsed`}
              >
                {formatCombatTime(combatSecs)}
              </span>
            )}
            {!isMyTurn && currentEntry && (
              <span className="cmd-dial-waiting">
                {currentEntry.kind === 'enemy'
                  ? `Enemy: ${currentEntry.name}'s turn`
                  : `${currentEntry.name}'s turn`}
              </span>
            )}
          </>
        )}
      </div>

      {isInProgress && isMyTurn && (
        <div className="cmd-dial-hero">
          <div className="cmd-dial-count" aria-label={`${actionsLeft} actions left`}>
            <span className="cmd-dial-count-num">{actionsLeft}</span>
            <span className="cmd-dial-count-label">left</span>
          </div>

          <div className="cmd-dial-pips" aria-label="Actions spent">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`cmd-dial-pip${n <= actionsSpent ? ' cmd-dial-pip--filled' : ''}`}
                aria-hidden="true"
              />
            ))}
            {actionsSpent > 3 && (
              <span className="cmd-dial-over" aria-label="Over action budget">
                +{actionsSpent - 3}
              </span>
            )}
            <span
              className={`cmd-dial-reaction cmd-dial-reaction--${reactionState}`}
              title={reactionLabels[reactionState]}
              aria-label={reactionLabels[reactionState]}
            >
              ↩
            </span>
            {attacksMade > 0 && (
              <span
                className="cmd-dial-map"
                title="Multiple Attack Penalty (−4/−8 with agile weapons)"
                aria-label={`Multiple Attack Penalty −${mapPenalty}`}
              >
                MAP −{mapPenalty}
              </span>
            )}
          </div>

          <button
            type="button"
            className="btn-primary cmd-dial-end"
            onClick={handleEndTurn}
            disabled={!canSubmit}
            aria-label="End turn"
          >
            End Turn
          </button>
        </div>
      )}

      {isInProgress && !isMyTurn && (
        <div className="cmd-dial-offturn">
          <span
            className={`cmd-dial-reaction cmd-dial-reaction--${reactionState}`}
            title={reactionLabels[reactionState]}
            aria-label={reactionLabels[reactionState]}
          >
            ↩
          </span>
          {offTurnReactions.length > 0 && (
            <div className="cmd-dial-reactions" aria-label="Available reactions">
              {offTurnReactions.map((r) => (
                <button
                  key={r.name}
                  type="button"
                  className="cmd-dial-reaction-chip"
                  onClick={() => handleUseReaction(r)}
                  title={r.description || undefined}
                  aria-label={`Use ${r.name}`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ActionDial;
