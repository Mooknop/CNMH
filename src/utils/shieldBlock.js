// PF2e Shield Block math — pure function, no React, no Foundry.
import { applyItemDamage, isBrokenHp, isDestroyedHp } from './itemDurability';
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
 * @param {number} [opts.shieldTempHp]  - the shield's temporary-HP pool (#1246 —
 *   Heartstone); absorbs the shield's share before real HP. Default 0.
 * @param {boolean} [opts.shieldImmune] - the shield is immune to the triggering
 *   damage type (#1246 — Prismatic Crystal's elemental transformation): Hardness
 *   still prevents its value and the character takes the remainder, but the
 *   shield itself takes nothing. Default false.
 * @returns {{
 *   prevented:         number,  // damage negated by Hardness
 *   characterTakes:    number,  // damage to the character after Hardness
 *   shieldTakes:       number,  // damage to the shield after Hardness (0 when immune)
 *   shieldHpAfter:     number,  // shield HP after applying shieldTakes
 *   shieldTempHpAfter: number,  // shield temp-HP pool after this block
 *   broken:            boolean, // true when shieldHpAfter ≤ brokenThreshold
 *   destroyed:         boolean, // true when shieldHpAfter ≤ 0
 * }}
 */
export function applyShieldBlock({
  dealt, hardness, shieldHp, brokenThreshold, hardnessBonus = 0, shieldTempHp = 0, shieldImmune = false,
}) {
  // Prismatic Crystal (#1246): blocking the crystal's energy type — the shield
  // is immune, so its HP never moves; the character's share is unchanged.
  if (shieldImmune) {
    const effectiveHardness = (hardness || 0) + Math.max(0, hardnessBonus || 0);
    const prevented = Math.min(dealt, effectiveHardness);
    return {
      prevented,
      characterTakes:    dealt - prevented,
      shieldTakes:       0,
      shieldHpAfter:     shieldHp,
      shieldTempHpAfter: Math.max(0, shieldTempHp || 0),
      broken:            isBrokenHp(shieldHp, brokenThreshold ?? 0),
      destroyed:         isDestroyedHp(shieldHp),
    };
  }
  // Same math as any item taking damage (#541) — Shield Block just splits the
  // remainder onto both the character and the shield (the shield's temp-HP
  // pool, when present, absorbs its share first).
  const r = applyItemDamage({ dealt, hardness, hp: shieldHp, brokenThreshold, hardnessBonus, tempHp: shieldTempHp });
  return {
    prevented:         r.prevented,
    characterTakes:    r.taken,
    shieldTakes:       r.taken,
    shieldHpAfter:     r.hpAfter,
    shieldTempHpAfter: r.tempHpAfter,
    broken:            r.broken,
    destroyed:         r.destroyed,
  };
}
