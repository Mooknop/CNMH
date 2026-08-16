import { parseRangeIncrement, gridDistanceFeet } from './rangeIncrement';

/**
 * Range legality for an area-spell placement (#1751 OQ-5, ruled 2026-08-16
 * GM: HARD BLOCK). Mirrors `strikeRangeGating.js`'s `anyTargetOutOfRange`
 * precedent — the app already refuses an out-of-range ranged Strike, so
 * refusing an out-of-range template placement is the same call, not a new
 * one. Unlike a Strike's range increment, a spell's `range` is a single
 * reach: there is no per-increment penalty ladder here, only in range or
 * not.
 *
 * The caster-centered capture (S1, wave 2) makes an illegal placement mostly
 * self-enforcing — you can't tap what isn't in the captured frame — but only
 * mostly: the capture is a SQUARE window clamped to canvas bounds, while
 * range is RADIAL, so the frame's corners are out of range by construction.
 * This gate is what actually enforces the circle.
 *
 * `range` is free content text (`ability.range`), and plenty of it is
 * unparseable on purpose — touch, self, "planetary", empty. An unparseable
 * range degrades to ALWAYS ALLOWED: the app must never invent a block for a
 * range it couldn't read. This is a pure decision function; wiring it into
 * the placement confirm flow is wave 2 (#1751 S4/S1).
 *
 * @param {Object} opts
 * @param {string|number|null|undefined} opts.range  ability.range free text
 * @param {{col:number,row:number}|null} opts.casterCell   caster's position
 * @param {{col:number,row:number}|null} opts.placedCell   candidate placement,
 *   in the SAME grid-coordinate space as `casterCell` (both cell addresses,
 *   or both grid-intersection corner addresses — mixing the two spaces
 *   introduces a systematic half-square error, so the caller picks one and
 *   stays consistent)
 * @param {number} [opts.feetPerSquare=5]
 * @returns {{ blocked: boolean, rangeFeet: number|null, feet: number|null }}
 *   `rangeFeet` is null when the range text was unparseable (the signal that
 *   this gate never applies); `feet` is null whenever a distance couldn't be
 *   measured (no range, or a missing cell).
 */
export function templateRangeGate({ range, casterCell, placedCell, feetPerSquare = 5 } = {}) {
  const rangeFeet = parseRangeIncrement(range);
  if (rangeFeet == null || !casterCell || !placedCell) {
    return { blocked: false, rangeFeet, feet: null };
  }
  const feet = gridDistanceFeet(casterCell, placedCell, feetPerSquare);
  return { blocked: feet > rangeFeet, rangeFeet, feet };
}
