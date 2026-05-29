import React from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import './gm.css';

// Read-only mirror of the live Foundry combat. Encounter lifecycle (start,
// advance, end) is owned by Foundry via the bridge — no authoring controls here.

const GmEncounter = () => {
  const { encounter } = useEncounter();

  const phase         = encounter?.phase          || 'idle';
  const order         = encounter?.order          || [];
  const round         = encounter?.round          || 0;
  const currentIndex  = encounter?.currentTurnIndex ?? 0;
  const foundryLinked = !!encounter?.foundryCombatId;

  return (
    <div className="gm-encounter">
      <header className="gm-encounter-header">
        <h2>Encounter</h2>
        {foundryLinked ? (
          <p className="gm-help">Live — controlled by Foundry VTT.</p>
        ) : (
          <p className="gm-help">Waiting for combat to start in Foundry.</p>
        )}
      </header>

      {phase !== 'idle' && (
        <div className="gm-encounter-status">
          <strong>Phase:</strong> {phase}
          {phase === 'in-progress' && (
            <>
              {' '}· <strong>Round {round}</strong>
              {order[currentIndex] && (
                <> · current: <strong>{order[currentIndex].name}</strong></>
              )}
            </>
          )}
        </div>
      )}

      {phase !== 'idle' && (
        <div className="gm-encounter-order">
          <h3>Initiative order</h3>
          {order.length === 0 && <p>No entries yet.</p>}
          <ul className="gm-encounter-list" aria-label="encounter-order">
            {order.map((e, i) => (
              <li
                key={e.entryId}
                className={[
                  'gm-encounter-row',
                  phase === 'in-progress' && i === currentIndex ? 'is-current' : '',
                  e.kind === 'enemy' ? 'is-enemy' : 'is-pc',
                ].filter(Boolean).join(' ')}
                data-testid={`order-row-${e.entryId}`}
              >
                <span className="gm-encounter-name">{e.name}</span>
                <span className="gm-encounter-kind">{e.kind}</span>
                <span className="gm-encounter-init">
                  init {e.initiative === null || e.initiative === undefined ? '—' : e.initiative}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default GmEncounter;
