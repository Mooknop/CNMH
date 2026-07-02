// src/components/encounter/commandsheet/InitiativeStrip.jsx
// Command Sheet initiative strip (#411, #429). Compact horizontal turn order
// lifted from TurnTrackerPanel. Tapping any combatant focuses it (toggle): an
// enemy drives the foe stat line + offensive tiles, an ally drives the support
// banner + ally-targeted support (#429). All the existing per-entry chips travel
// with it (flanked / Hunt Prey / conditions / aura / omen / stance / playing /
// persistent).
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
import HuntPreyBadge from '../HuntPreyBadge';
import EnemyConditionBadge from '../EnemyConditionBadge';
import './InitiativeStrip.css';

const InitiativeStrip = ({ charId }) => {
  const { encounter } = useEncounter();
  const [flankedMap] = useSyncedState('cnmh_flanked_global', {});
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
      <PersistentChip entry={entry} viewerCharId={charId} />
      <span className="cmd-init-init">
        {entry.initiative !== null && entry.initiative !== undefined ? entry.initiative : '?'}
      </span>
    </>
  );

  return (
    <div className="cmd-init" aria-label="Initiative order">
      {order.map((entry, idx) => {
        const isCurrent = isInProgress && idx === encounter.currentTurnIndex;
        const isFocused = entry.entryId === focusId;
        const className = [
          'cmd-init-entry',
          isCurrent ? 'cmd-init-entry--current' : '',
          entry.kind === 'enemy' ? 'cmd-init-entry--enemy' : '',
          isFocused ? 'cmd-init-entry--focused' : '',
        ].filter(Boolean).join(' ');

        // Every combatant is tap-to-focus (#429): foes drive offense, allies
        // drive support.
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
