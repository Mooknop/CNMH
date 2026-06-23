import React from 'react';
import { useEnemyEffects } from '../../hooks/useEnemyEffects';
import { useContent } from '../../contexts/ContentContext';
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
  // On-hit ammo effects (#676, e.g. Beacon Shot) land here as markers keyed by the
  // effect's catalog id — fall back to its catalog name so the chip reads nicely.
  const { effects: effectCatalog } = useContent();
  if (enemyEntry?.kind !== 'enemy') return null;

  const conditions = effectsFor(enemyEntry.entryId).conditions || [];
  if (conditions.length === 0) return null;

  return (
    <>
      {conditions.map((c) => {
        const name = getCondition(c.id)?.name
          || (effectCatalog || []).find((e) => e.id === c.id)?.name
          || c.id;
        const base = c.value != null ? `${name} ${c.value}` : name;
        // Observer-scoped conditions (#348) name the attacker they apply to:
        // "Off-Guard to Ashka".
        const label = c.scopedToName ? `${base} to ${c.scopedToName}` : base;
        return (
          <span
            key={`${c.id}:${c.scopedTo || ''}`}
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
