// Character Speed derivation spine (#1219, SP1 #1220).
//
// deriveSpeed is the single top-down composition point for a PC's land Speed:
// authored base in, typed modifiers applied, floored total + labeled breakdown
// out. PF2e stacking (highest per bonus type, worst per penalty type, types
// stack) happens UPSTREAM — the `modifiers` argument is the already-combined
// net-modifier object from combineModifiers(computeConditionEffects(...).speed,
// computeEffectBonuses(...).speed). Armor/shield penalties (SP2) and worn-gear/
// encumbrance sources (SP3) feed the same channel. Encounter reachable-square
// grids stay Foundry-authoritative (the bridge's getSpeed rides cnmh_moveopts_);
// this spine is display/accounting/offline-sandbox truth.

// PF2e: penalties can never reduce a Speed below 5 feet.
export const SPEED_FLOOR = 5;

/**
 * Derive the character's Speed from its base and the combined modifiers.
 *
 * @param {number} base       - authored base Speed in feet
 * @param {object} [modifiers] - { total, sources: [{ label, penalty?|bonus? }] }
 *                               (combineModifiers shape); omit for passthrough
 * @returns {{ base, total, derived, breakdown: [{ label, amount, type }] }}
 *          type is 'base' | 'bonus' | 'penalty' | 'floor'
 */
export function deriveSpeed({ base, modifiers } = {}) {
  const baseSpeed = Number.isFinite(base) ? base : 0;
  const mods = modifiers && Number.isFinite(modifiers.total)
    ? modifiers
    : { total: 0, sources: [] };

  const raw = baseSpeed + mods.total;
  // The floor only cushions penalties (a penalty can't raise a sub-5 base),
  // and never inflates a base that already sits below it.
  const floor = Math.min(baseSpeed, SPEED_FLOOR);
  const total = mods.total < 0 ? Math.max(raw, floor) : raw;

  const breakdown = [
    { label: 'Base Speed', amount: baseSpeed, type: 'base' },
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
