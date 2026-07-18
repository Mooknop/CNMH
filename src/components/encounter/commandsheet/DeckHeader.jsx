// src/components/encounter/commandsheet/DeckHeader.jsx
// Sticky header of the Segmented Deck (encounter UI redesign): the turn budget
// (the retired ActionDial's hero — actions left, pips, reaction, MAP, round +
// clock, End Turn). Renders only on the actor's own turn; off-turn the
// EncounterStage (rendered by CharacterSheet) owns the "who's acting" context
// and the deck auto-selects React. The focused target's context lives in the
// full-card Dossier under the initiative strip (#1502 S1 — formerly Row B's
// FocusBanner here).
import React from 'react';
import { useEncounter } from '../../../hooks/useEncounter';
import { useTurnState, defaultTurnState } from '../../../hooks/useTurnState';
import { useSyncedState } from '../../../hooks/useSyncedState';
import { useEndTurn } from './useEndTurn';
import './DeckHeader.css';
import { APP, globalKey } from '../../../sync/keys';

const formatCombatTime = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const DeckHeader = ({ charId, characterName }) => {
  const { encounter } = useEncounter();
  const { turnState } = useTurnState(charId);
  const { endTurn, canSubmit, isMyTurn } = useEndTurn(charId, characterName);
  const [combatSecs] = useSyncedState(globalKey(APP.COMBATSECS), 0);

  if (!encounter || encounter.phase === 'idle') return null;

  // Setup: initiative is being gathered — a slim status line where the budget
  // will appear (InitiativeEntry above the deck owns the actual roll UI).
  if (encounter.phase === 'setup') {
    return (
      <div className="deck-header">
        <div className="deck-budget" role="region" aria-label="Turn budget">
          <span className="deck-budget-setup">Waiting for initiative…</span>
        </div>
      </div>
    );
  }

  // Off-turn there is no budget to show and the Dossier owns focus context —
  // nothing left to render.
  if (encounter.phase !== 'in-progress' || !isMyTurn) return null;

  const { actionsSpent, reactionAvailable, reactionSpent, hasStartedFirstTurn } =
    turnState || defaultTurnState();
  const attacksMade = turnState?.attacksMade ?? 0;
  const mapPenalty = Math.min(attacksMade, 2) * 5;
  const actionsLeft = Math.max(0, 3 - actionsSpent);

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

  return (
    <div className="deck-header">
      <div className="deck-budget" role="region" aria-label="Turn budget">
        <span className="deck-budget-count" aria-label={`${actionsLeft} actions left`}>
          <span className="deck-budget-num">{actionsLeft}</span>
          <span className="deck-budget-word">left</span>
        </span>
        <span className="deck-budget-pips" aria-label="Actions spent">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`deck-pip${n <= actionsSpent ? ' deck-pip--spent' : ''}`}
              aria-hidden="true"
            />
          ))}
        </span>
        {actionsSpent > 3 && (
          <span className="deck-budget-over" aria-label="Over action budget">
            +{actionsSpent - 3}
          </span>
        )}
        <span
          className={`deck-budget-reaction deck-budget-reaction--${reactionState}`}
          title={reactionLabels[reactionState]}
          aria-label={reactionLabels[reactionState]}
        >
          ↩
        </span>
        {attacksMade > 0 && (
          <span
            className="deck-budget-map"
            title="Multiple Attack Penalty (−4/−8 with agile weapons)"
            aria-label={`Multiple Attack Penalty −${mapPenalty}`}
          >
            MAP −{mapPenalty}
          </span>
        )}
        <span className="deck-budget-round">
          Round {encounter.round}
          {combatSecs > 0 && (
            <span className="deck-budget-elapsed" aria-label={`${combatSecs} seconds elapsed`}>
              {' · '}{formatCombatTime(combatSecs)}
            </span>
          )}
        </span>
        <button
          type="button"
          className="deck-budget-end"
          onClick={endTurn}
          disabled={!canSubmit}
          aria-label="End turn"
        >
          End Turn
        </button>
      </div>
    </div>
  );
};

export default DeckHeader;
