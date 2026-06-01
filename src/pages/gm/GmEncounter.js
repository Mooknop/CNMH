import React, { useEffect, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import GmSaveRequest from '../../components/gm/GmSaveRequest';
import EffectsModal from '../../components/character-sheet/EffectsModal';
import './gm.css';

// Read-only mirror of the live Foundry combat, plus a one-time actor assignment
// UI. Encounter lifecycle is owned by Foundry via the bridge. The GM assigns
// Foundry combatants to CNMH characters here; the mapping is stored in session
// state and persists across reloads.

const GmEncounter = () => {
  const { characters } = useContent();
  const { encounter, actorMap, setActorMap } = useEncounter();
  const [isEffectsModalOpen, setIsEffectsModalOpen] = useState(false);

  const phase        = encounter?.phase          || 'idle';
  const order        = encounter?.order          || [];
  const round        = encounter?.round          || 0;
  const currentIndex = encounter?.currentTurnIndex ?? 0;
  const foundryLinked = !!encounter?.foundryCombatId;

  // Auto-match combatants to characters by exact name on first appearance.
  useEffect(() => {
    if (!order.length || !characters?.length) return;
    const additions = {};
    for (const entry of order) {
      if (!entry.foundryActorId) continue;
      if (actorMap[entry.foundryActorId]) continue; // already assigned
      const match = characters.find(
        (c) => c.name.toLowerCase() === entry.name.toLowerCase()
      );
      if (match) additions[entry.foundryActorId] = match.id;
    }
    if (Object.keys(additions).length) {
      setActorMap((prev) => ({ ...(prev || {}), ...additions }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter?.foundryCombatId, order.length]);

  const handleAssign = (foundryActorId, charId) => {
    setActorMap((prev) => {
      const next = { ...(prev || {}) };
      if (charId === '') {
        delete next[foundryActorId];
      } else {
        next[foundryActorId] = charId;
      }
      return next;
    });
  };

  return (
    <div className="gm-encounter">
      <header className="gm-encounter-header">
        <h2>Encounter</h2>
        {foundryLinked ? (
          <p className="gm-help">Live — controlled by Foundry VTT.</p>
        ) : (
          <p className="gm-help">Waiting for combat to start in Foundry.</p>
        )}
        <button
          className="btn-secondary"
          aria-label="Apply Effect to character"
          onClick={() => setIsEffectsModalOpen(true)}
        >
          Apply Effect
        </button>
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
        <GmSaveRequest pcEntries={order.filter((e) => e.kind === 'pc' && e.charId)} />
      )}

      {phase !== 'idle' && (
        <div className="gm-encounter-order">
          <h3>Initiative order</h3>
          {order.length === 0 && <p>No entries yet.</p>}
          <ul className="gm-encounter-list" aria-label="encounter-order">
            {order.map((e, i) => {
              const assigned = e.foundryActorId ? (actorMap[e.foundryActorId] ?? '') : '';
              return (
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
                  <span className="gm-encounter-init">
                    init {e.initiative === null || e.initiative === undefined ? '—' : e.initiative}
                  </span>
                  {e.foundryActorId && (
                    <select
                      className="gm-encounter-assign"
                      aria-label={`assign-${e.entryId}`}
                      value={assigned}
                      onChange={(ev) => handleAssign(e.foundryActorId, ev.target.value)}
                    >
                      <option value="">Not a PC</option>
                      {(characters || []).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <EffectsModal
        isOpen={isEffectsModalOpen}
        onClose={() => setIsEffectsModalOpen(false)}
        selfCharId="gm"
        selfName="GM"
      />
    </div>
  );
};

export default GmEncounter;
