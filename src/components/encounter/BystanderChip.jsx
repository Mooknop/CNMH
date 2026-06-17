import React from 'react';
import { useBystander } from '../../hooks/useBystander';
import './BystanderChip.css';

/**
 * Harmless Bystander badge for one PC in the order strip (#226 Slice D). A child
 * component (the AuraChip/OmenChip/StanceChip pattern) so each entry holds its
 * own synced subscription to cnmh_bystander_<charId>; renders nothing unless the
 * PC has declared it for this encounter.
 *
 * @param {Object} entry - Encounter order entry ({ entryId, name, kind, charId? })
 */
const BystanderChip = ({ entry }) => {
  const { active } = useBystander(entry?.charId);

  if (entry?.kind !== 'pc' || !active) return null;

  return (
    <span
      className="ttp-bystander-chip"
      title={
        `${entry.name} declared Harmless Bystander (rolled Deception for initiative). ` +
        'Non-allies must Sense Motive to realize they are hostile and cannot react ' +
        'against them until they take a hostile action; once observed being hostile, ' +
        'those creatures are immune to this for 1 day.'
      }
      aria-label={`${entry.name} declared Harmless Bystander`}
    >
      🎭
    </span>
  );
};

export default BystanderChip;
