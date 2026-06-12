import React from 'react';
import { useAura } from '../../hooks/useAura';

/**
 * Kinetic-aura badge for one PC in the order strip (#228). A child component
 * (PersistentChip pattern) so each entry holds its own synced subscription to
 * cnmh_aura_<charId>; renders nothing while the aura is down.
 *
 * @param {Object} entry - Encounter order entry ({ entryId, name, kind, charId? })
 */
const AuraChip = ({ entry }) => {
  const { active } = useAura(entry?.charId);

  if (entry?.kind !== 'pc' || !active) return null;

  return (
    <span
      className="ttp-aura-chip"
      title="Kinetic aura active"
      aria-label={`${entry.name}'s kinetic aura is active`}
    >
      ◈
    </span>
  );
};

export default AuraChip;
