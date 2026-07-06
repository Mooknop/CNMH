// PF2e Shield Block math — pure function, no React, no Foundry.
//
// Shield Block (reaction): when you have your shield raised and take physical
// damage, your shield's Hardness prevents that much damage; you and the shield
// each take the remainder. If the shield's HP drops to or below its broken
// threshold it becomes broken (no AC bonus, no further blocks); at 0 it's
// destroyed.

/**
 * @param {object} opts
 * @param {number} opts.dealt           - incoming damage before Shield Block
 * @param {number} opts.hardness        - shield's Hardness value
 * @param {number} opts.shieldHp        - shield's current HP before this block
 * @param {number} opts.brokenThreshold - HP at or below which the shield breaks
 * @param {number} [opts.hardnessBonus] - extra effective Hardness for this block
 *   only (e.g. a deflecting shield's +2 vs a ranged attack, #1196 G1). Negative
 *   values are clamped to 0 so a bonus never lowers Hardness. Default 0.
 * @returns {{
 *   prevented:      number,  // damage negated by Hardness
 *   characterTakes: number,  // damage to the character after Hardness
 *   shieldTakes:    number,  // damage to the shield after Hardness (same as characterTakes)
 *   shieldHpAfter:  number,  // shield HP after applying shieldTakes
 *   broken:         boolean, // true when shieldHpAfter ≤ brokenThreshold
 *   destroyed:      boolean, // true when shieldHpAfter ≤ 0
 * }}
 */
export function applyShieldBlock({ dealt, hardness, shieldHp, brokenThreshold, hardnessBonus = 0 }) {
  const effectiveHardness = hardness + Math.max(0, hardnessBonus || 0);
  const prevented      = Math.min(dealt, effectiveHardness);
  const remaining      = dealt - prevented;
  const shieldHpAfter  = Math.max(0, shieldHp - remaining);
  const broken         = shieldHpAfter <= brokenThreshold;
  const destroyed      = shieldHpAfter <= 0;
  return {
    prevented,
    characterTakes: remaining,
    shieldTakes:    remaining,
    shieldHpAfter,
    broken,
    destroyed,
  };
}
