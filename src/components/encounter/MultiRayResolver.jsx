// MultiRayResolver — renders the sequential per-ray roll driver for spells
// that make several attack rolls in a single cast (e.g. Blazing Bolt: 1–3
// rays, one spell-attack roll each, at the same or different targets).
//
// LOCKED DESIGN (#1691): sequential, one ray at a time — a `SequentialAttackSteps`
// step per ray, each scoped to its own chosen target. All rays share the same
// `rollBonus` because MAP is computed once per cast (it only steps after the
// whole activity), so the parent passes one already-MAP-adjusted bonus, and
// the same `damage` profile — the amount step is grouped, once, after the
// last ray (SequentialAttackSteps' own grouped DamageEntry rows).
//
// Mirrors ChainedStrikeSection: exposes getResults() via ref so UseAbilityModal
// (or ChainedSpellSection, #581) can read the per-ray results at confirm time.
// Shape: [{ rayIndex, results }] where `results` is the chosen target's
// resolver-shaped result array (length 1). Rays not yet rolled are absent.
//
// `tapOrder` (#1749 S4, OQ-2 ruling option (b)): tapping targets on the live
// map in sequence is a better interface than N dropdowns for the ray case —
// tap order IS ray order. But `useTargeting` deliberately has no ordering
// contract and five other flows share it, so the ORDER arrives here as a
// separate, optional override (`useTapOrder.order`) rather than by changing
// what `targets` means. It only shifts the per-ray DEFAULT; the existing
// `<select>` still wins for any ray the player re-points by hand, and a ray
// index past the end of the list falls back to the pre-existing rule.

import React, { useRef, useState, useImperativeHandle, forwardRef } from 'react';
import SequentialAttackSteps from './SequentialAttackSteps';
import './MultiRayResolver.css';

const MultiRayResolver = forwardRef(({
  rayCount = 1,
  enemyTargets = [],
  targetDefense = 'ac',
  rollBonus = null,
  damage = null,
  degrees = null,
  toggles = [],
  charId = null,
  rollFlavor = '',
  onProgress = null,
  tapOrder = [],
}, ref) => {
  const innerRef = useRef(null);
  // Per-ray chosen target entryId; unset entries fall back to defaultTargetId(i).
  const [targetIds, setTargetIds] = useState([]);

  const defaultTargetId = (i) => {
    // The map's tap sequence, when it reaches this ray and still names a
    // creature that is actually a target (a since-deselected tap is ignored
    // rather than resurrected).
    const tapped = tapOrder[i];
    if (tapped && enemyTargets.some((e) => e.entryId === tapped)) return tapped;
    return enemyTargets[Math.min(i, enemyTargets.length - 1)]?.entryId;
  };

  const chosenId = (i) => targetIds[i] ?? defaultTargetId(i);

  const setRayTarget = (i, entryId) => {
    setTargetIds((cur) => {
      const next = [...cur];
      next[i] = entryId;
      return next;
    });
  };

  useImperativeHandle(ref, () => ({
    getResults: () => innerRef.current?.getResults() ?? [],
    isComplete: () => innerRef.current?.isComplete() ?? false,
  }));

  if (enemyTargets.length === 0) return null;

  const steps = Array.from({ length: rayCount }, (_, i) => {
    const targetId = chosenId(i);
    const target = enemyTargets.find((e) => e.entryId === targetId) || enemyTargets[0];
    return {
      label: rayCount > 1 ? `Ray ${i + 1} of ${rayCount}` : 'Ray 1',
      enemyTargets: [target],
      rollBonus,
      toggles,
      commitLabel: `Confirm ray ${i + 1}`,
      rollFlavor: rollFlavor ? `${rollFlavor} — ray ${i + 1}` : '',
      extra: enemyTargets.length > 1 ? (
        <div className="mrr-ray-head">
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
        </div>
      ) : null,
    };
  });

  return (
    <div className="mrr-section">
      <SequentialAttackSteps
        ref={innerRef}
        steps={steps}
        defense={targetDefense}
        damage={damage}
        degrees={degrees}
        charId={charId}
        onProgress={onProgress}
      />
    </div>
  );
});

MultiRayResolver.displayName = 'MultiRayResolver';

export default MultiRayResolver;
