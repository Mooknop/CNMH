import React, { useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import { everyEntryHasInitiative } from '../../utils/encounterUtils';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import './gm.css';

// GM-only control panel for the live shared encounter at cnmh_encounter_global.
// Drives the loop: start (seeds pc entries) → setup (players type their rolls,
// GM can also add enemies) → in-progress (next turn / begin next round) → end
// (typed confirm; wipes the log too).

const GmEncounter = () => {
  const { characters } = useContent();
  const {
    encounter,
    startEncounter,
    addEnemy,
    removeEntry,
    beginRound1,
    advanceTurn,
    beginNextRound,
    endEncounter,
  } = useEncounter();

  const [enemyName, setEnemyName] = useState('');
  const [enemyInit, setEnemyInit] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);

  const phase = encounter?.phase || 'idle';
  const order = encounter?.order || [];
  const round = encounter?.round || 0;
  const currentIndex = encounter?.currentTurnIndex || 0;
  const canBeginRound1 = phase === 'setup' && everyEntryHasInitiative(order);

  const onStart = () => {
    if (!Array.isArray(characters) || characters.length === 0) return;
    startEncounter(characters.map((c) => ({ id: c.id, name: c.name })));
  };

  const onAddEnemy = () => {
    if (!enemyName.trim()) return;
    addEnemy(enemyName, enemyInit);
    setEnemyName('');
    setEnemyInit('');
  };

  return (
    <div className="gm-encounter">
      <header className="gm-encounter-header">
        <h2>Encounter</h2>
        <p className="gm-help">
          Start an encounter to share initiative + the turn tracker live with
          every player. Each player types their own roll into their Encounter
          tab. The turn tracker + click-to-spend actions ship in the next
          slice.
        </p>
      </header>

      {phase === 'idle' && (
        <div className="gm-actions">
          <button
            className="btn-primary"
            onClick={onStart}
            disabled={!characters || characters.length === 0}
            aria-label="start-encounter"
          >
            Start Encounter
          </button>
          <span className="gm-help">
            Seeds the order with every player character; you can add enemies
            after.
          </span>
        </div>
      )}

      {phase !== 'idle' && (
        <div className="gm-encounter-status">
          <strong>Phase:</strong> {phase}
          {phase === 'in-progress' && (
            <>
              {' '}
              · <strong>Round {round}</strong>
              {order[currentIndex] && (
                <>
                  {' '}
                  · current: <strong>{order[currentIndex].name}</strong>
                </>
              )}
            </>
          )}
        </div>
      )}

      {(phase === 'setup' || phase === 'in-progress') && (
        <div className="gm-encounter-order">
          <h3>Initiative order</h3>
          {order.length === 0 && <p>No entries yet.</p>}
          <ul className="gm-encounter-list" aria-label="encounter-order">
            {order.map((e, i) => (
              <li
                key={e.entryId}
                className={`gm-encounter-row ${
                  phase === 'in-progress' && i === currentIndex ? 'is-current' : ''
                } ${e.kind === 'enemy' ? 'is-enemy' : 'is-pc'}`}
                data-testid={`order-row-${e.entryId}`}
              >
                <span className="gm-encounter-name">{e.name}</span>
                <span className="gm-encounter-kind">{e.kind}</span>
                <span className="gm-encounter-init">
                  init {e.initiative === null ? '—' : e.initiative}
                </span>
                {phase === 'setup' && (
                  <button
                    className="btn-small btn-danger"
                    aria-label={`remove-${e.entryId}`}
                    onClick={() => removeEntry(e.entryId)}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {phase === 'setup' && (
        <div className="gm-encounter-add-enemy">
          <h3>Add enemy</h3>
          <div className="gm-row">
            <div className="form-group">
              <label>Name</label>
              <input
                aria-label="enemy-name"
                value={enemyName}
                onChange={(e) => setEnemyName(e.target.value)}
                placeholder="Goblin 1"
              />
            </div>
            <div className="form-group">
              <label>Initiative (optional now)</label>
              <input
                aria-label="enemy-initiative"
                type="number"
                value={enemyInit}
                onChange={(e) => setEnemyInit(e.target.value)}
              />
            </div>
            <button
              className="btn-secondary"
              onClick={onAddEnemy}
              disabled={!enemyName.trim()}
              aria-label="add-enemy"
            >
              Add enemy
            </button>
          </div>
        </div>
      )}

      {(phase === 'setup' || phase === 'in-progress') && (
        <div className="gm-actions">
          {phase === 'setup' && (
            <button
              className="btn-primary"
              onClick={beginRound1}
              disabled={!canBeginRound1}
              aria-label="begin-round-1"
            >
              Begin Round 1
            </button>
          )}
          {phase === 'in-progress' && (
            <>
              <button
                className="btn-primary"
                onClick={advanceTurn}
                aria-label="next-turn"
              >
                Next Turn
              </button>
              <button
                className="btn-secondary"
                onClick={beginNextRound}
                aria-label="begin-next-round"
              >
                Begin Next Round
              </button>
            </>
          )}
          <button
            className="btn-danger"
            onClick={() => setConfirmEnd(true)}
            aria-label="end-encounter"
          >
            End Encounter
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmEnd}
        title="End encounter"
        message="Ending the encounter clears the order, turn tracker, and combat log. This cannot be undone."
        confirmLabel="End encounter"
        requireType="END"
        onConfirm={() => {
          setConfirmEnd(false);
          endEncounter();
        }}
        onCancel={() => setConfirmEnd(false)}
      />
    </div>
  );
};

export default GmEncounter;
