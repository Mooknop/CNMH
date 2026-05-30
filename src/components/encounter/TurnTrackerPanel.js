import React, { useState, useRef, useEffect } from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState, defaultTurnState } from '../../hooks/useTurnState';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSession } from '../../contexts/SessionContext';
import { nextTurnIndex } from '../../utils/encounterUtils';
import MoveGridPicker from './MoveGridPicker';
import './TurnTrackerPanel.css';

// PF2e movement actions the player can pick before requesting reachable squares.
const MOVE_ACTIONS = [
  { type: 'step',   label: 'Step',   cost: 1 },
  { type: 'stride', label: 'Stride', cost: 1 },
];

const RESET_STATE = {
  actionsSpent: 0,
  reactionAvailable: true,
  reactionSpent: false,
  hasStartedFirstTurn: true,
  actionsLog: [],
};

const writeLocal = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch { /* noop */ }
};

const ActionPip = ({ filled }) => (
  <span className={`ttp-pip${filled ? ' ttp-pip--filled' : ''}`} aria-hidden="true" />
);

const ReactionIcon = ({ state }) => {
  const labels = {
    unavailable: 'Reaction (unavailable until your first turn)',
    available: 'Reaction (available)',
    spent: 'Reaction (spent)',
  };
  return (
    <span
      className={`ttp-reaction ttp-reaction--${state}`}
      title={labels[state]}
      aria-label={labels[state]}
    >
      ↩
    </span>
  );
};

const TurnTrackerPanel = ({ charId, characterName }) => {
  const { encounter, advanceTurn, appendLog } = useEncounter();
  const { turnState, spendActions } = useTurnState(charId);
  const { sendUpdate } = useSession();

  // ── Movement (Feature 3) ──────────────────────────────────────────────────
  // moveStage: null | 'choosing' | 'awaiting-opts' | 'picking' | 'awaiting-done'
  const [moveStage, setMoveStage]       = useState(null);
  const [pendingMoveType, setPendingMoveType] = useState(null);
  const [pickerOpts, setPickerOpts]     = useState(null);
  const moveSessionTs = useRef(null);
  // Bridge responses arrive as cnmh_* keys via the relay.
  const [moveOpts] = useSyncedState(`cnmh_moveopts_${charId}`, null);
  const [moveDone] = useSyncedState(`cnmh_movedone_${charId}`, null);

  // Reachable squares arrived → open the picker (only for the request we made).
  useEffect(() => {
    if (moveStage === 'awaiting-opts' && moveOpts && moveOpts.reqTs === moveSessionTs.current) {
      setPickerOpts(moveOpts);
      setMoveStage('picking');
    }
  }, [moveOpts, moveStage]);

  // Move completed in Foundry → log it and close.
  useEffect(() => {
    if (moveStage === 'awaiting-done' && moveDone && moveDone.reqTs === moveSessionTs.current) {
      appendLog({ type: 'action', charId, text: `${characterName} moved ${moveDone.feetMoved} ft` });
      setMoveStage(null);
      setPickerOpts(null);
      setPendingMoveType(null);
    }
  }, [moveDone, moveStage, appendLog, charId, characterName]);

  const requestMove = (moveType) => {
    const ts = Date.now();
    moveSessionTs.current = ts;
    setPendingMoveType(moveType);
    setMoveStage('awaiting-opts');
    sendUpdate(charId, 'movereq', { moveType, ts });
  };

  const confirmMove = (destination) => {
    const action = MOVE_ACTIONS.find((a) => a.type === pendingMoveType);
    const cost = action?.cost ?? 1;
    sendUpdate(charId, 'moveconfirm', {
      destination,
      moveType: pendingMoveType,
      actionCost: cost,
      ts: moveSessionTs.current,
    });
    spendActions(cost, action?.label || 'Move');
    setMoveStage('awaiting-done');
  };

  const cancelMove = () => {
    setMoveStage(null);
    setPickerOpts(null);
    setPendingMoveType(null);
  };

  if (!encounter || encounter.phase === 'idle') return null;

  const order = encounter.order || [];
  const currentEntry = order[encounter.currentTurnIndex] || null;
  const isMyTurn =
    currentEntry &&
    currentEntry.kind === 'pc' &&
    currentEntry.charId === charId;

  const { actionsSpent, reactionAvailable, reactionSpent, hasStartedFirstTurn } =
    turnState || defaultTurnState();

  const canSubmit = isMyTurn && actionsSpent <= 3;

  const handleSubmit = () => {
    if (!canSubmit) return;

    cancelMove(); // close any open move UI when the turn ends

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

  const reactionState = !hasStartedFirstTurn
    ? 'unavailable'
    : reactionSpent
    ? 'spent'
    : reactionAvailable
    ? 'available'
    : 'unavailable';

  const isSetup = encounter.phase === 'setup';
  const isInProgress = encounter.phase === 'in-progress';

  return (
    <div className="ttp-panel" role="region" aria-label="Encounter tracker">
      {/* Initiative order strip */}
      <div className="ttp-order" aria-label="Initiative order">
        {order.map((entry, idx) => {
          const isCurrent = isInProgress && idx === encounter.currentTurnIndex;
          return (
            <div
              key={entry.entryId}
              className={[
                'ttp-entry',
                isCurrent ? 'ttp-entry--current' : '',
                entry.kind === 'enemy' ? 'ttp-entry--enemy' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={isCurrent ? 'true' : undefined}
            >
              <span className="ttp-entry-name">{entry.name}</span>
              <span className="ttp-entry-init">
                {entry.initiative !== null && entry.initiative !== undefined
                  ? entry.initiative
                  : '?'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Round + current actor */}
      {isInProgress && (
        <div className="ttp-status">
          <span className="ttp-round">Round {encounter.round}</span>
          {currentEntry && (
            <span className="ttp-current-actor">
              {currentEntry.kind === 'enemy'
                ? `Enemy: ${currentEntry.name}'s turn`
                : `${currentEntry.name}'s turn`}
            </span>
          )}
        </div>
      )}

      {isSetup && (
        <div className="ttp-status ttp-status--setup">
          Waiting for all players to enter initiative…
        </div>
      )}

      {/* Local character controls — only on their turn, only for PCs */}
      {isInProgress && isMyTurn && (
        <div className="ttp-controls" role="group" aria-label="Turn controls">
          <div className="ttp-pips" aria-label="Actions spent">
            {[1, 2, 3].map((n) => (
              <ActionPip key={n} filled={n <= actionsSpent} />
            ))}
            {actionsSpent > 3 && (
              <span className="ttp-over-budget" aria-label="Over action budget">
                +{actionsSpent - 3}
              </span>
            )}
          </div>

          <ReactionIcon state={reactionState} />

          {moveStage === null && (
            <button
              className="btn-secondary ttp-move"
              onClick={() => setMoveStage('choosing')}
              aria-label="Move"
            >
              Move
            </button>
          )}

          <button
            className="btn-primary ttp-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-label="Submit turn"
          >
            Submit Turn
          </button>
        </div>
      )}

      {/* Movement sub-UI */}
      {isInProgress && isMyTurn && moveStage === 'choosing' && (
        <div className="ttp-move-choose" role="group" aria-label="Choose move action">
          {MOVE_ACTIONS.map((a) => (
            <button
              key={a.type}
              className="btn-secondary"
              onClick={() => requestMove(a.type)}
              aria-label={`move-${a.type}`}
            >
              {a.label} <span className="ttp-move-cost">({a.cost})</span>
            </button>
          ))}
          <button className="btn-text" onClick={cancelMove} aria-label="cancel-move">
            Cancel
          </button>
        </div>
      )}

      {isInProgress && isMyTurn && moveStage === 'awaiting-opts' && (
        <div className="ttp-move-status">Calculating reachable squares…</div>
      )}

      {isInProgress && isMyTurn && moveStage === 'picking' && pickerOpts && (
        <MoveGridPicker
          origin={pickerOpts.origin}
          reachable={pickerOpts.reachable}
          blocked={pickerOpts.blocked}
          maxFeet={pickerOpts.maxFeet}
          onSelect={confirmMove}
          onCancel={cancelMove}
        />
      )}

      {isInProgress && isMyTurn && moveStage === 'awaiting-done' && (
        <div className="ttp-move-status">Moving…</div>
      )}
    </div>
  );
};

export default TurnTrackerPanel;
