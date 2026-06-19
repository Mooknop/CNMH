// Ranged range increments (#529, epic #527). Pure helpers — no React/Foundry.
//
// House rules for this table:
//   - A ranged weapon has a range increment (feet).
//   - Each increment past the 1st applies −2 to the attack (increment 1 = 0,
//     2 = −2, 3 = −4, 4 = −6).
//   - A target beyond 4× the increment is out of range (the Strike is blocked).
//
// Distance uses PF2e's alternating-diagonal rule (the first diagonal step counts
// 5 ft, the second 10 ft, alternating) so the range a Strike reports matches the
// feet Foundry's PF2e grid measurement reports for movement.

// Max range, in range increments (house rule).
export const MAX_RANGE_INCREMENTS = 4;

/**
 * Distance between two grid cells in feet (PF2e 5-10-5 diagonals).
 * Cells are { col, row } in grid squares; gridSize (pixels/square) is irrelevant
 * because positions arrive pre-converted to cells.
 *
 * @param {{col:number,row:number}} from
 * @param {{col:number,row:number}} to
 * @param {number} [feetPerSquare=5] - scene feet per grid square (PF2e default 5)
 * @returns {number} distance in feet
 */
export function gridDistanceFeet(from, to, feetPerSquare = 5) {
  if (!from || !to) return 0;
  const dCol = Math.abs((to.col ?? 0) - (from.col ?? 0));
  const dRow = Math.abs((to.row ?? 0) - (from.row ?? 0));
  const diagonals = Math.min(dCol, dRow);
  const straights = Math.max(dCol, dRow) - diagonals;
  // Every second diagonal costs an extra square (5/10/5/10…).
  const diagSquares = diagonals + Math.floor(diagonals / 2);
  return (straights + diagSquares) * feetPerSquare;
}

/**
 * Parse a strike's `range` into a range increment in feet.
 * Accepts a number (already feet) or strings like "100 feet" / "60 ft" /
 * "30-foot". Returns null for melee/touch/empty/unparseable values.
 *
 * @param {string|number|null|undefined} range
 * @returns {number|null}
 */
export function parseRangeIncrement(range) {
  if (typeof range === 'number') return range > 0 ? range : null;
  if (typeof range !== 'string') return null;
  const m = range.match(/(\d+)\s*-?\s*(?:feet|foot|ft)\b/i);
  if (!m) return null;
  const ft = parseInt(m[1], 10);
  return ft > 0 ? ft : null;
}

/**
 * Resolve the range-increment effect of a ranged Strike from attacker to target.
 *
 * @param {Object}   opts
 * @param {{col,row}} opts.from        - attacker cell
 * @param {{col,row}} opts.to          - target cell
 * @param {number}   opts.incrementFt  - the weapon's range increment in feet
 * @param {number}   [opts.feetPerSquare=5]
 * @returns {{ feet:number, increments:number, penalty:number, beyondMaxRange:boolean } | null}
 *          null when the increment is missing/invalid or a cell is missing.
 */
export function rangeIncrementResult({ from, to, incrementFt, feetPerSquare = 5 }) {
  if (!incrementFt || incrementFt <= 0 || !from || !to) return null;
  const feet = gridDistanceFeet(from, to, feetPerSquare);
  const increments = Math.max(1, Math.ceil(feet / incrementFt));
  const penalty = increments > 1 ? -2 * (increments - 1) : 0;
  const beyondMaxRange = increments > MAX_RANGE_INCREMENTS;
  return { feet, increments, penalty, beyondMaxRange };
}
