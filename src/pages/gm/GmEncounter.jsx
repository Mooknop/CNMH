import React, { useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import { useSummons } from '../../hooks/useSummons';
import { useMinionActors } from '../../hooks/useMinionActors';
import MinionSpawnButton from '../../components/encounter/MinionSpawnButton';
import GmSaveRequest from '../../components/gm/GmSaveRequest';
import GmTriggerConsole from '../../components/gm/GmTriggerConsole';
import GmReactionBadge from '../../components/gm/GmReactionBadge';
import RequestedSaves from '../../components/encounter/RequestedSaves';
import PersistentChip from '../../components/encounter/PersistentChip';
import BystanderChip from '../../components/encounter/BystanderChip';
import EffectsModal from '../../components/character-sheet/EffectsModal';
import AddSummonModal from '../../components/gm/AddSummonModal';
import PlayModeControl from '../../components/gm/PlayModeControl';
import './gm.css';

// Read-only mirror of the live Foundry combat, plus a manual actor assignment
// UI. Encounter lifecycle is owned by Foundry via the bridge. Actor-map
// auto-matching by name runs app-wide via ActorMapSync; here the GM can
// override individual assignments or explicitly mark a combatant as "Not a PC".
//
// "Not a PC" stores null (not a deletion) so ActorMapSync's write-guard treats
// it as a decided slot and never re-matches it on refresh.

const GmEncounter = () => {
  const { characters } = useContent();
  const { encounter, actorMap, setActorMap } = useEncounter();
  const { removeSummon } = useSummons();
  const { links: minionLinks } = useMinionActors();
  const [isEffectsModalOpen, setIsEffectsModalOpen] = useState(false);
  const [isAddSummonOpen, setIsAddSummonOpen] = useState(false);

  const phase        = encounter?.phase          || 'idle';
  const order        = encounter?.order          || [];
  const round        = encounter?.round          || 0;
  const currentIndex = encounter?.currentTurnIndex ?? 0;
  const foundryLinked = !!encounter?.foundryCombatId;

  const handleAssign = (foundryActorId, charId) => {
    setActorMap((prev) => {
      const next = { ...(prev || {}) };
      if (charId === '') {
        next[foundryActorId] = null; // explicit sentinel: "not a PC, don't re-match"
      } else {
        next[foundryActorId] = charId;
      }
      return next;
    });
  };

  return (
    <div className="gm-encounter">
      <PlayModeControl />
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
        <button
          className="btn-secondary"
          aria-label="Add summon to encounter"
          onClick={() => setIsAddSummonOpen(true)}
        >
          Add summon
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

      {Object.keys(minionLinks).length > 0 && (
        <div className="gm-encounter-minions">
          <h3>Companions &amp; familiars</h3>
          <ul className="gm-encounter-minion-list" aria-label="minion-spawn-list">
            {Object.entries(minionLinks).map(([key, link]) => {
              const owner = (characters || []).find((c) => c.id === link.ownerCharId);
              return (
                <li key={key} className="gm-encounter-minion-row">
                  <span className="gm-encounter-minion-name">
                    {link.name}
                    {owner && <span className="gm-encounter-minion-owner"> · {owner.name}</span>}
                  </span>
                  <MinionSpawnButton ownerId={link.ownerCharId} role={link.role} />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {phase !== 'idle' && (
        <GmSaveRequest pcEntries={order.filter((e) => e.kind === 'pc' && e.charId)} />
      )}

      {phase !== 'idle' && (
        <GmTriggerConsole pcEntries={order.filter((e) => e.kind === 'pc' && e.charId)} round={round} />
      )}

      {phase !== 'idle' && <RequestedSaves />}

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
                    e.kind === 'summon' ? 'is-summon' : e.kind === 'enemy' ? 'is-enemy' : 'is-pc',
                  ].filter(Boolean).join(' ')}
                  data-testid={`order-row-${e.entryId}`}
                >
                  <span className="gm-encounter-name">{e.name}</span>
                  <PersistentChip entry={e} />
                  <BystanderChip entry={e} />
                  {phase === 'in-progress' && e.kind === 'pc' && e.charId && (
                    <GmReactionBadge charId={e.charId} name={e.name} />
                  )}
                  {e.kind === 'summon' ? (
                    <>
                      <span className="gm-encounter-summon-hp" aria-label={`${e.name} hp`}>
                        {e.bestiary?.hp?.current ?? 0}/{e.bestiary?.hp?.max ?? 0}
                      </span>
                      <button
                        className="btn-secondary gm-encounter-dismiss"
                        aria-label={`Dismiss ${e.name}`}
                        onClick={() => removeSummon(e.entryId)}
                      >
                        Dismiss
                      </button>
                    </>
                  ) : (
                    <span className="gm-encounter-init">
                      init {e.initiative === null || e.initiative === undefined ? '—' : e.initiative}
                    </span>
                  )}
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
      <AddSummonModal
        isOpen={isAddSummonOpen}
        onClose={() => setIsAddSummonOpen(false)}
      />
    </div>
  );
};

export default GmEncounter;
