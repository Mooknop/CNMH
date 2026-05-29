import React from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState, defaultTurnState } from '../../hooks/useTurnState';
import { useSession } from '../../contexts/SessionContext';
import { nextTurnIndex } from '../../utils/encounterUtils';
import './TurnTrackerPanel.css';

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
  const { turnState } = useTurnState(charId);
  const { sendUpdate } = useSession();

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
    </div>
  );
};

export default TurnTrackerPanel;
