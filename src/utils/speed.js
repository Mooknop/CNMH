// Character Speed derivation spine (#1219, SP1 #1220 / SP2 #1221).
//
// deriveSpeed is the single top-down composition point for a PC's land Speed:
// authored base in, typed modifiers applied, floored total + labeled breakdown
// out. PF2e stacking (highest per bonus type, worst per penalty type, types
// stack) happens UPSTREAM — the `modifiers` argument is the already-combined
// net-modifier object from combineModifiers(computeConditionEffects(...).speed,
// computeEffectBonuses(...).speed). Armor and tower-shield penalties (SP2) ride
// the separate `gearPenalties` channel — they are UNTYPED penalties that stack
// with everything, so they never pass through bestOfKind. Worn-gear bonuses /
// encumbrance (SP3) come next. Encounter reachable-square grids stay
// Foundry-authoritative (the bridge's getSpeed rides cnmh_moveopts_); this
// spine is display/accounting/offline-sandbox truth.

import { normalizeArmor, normalizeShield } from './InventoryUtils';
import { isHeldState } from './itemState';

// PF2e: penalties can never reduce a Speed below 5 feet.
export const SPEED_FLOOR = 5;

// PF2e: meeting the armor's Strength threshold reduces its Speed penalty by 5.
const STRENGTH_WAIVER_FT = 5;

/**
 * Derive the character's Speed from its base and the combined modifiers.
 *
 * @param {number} base       - authored base Speed in feet
 * @param {object} [modifiers] - { total, sources: [{ label, penalty?|bonus? }] }
 *                               (combineModifiers shape); omit for passthrough
 * @param {Array}  [gearPenalties] - untyped penalty rows from armor/shields
 *                               ([{ label, amount }], amounts negative — the
 *                               armorSpeedPenalty/shieldSpeedPenalty helpers)
 * @returns {{ base, total, derived, breakdown: [{ label, amount, type }] }}
 *          type is 'base' | 'bonus' | 'penalty' | 'floor'
 */
export function deriveSpeed({ base, modifiers, gearPenalties } = {}) {
  const baseSpeed = Number.isFinite(base) ? base : 0;
  const mods = modifiers && Number.isFinite(modifiers.total)
    ? modifiers
    : { total: 0, sources: [] };
  const gear = (Array.isArray(gearPenalties) ? gearPenalties : []).filter(
    (g) => g && Number.isFinite(g.amount) && g.amount !== 0
  );

  const modTotal = mods.total + gear.reduce((sum, g) => sum + g.amount, 0);
  const raw = baseSpeed + modTotal;
  // The floor only cushions penalties (a penalty can't raise a sub-5 base),
  // and never inflates a base that already sits below it.
  const floor = Math.min(baseSpeed, SPEED_FLOOR);
  const total = modTotal < 0 ? Math.max(raw, floor) : raw;

  const breakdown = [
    { label: 'Base Speed', amount: baseSpeed, type: 'base' },
    ...gear.map((g) => ({
      label: g.label,
      amount: g.amount,
      type: g.amount < 0 ? 'penalty' : 'bonus',
    })),
    ...(mods.sources || []).map((s) => {
      const amount = s.bonus != null ? s.bonus : s.penalty;
      return { label: s.label, amount, type: amount < 0 ? 'penalty' : 'bonus' };
    }),
  ];
  if (total !== raw) {
    breakdown.push({
      label: `Minimum Speed (${SPEED_FLOOR} ft)`,
      amount: total - raw,
      type: 'floor',
    });
  }

  return { base: baseSpeed, total, derived: true, breakdown };
}

/**
 * The worn armor's Speed penalty as a spine gear row (SP2, #1221).
 *
 * `armor.speedPenalty` is authored as a positive foot count (matching the
 * shield convention — Reinforced Tower Shield's `speedPenalty: 5`); absent/0
 * means no penalty. Meeting the armor's Strength threshold (`armor.strength`,
 * a score — compared against the wearer's Strength score) reduces the penalty
 * by 5 ft, possibly to nothing.
 *
 * @param {Object|null} entry         - the worn armor inventory entry (findWornArmor)
 * @param {number}      strengthScore - the wearer's Strength score
 * @returns {{ label, amount }|null} amount negative, or null when no penalty
 */
export function armorSpeedPenalty(entry, strengthScore) {
  const a = entry ? normalizeArmor(entry.armor) : null;
  const penalty = a && Number.isFinite(a.speedPenalty) ? a.speedPenalty : 0;
  if (penalty <= 0) return null;
  const waived =
    Number.isFinite(strengthScore) && a.strength !== undefined && strengthScore >= a.strength
      ? STRENGTH_WAIVER_FT
      : 0;
  const amount = Math.max(penalty - waived, 0);
  return amount > 0 ? { label: entry.name || 'Armor', amount: -amount } : null;
}

/**
 * The held shield's Speed penalty as a spine gear row (SP2, #1221).
 *
 * A shield's penalty (tower shields: `shield.speedPenalty`, positive feet)
 * applies only while the shield is in a hand — worn/stowed/dropped shields
 * don't slow anyone. When more than one shield is somehow held, the worst
 * single penalty applies (they don't stack). No Strength waiver: PF2e's
 * threshold rule is armor-only.
 *
 * @param {Array} inventory - effective (state-stamped) top-level inventory
 * @returns {{ label, amount }|null} amount negative, or null when no penalty
 */
export function shieldSpeedPenalty(inventory = []) {
  let worst = null;
  for (const e of Array.isArray(inventory) ? inventory : []) {
    if (!e || !e.shield || !isHeldState(e.state)) continue;
    const s = normalizeShield(e.shield);
    const penalty = s && Number.isFinite(s.speedPenalty) ? s.speedPenalty : 0;
    if (penalty > 0 && (!worst || penalty > -worst.amount)) {
      worst = { label: e.name || 'Shield', amount: -penalty };
    }
  }
  return worst;
}

/**
 * Re-shape a derived speed's breakdown into the net-modifier object
 * PenaltyDisplay consumes ({ total, sources }), so the sheet's Speed line uses
 * the same presentation family as every other stat. The base row is excluded
 * (it IS PenaltyDisplay's `base`); the floor row rides along as a positive
 * adjustment so the tooltip explains why a huge penalty didn't fully land.
 *
 * @param {object} derived - deriveSpeed() result
 * @returns {{ total: number, sources: Array }}
 */
export function speedModifier(derived) {
  if (!derived || !Array.isArray(derived.breakdown)) {
    return { total: 0, sources: [] };
  }
  return {
    total: derived.total - derived.base,
    sources: derived.breakdown
      .filter((row) => row.type !== 'base')
      .map((row) => (row.amount < 0
        ? { label: row.label, penalty: row.amount, isBuff: false }
        : { label: row.label, bonus: row.amount, isBuff: true })),
  };
}
