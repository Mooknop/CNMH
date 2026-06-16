import React from 'react';
import { useEnemyEffects } from '../../hooks/useEnemyEffects';
import { getCondition } from '../../data/pf2eConditions';
import './EnemyConditionBadge.css';

/**
 * Conditions applied to an enemy by player skill actions (#260) — frightened
 * from Demoralize today, Trip/Grapple later. Renders one chip per active
 * condition on the enemy's entry in the order strip. Mirrors HuntPreyBadge:
 * enemy-only, reads the shared synced store keyed by entryId.
 *
 * @param {object} enemyEntry - the enemy order entry ({ entryId, kind, name })
 */
const EnemyConditionBadge = ({ enemyEntry }) => {
  const { effectsFor } = useEnemyEffects();
  if (enemyEntry?.kind !== 'enemy') return null;

  const conditions = effectsFor(enemyEntry.entryId).conditions || [];
  if (conditions.length === 0) return null;

  return (
    <>
      {conditions.map((c) => {
        const name = getCondition(c.id)?.name || c.id;
        const label = c.value != null ? `${name} ${c.value}` : name;
        return (
          <span
            key={c.id}
            className="ttp-condition-badge"
            title={`${enemyEntry.name}: ${label}`}
            aria-label={`${enemyEntry.name} is ${label}`}
          >
            {label}
          </span>
        );
      })}
    </>
  );
};

export default EnemyConditionBadge;
