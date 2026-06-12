import React from 'react';
import { useOmen } from '../../hooks/useOmen';
import { suitById } from '../../utils/harrow';

/**
 * Active-omen badge for one PC in the order strip (#227). A child component
 * (AuraChip pattern) so each entry holds its own synced subscription to
 * cnmh_omen_<charId>; renders nothing while no omen is active.
 *
 * @param {Object} entry - Encounter order entry ({ entryId, name, kind, charId? })
 */
const OmenChip = ({ entry }) => {
  const { suit } = useOmen(entry?.charId);
  const meta = suitById(suit);

  if (entry?.kind !== 'pc' || !meta) return null;

  return (
    <span
      className="ttp-omen-chip"
      title={`Harrow omen: ${meta.id} (${meta.checks})`}
      aria-label={`${entry.name}'s harrow omen is ${meta.id}`}
    >
      🂠 {meta.id}
    </span>
  );
};

export default OmenChip;
