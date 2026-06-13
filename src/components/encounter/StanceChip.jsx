import React from 'react';
import { useStance } from '../../hooks/useStance';

/**
 * Stance badge for one PC in the order strip (#224). A child component (the
 * AuraChip/OmenChip pattern) so each entry holds its own synced subscription to
 * cnmh_stance_<charId>; renders nothing while no stance is active.
 *
 * @param {Object} entry - Encounter order entry ({ entryId, name, kind, charId? })
 */
const StanceChip = ({ entry }) => {
  const { active, stanceName } = useStance(entry?.charId);

  if (entry?.kind !== 'pc' || !active) return null;

  const label = stanceName || 'Stance';

  return (
    <span
      className="ttp-stance-chip"
      title={`In ${label}`}
      aria-label={`${entry.name} is in ${label}`}
    >
      🐉
    </span>
  );
};

export default StanceChip;
