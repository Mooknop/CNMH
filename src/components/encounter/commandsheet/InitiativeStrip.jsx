// src/components/encounter/commandsheet/InitiativeStrip.jsx
// The TARGET ▸ selector (#411, #429, #1502 S2) — the compact horizontal turn
// order, restyled as the dossier's target picker. Tapping any combatant
// focuses it (toggle): an enemy drives the foe dossier + offensive tiles, an
// ally the support dossier, your own entry the self dossier. Entries tint by
// kind (enemy peril · ally arcane · self ember), the focused one filled solid.
// All the existing per-entry chips travel with it (flanked / Hunt Prey /
// conditions / aura / omen / stance / playing / persistent).
import React from 'react';
import { useEncounter } from '../../../hooks/useEncounter';
import { useSyncedState } from '../../../hooks/useSyncedState';
import { useFocusTarget } from '../../../hooks/useFocusTarget';
import PersistentChip from '../PersistentChip';
import AuraChip from '../AuraChip';
import OmenChip from '../OmenChip';
import StanceChip from '../StanceChip';
import BystanderChip from '../BystanderChip';
import PlayingChip from '../PlayingChip';
import BuffChips from '../BuffChips';
import HuntPreyBadge from '../HuntPreyBadge';
import EnemyConditionBadge from '../EnemyConditionBadge';
import './InitiativeStrip.css';
import { RELAY, globalKey } from '../../../sync/keys';

const InitiativeStrip = ({ charId }) => {
  const { encounter } = useEncounter();
  const [flankedMap] = useSyncedState(globalKey(RELAY.FLANKED), {});
  const { focusId, toggleFocus } = useFocusTarget(charId);

  if (!encounter || encounter.phase === 'idle') return null;

  const order = encounter.order || [];
  const isInProgress = encounter.phase === 'in-progress';

  const renderInner = (entry) => (
    <>
      <span className="cmd-init-name">{entry.name}</span>
      {entry.kind === 'enemy' && flankedMap?.[entry.entryId] && (
        <span className="cmd-init-flanked" aria-label={`${entry.name} is flanked`} title="Flanked">⚔</span>
      )}
      {entry.kind === 'enemy' && <HuntPreyBadge enemyEntry={entry} order={order} />}
      {entry.kind === 'enemy' && <EnemyConditionBadge enemyEntry={entry} />}
      {entry.kind === 'pc' && <AuraChip entry={entry} />}
      {entry.kind === 'pc' && <OmenChip entry={entry} />}
      {entry.kind === 'pc' && <StanceChip entry={entry} />}
      {entry.kind === 'pc' && <BystanderChip entry={entry} />}
      {entry.kind === 'pc' && <PlayingChip entry={entry} />}
      {entry.kind === 'pc' && <BuffChips entry={entry} />}
      <PersistentChip entry={entry} viewerCharId={charId} />
      <span className="cmd-init-init">
        {entry.initiative !== null && entry.initiative !== undefined ? entry.initiative : '?'}
      </span>
    </>
  );

  return (
    <div className="cmd-init" aria-label="Initiative order">
      <span className="cmd-init-label" aria-hidden="true">Target ▸</span>
      {order.map((entry, idx) => {
        const isCurrent = isInProgress && idx === encounter.currentTurnIndex;
        const isFocused = entry.entryId === focusId;
        // Kind tint: enemy peril, another PC arcane, the viewer's own entry ember.
        const kindClass = entry.kind === 'enemy'
          ? 'cmd-init-entry--enemy'
          : entry.charId === charId
          ? 'cmd-init-entry--self'
          : 'cmd-init-entry--ally';
        const className = [
          'cmd-init-entry',
          kindClass,
          isCurrent ? 'cmd-init-entry--current' : '',
          isFocused ? 'cmd-init-entry--focused' : '',
        ].filter(Boolean).join(' ');

        // Every combatant is tap-to-focus (#429): foes drive offense, allies
        // drive support, yourself the personal readout (#1502 S2).
        return (
          <button
            key={entry.entryId}
            type="button"
            className={className}
            aria-current={isCurrent ? 'true' : undefined}
            aria-pressed={isFocused}
            aria-label={`Focus ${entry.name}`}
            onClick={() => toggleFocus(entry.entryId)}
          >
            {renderInner(entry)}
          </button>
        );
      })}
    </div>
  );
};

export default InitiativeStrip;
