// src/components/encounter/commandsheet/InitiativeStrip.jsx
// The TARGET ▸ selector (#411, #429, #1502 S2) — the compact horizontal turn
// order, restyled as the dossier's target picker. Tapping any combatant
// focuses it (toggle): an enemy drives the foe dossier + offensive tiles, an
// ally the support dossier, your own entry the self dossier. Entries tint by
// kind (enemy peril · ally arcane · self ember), the focused one filled solid.
// All the existing per-entry chips travel with it (flanked / Hunt Prey /
// conditions / aura / omen / stance / playing / persistent).
//
// #1749 ruling addendum 2 — the DISPLAY hides hidden combatants, matching
// Foundry's own tracker (which simply omits hidden tokens for players rather
// than showing a disabled row). This replaces #1758's interim state, where a
// hidden entry stayed rendered with its tap disabled (aria-disabled, no-op):
// that was fine for every OTHER order-derived picker (a dropdown/checkbox
// candidate list has no "just don't list it" cost), but the strip doubles as
// the visible turn-order display, and a named-but-unusable row was itself the
// name-leak the epic's OQ-5 called out. The row is now simply absent, via
// `visibleOrder(order)` (utils/encounterUtils) — the same derivation the
// other seven order-based pickers already use.
//
// Mount site: InitiativeStrip has exactly one mount, EncounterSkeleton, used
// from both CharacterSheet (the player's own client) and GmCommandDock's
// DockActingPane (the GM acting AS a PC). DockActingPane is documented at its
// call site as staying "byte-identical to the player's own" deck, so that's
// not a GM-omniscient surface for this component — the GM's actual full-order
// rail is the separate DockOrderStrip, untouched by this filter. Filtering
// unconditionally inside this component is therefore correct; no prop is
// needed to distinguish mounts.
//
// Hidden-active-combatant case: `currentTurnIndex` can point at an entry that
// is hidden (an enemy that Hides mid-fight ahead of its next turn). Indexing
// into the now-shorter visible list would drift the current-turn highlight
// onto the wrong neighbor, so "current" is resolved by entryId against
// `activeEntry(encounter)` instead of by position. When that entry is hidden
// it is simply absent from `order` here, so nothing in the strip reads as
// current. That is the deliberate choice — it mirrors Foundry's own player
// tracker (no row, no highlight) rather than inventing a placeholder or
// mis-highlighting a visible neighbor. The strip carries no "X of Y" count,
// so there's no numbering that could go stale either.
import React from 'react';
import { useEncounter } from '../../../hooks/useEncounter';
import { useSyncedState } from '../../../hooks/useSyncedState';
import { useFocusTarget } from '../../../hooks/useFocusTarget';
import { activeEntry, visibleOrder } from '../../../utils/encounterUtils';
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

  // Display drops hidden combatants entirely (#1749 ruling addendum 2) — see
  // the file-header note. HuntPreyBadge's hunter lookup (below, via
  // `renderInner`) runs off this same filtered list — a hidden PC hunter
  // (edge case) drops its 🎯 badge too, consistent with the rest of the app's
  // order-derived pickers.
  const order = visibleOrder(encounter.order || []);
  const isInProgress = encounter.phase === 'in-progress';
  // Resolved by entryId, not index, so a hidden active combatant (dropped
  // from `order` above) never mis-highlights a visible neighbor — see the
  // file-header note.
  const currentEntryId = isInProgress ? activeEntry(encounter)?.entryId ?? null : null;

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
      {order.map((entry) => {
        const isCurrent = currentEntryId != null && entry.entryId === currentEntryId;
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

        // Every visible combatant is tap-to-focus (#429): foes drive offense,
        // allies drive support, yourself the personal readout (#1502 S2).
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
