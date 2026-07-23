import React, { useState } from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import { useEnemyEffects } from '../../hooks/useEnemyEffects';
import { useContent } from '../../contexts/ContentContext';
import PersistentChip from '../encounter/PersistentChip';
import BystanderChip from '../encounter/BystanderChip';
import GmReactionBadge from './GmReactionBadge';
import './DockOrderStrip.css';

// Dock order strip (#1537 S5) — the whole initiative order at a glance:
// current-turn marker, per-combatant badges (enemy conditions, persistent
// damage with its clear popover, bystanders, PC reaction state), and INLINE
// actor-map assignment. The assign select shows automatically for undecided
// combatants (no actorMap verdict yet — the auto-matcher hasn't fired and the
// GM hasn't ruled); decided rows collapse to a ✎ so a wrong auto-match is
// still fixable without leaving the dock. "Not a PC" stores the null sentinel
// so ActorMapSync never re-matches a decided slot (GmEncounter precedent).
const DockOrderStrip = () => {
  const { encounter, actorMap, setActorMap } = useEncounter();
  const { effectsFor } = useEnemyEffects();
  const { characters } = useContent();
  const [editingEntryId, setEditingEntryId] = useState(null);

  const phase = encounter?.phase || 'idle';
  const order = encounter?.order || [];
  const currentIndex = encounter?.currentTurnIndex ?? 0;
  if (phase === 'idle' || order.length === 0) return null;

  const assign = (foundryActorId, charId) => {
    setActorMap((prev) => {
      const next = { ...(prev || {}) };
      next[foundryActorId] = charId === '' ? null : charId;
      return next;
    });
    setEditingEntryId(null);
  };

  return (
    <div className="dock-order" role="list" aria-label="Initiative order">
      {order.map((e, i) => {
        const current = phase === 'in-progress' && i === currentIndex;
        const decided = e.foundryActorId ? actorMap?.[e.foundryActorId] !== undefined : true;
        const showSelect = !!e.foundryActorId && (!decided || editingEntryId === e.entryId);
        const enemyConditions = e.kind === 'enemy' ? (effectsFor(e.entryId).conditions || []) : [];
        const kindClass = e.kind === 'summon' ? 'is-summon' : e.kind === 'enemy' ? 'is-enemy' : 'is-pc';
        return (
          <div
            key={e.entryId}
            role="listitem"
            className={`dock-order-entry ${kindClass}${current ? ' is-current' : ''}`}
            data-testid={`dock-order-${e.entryId}`}
          >
            <span className="dock-order-top">
              {current && <span className="dock-order-marker" aria-hidden="true">▶</span>}
              <span className="dock-order-name">{e.name}</span>
              <span className="dock-order-init">
                {e.initiative === null || e.initiative === undefined ? '—' : e.initiative}
              </span>
            </span>
            <span className="dock-order-badges">
              {enemyConditions.length > 0 && (
                <span
                  className="dock-order-cond"
                  aria-label={`${e.name}: ${enemyConditions.length} applied conditions`}
                >
                  {enemyConditions.length} cond
                </span>
              )}
              <PersistentChip entry={e} />
              <BystanderChip entry={e} />
              {phase === 'in-progress' && e.kind === 'pc' && e.charId && (
                <GmReactionBadge charId={e.charId} name={e.name} />
              )}
              {!!e.foundryActorId && decided && !showSelect && (
                <button
                  type="button"
                  className="dock-order-edit"
                  aria-label={`Reassign ${e.name}`}
                  onClick={() => setEditingEntryId(e.entryId)}
                >
                  ✎
                </button>
              )}
            </span>
            {showSelect && (
              <select
                className="dock-order-assign"
                aria-label={`assign-${e.entryId}`}
                value={actorMap?.[e.foundryActorId] ?? ''}
                onChange={(ev) => assign(e.foundryActorId, ev.target.value)}
              >
                <option value="">Not a PC</option>
                {(characters || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DockOrderStrip;
