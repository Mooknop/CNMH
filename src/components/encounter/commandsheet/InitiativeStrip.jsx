// src/components/encounter/commandsheet/InitiativeStrip.jsx
// The TARGET ▸ selector (#411, #429, #1502 S2) — the compact horizontal turn
// order, restyled as the dossier's target picker. Tapping any combatant
// focuses it (toggle): an enemy drives the foe dossier + offensive tiles, an
// ally the support dossier, your own entry the self dossier. Entries tint by
// kind (enemy peril · ally arcane · self ember), the focused one filled solid.
// All the existing per-entry chips travel with it (flanked / Hunt Prey /
// conditions / aura / omen / stance / playing / persistent).
//
// #1749 ruling addendum — special case: the strip's tap-to-focus IS its
// candidate-list picker, but it's also the turn-order display, and this
// component renders both off the same `order.map`. The ruling extends the
// hidden filter to "the focus-row picker candidates," not to the visible
// turn order (that's a bigger table-visibility surface than a picker, and
// changing it wasn't asked for here — see the PR body for the follow-up
// question). So a hidden entry stays RENDERED (name, badges, position in the
// strip all unchanged) but is no longer focusable: its tap is a no-op and it
// carries aria-disabled. This does not, on its own, stop a hidden entry's
// name from being visible in the strip — only from becoming the focus (and
// therefore the dossier / other pickers that read focusEnemy/focusAlly/
// focusSelf, which useFocusTarget already degrades to null for a hidden
// entry).
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
        // #1749 ruling addendum: hidden entries stay visible in this strip
        // (the turn-order display, untouched by this ruling) but drop out of
        // the focus-row picker candidates — see the file-header note.
        const isHiddenEntry = !!entry.hidden;
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
        // drive support, yourself the personal readout (#1502 S2) — except a
        // hidden one, which the tap no-ops on (#1749 ruling addendum).
        return (
          <button
            key={entry.entryId}
            type="button"
            className={className}
            aria-current={isCurrent ? 'true' : undefined}
            aria-pressed={isFocused}
            aria-disabled={isHiddenEntry || undefined}
            aria-label={`Focus ${entry.name}`}
            onClick={() => { if (!isHiddenEntry) toggleFocus(entry.entryId); }}
          >
            {renderInner(entry)}
          </button>
        );
      })}
    </div>
  );
};

export default InitiativeStrip;
