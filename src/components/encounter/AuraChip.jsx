import React from 'react';
import { useAura } from '../../hooks/useAura';
import { useAuraMembers } from '../../hooks/useAuraMembers';
import './AuraChip.css';

/**
 * Kinetic-aura badge for one PC in the order strip (#228). A child component
 * (PersistentChip pattern) so each entry holds its own synced subscription to
 * cnmh_aura_<charId>; renders nothing while the aura is down.
 *
 * #1733 S2: when the bridge's membership read-out (`auramembers`) is known,
 * the tooltip is enriched with a live ally count. InitiativeStrip (this
 * chip's only mount) stays byte-identical between a player's own client and
 * the GM's acting-as-player dock — never a GM-omniscient surface — so the
 * count uses `visibleAllies` (friendly, non-hidden), same filter as every
 * other player-facing membership read-out. Unknown membership (no bridge,
 * pre-19 protocol, or simply no push yet) keeps today's exact copy — no
 * lying zero.
 *
 * @param {Object} entry - Encounter order entry ({ entryId, name, kind, charId? })
 */
const AuraChip = ({ entry }) => {
  const { active } = useAura(entry?.charId);
  const { known, visibleCount } = useAuraMembers(entry?.charId);

  if (entry?.kind !== 'pc' || !active) return null;

  const title = known
    ? `Kinetic aura active — ${visibleCount} ${visibleCount === 1 ? 'ally' : 'allies'} inside`
    : 'Kinetic aura active';

  return (
    <span
      className="ttp-aura-chip"
      title={title}
      aria-label={`${entry.name}'s kinetic aura is active`}
    >
      ◈
    </span>
  );
};

export default AuraChip;
