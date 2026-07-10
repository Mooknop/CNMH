import { parseRangeIncrement, rangeIncrementResult } from './rangeIncrement';
import { preyMatches } from './huntPrey';

/**
 * Ranged range increments (#530, extracted #1317 D4): for a ranged weapon
 * Strike with a parseable range increment, measure attacker→target distance
 * from the bridge positions and compute the per-target increment penalty. A
 * target beyond 4× the increment is out of range and hard-blocks the Strike.
 * Melee strikes, missing positions, or an unparseable range all degrade to no
 * gating.
 *
 * Hunt Prey (#408): a ranged attack against the designated prey ignores the
 * second-range-increment penalty.
 */
export const buildStrikeRangeGating = ({
  ability,
  isRangedStrike,
  positionsState,
  casterEntryId,
  resolverTargets,
  prey,
}) => {
  const rangeIncrementFt = isRangedStrike ? parseRangeIncrement(ability.range) : null;
  const positions = positionsState?.positions || null;
  const rangeFrom = rangeIncrementFt && positions ? positions[casterEntryId] : null;
  const rangeByEntry = {};
  if (rangeFrom) {
    for (const t of resolverTargets) {
      const to = positions[t.entryId];
      if (to) rangeByEntry[t.entryId] = rangeIncrementResult({
        from: rangeFrom, to, incrementFt: rangeIncrementFt,
        waiveSecondIncrement: preyMatches(prey, t),
      });
    }
  }
  const hasRangeData = Object.keys(rangeByEntry).length > 0;
  const anyTargetOutOfRange = resolverTargets.some((t) => rangeByEntry[t.entryId]?.beyondMaxRange);
  return { rangeByEntry, hasRangeData, anyTargetOutOfRange };
};
