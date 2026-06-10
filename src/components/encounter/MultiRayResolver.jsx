// MultiRayResolver — renders one roll row per ray for spells that make several
// attack rolls in a single cast (e.g. Blazing Bolt: 1–3 rays, one spell-attack
// roll each, at the same or different targets).
//
// Each ray gets its own target dropdown and its own d20 input. All rays share the
// same `rollBonus` because MAP is computed once per cast (it only steps after the
// whole activity), so the parent passes one already-MAP-adjusted bonus.
//
// Mirrors ChainedStrikeSection: exposes getResults() via ref so UseAbilityModal can
// read the per-ray results at confirm time. Shape: [{ rayIndex, results }] where
// `results` is the chosen target's TargetRollResolver result array (length 1).
// Rays with no d20 entered are dropped (their resolver returns null).

import React, { useRef, useState, useImperativeHandle, forwardRef } from 'react';
import TargetRollResolver from './TargetRollResolver';
import './MultiRayResolver.css';

const MultiRayResolver = forwardRef(({
  rayCount = 1,
  enemyTargets = [],
  targetDefense = 'ac',
  rollBonus = null,
}, ref) => {
  const rayRefs = useRef([]);
  // Per-ray chosen target entryId; unset entries fall back to defaultTargetId(i).
  const [targetIds, setTargetIds] = useState([]);

  const defaultTargetId = (i) =>
    enemyTargets[Math.min(i, enemyTargets.length - 1)]?.entryId;

  const chosenId = (i) => targetIds[i] ?? defaultTargetId(i);

  const setRayTarget = (i, entryId) => {
    setTargetIds((cur) => {
      const next = [...cur];
      next[i] = entryId;
      return next;
    });
  };

  useImperativeHandle(ref, () => ({
    getResults: () =>
      Array.from({ length: rayCount }, (_, i) => {
        const results = rayRefs.current[i]?.getResults() ?? null;
        return results ? { rayIndex: i, results } : null;
      }).filter(Boolean),
  }));

  if (enemyTargets.length === 0) return null;

  return (
    <div className="mrr-section">
      {Array.from({ length: rayCount }, (_, i) => {
        const targetId = chosenId(i);
        const target = enemyTargets.find((e) => e.entryId === targetId) || enemyTargets[0];
        return (
          <div className="mrr-ray" key={i}>
            <div className="mrr-ray-head">
              <span className="mrr-ray-label">Ray {i + 1}</span>
              {enemyTargets.length > 1 && (
                <select
                  className="mrr-target-select"
                  aria-label={`ray ${i + 1} target`}
                  value={target.entryId}
                  onChange={(e) => setRayTarget(i, e.target.value)}
                >
                  {enemyTargets.map((e) => (
                    <option key={e.entryId} value={e.entryId}>{e.name}</option>
                  ))}
                </select>
              )}
            </div>
            <TargetRollResolver
              ref={(el) => { rayRefs.current[i] = el; }}
              enemyTargets={[target]}
              targetDefense={targetDefense}
              rollBonus={rollBonus}
            />
          </div>
        );
      })}
    </div>
  );
});

MultiRayResolver.displayName = 'MultiRayResolver';

export default MultiRayResolver;
