import React from 'react';
import { useHuntPrey } from '../../hooks/useHuntPrey';
import { preyMatches } from '../../utils/huntPrey';

/**
 * Prey badge for one enemy in the order strip (#223). The designation lives on
 * the hunter (a PC), so for an enemy entry we render one marker per PC in the
 * order — each holds its own synced subscription to that PC's prey and renders
 * only when it matches this enemy (AuraChip/PersistentChip child pattern).
 *
 * @param {Object} enemyEntry - the enemy order entry ({ entryId, kind, creatureKey?, name })
 * @param {Array}  order      - the full encounter order (to find PC hunters)
 */
const PreyMarker = ({ hunterCharId, hunterName, enemyEntry }) => {
  const { prey } = useHuntPrey(hunterCharId);
  if (!preyMatches(prey, enemyEntry)) return null;
  return (
    <span
      className="ttp-prey-badge"
      title={`${hunterName}'s prey`}
      aria-label={`${enemyEntry.name} is ${hunterName}'s prey`}
    >
      🎯
    </span>
  );
};

const HuntPreyBadge = ({ enemyEntry, order }) => {
  if (enemyEntry?.kind !== 'enemy') return null;
  const hunters = (order || []).filter((e) => e.kind === 'pc' && e.charId);
  return (
    <>
      {hunters.map((pc) => (
        <PreyMarker
          key={pc.charId}
          hunterCharId={pc.charId}
          hunterName={pc.name}
          enemyEntry={enemyEntry}
        />
      ))}
    </>
  );
};

export default HuntPreyBadge;
