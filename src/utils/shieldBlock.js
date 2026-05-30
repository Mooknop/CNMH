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
 * @returns {{
 *   prevented:      number,  // damage negated by Hardness
 *   characterTakes: number,  // damage to the character after Hardness
 *   shieldTakes:    number,  // damage to the shield after Hardness (same as characterTakes)
 *   shieldHpAfter:  number,  // shield HP after applying shieldTakes
 *   broken:         boolean, // true when shieldHpAfter ≤ brokenThreshold
 *   destroyed:      boolean, // true when shieldHpAfter ≤ 0
 * }}
 */
export function applyShieldBlock({ dealt, hardness, shieldHp, brokenThreshold }) {
  const prevented      = Math.min(dealt, hardness);
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
