// How wide a slice of the battlefield a targeting capture asks for (#1749 S4).
//
// The `snapreq { moverId, radiusFeet }` contract (#1744 WS-2, protocol 16) is
// range-agnostic — the bridge centres the render on a token and extends
// `radiusFeet` in every direction. Movement passes 1.5× Speed; targeting has
// to pick its own number, and OQ-1's arithmetic is why that number is NOT
// simply "the weapon's maximum range":
//
//   a capture of radius R spans 2R/5 cells and is downscaled to <= 900 px, so
//   a 5-ft square is ~ (900 / (2R/5)) capture px, and roughly 0.43x that in
//   CSS px on a 390 px phone at 1x zoom.
//
//     R =  25 ft -> 10 cells -> ~90 px/cell -> ~39 CSS px   comfortable
//     R =  60 ft -> 24 cells -> ~37 px/cell -> ~16 CSS px   readable, snappable
//     R = 120 ft -> 48 cells -> ~19 px/cell ->  ~8 CSS px   a rounding error
//
// Hence the OQ-1 ruling ("framing radius capped at ~1-2 range increments; chip
// list is the long-shot escape hatch"): the map deliberately does NOT try to
// frame the longest legal shot. A 60-ft-increment bow can legally fire out to
// 240 ft (4 increments, house rule) — framing that would make every token
// untappable, so the capture stops at MAX_TARGET_FRAMING_RADIUS_FT and the
// TargetPicker chip row remains the way to aim at something further out. That
// is a UX decision, not a rules one: nothing here gates, blocks or measures
// anything. `buildStrikeRangeGating` still computes the real per-target
// increment penalty from `positions`, whether or not the target is on screen.
import { parseRangeIncrement } from './rangeIncrement';
import { hasTrait } from './map';

// The floor, and the melee/no-range answer. A melee attacker cares about their
// own reach (5 ft, or 10 ft with the Reach trait) plus enough context to see
// who could be stepped to — five squares in each direction shows the reach
// ring, everything adjacent to it, and the ally who might be flanking, while
// keeping a 5-ft square around 39 CSS px on a phone. Also used as the MINIMUM
// for ranged flows so a 10-ft thrown dagger doesn't produce a capture with
// four cells in it.
export const MELEE_FRAMING_RADIUS_FT = 25;

// How many range increments a ranged Strike frames (the "1-2" of the ruling,
// taken at its top end and then clamped below).
export const TARGET_FRAMING_INCREMENTS = 2;

// The legibility ceiling, from the arithmetic above: past this a 5-ft square
// drops under ~16 CSS px on a phone and the marker snap radius
// (DEFAULT_HIT_TOLERANCE_PX) is doing all the work. A long weapon therefore
// frames ONE increment (or less) rather than two — deliberately, per the
// ruling's "chip list is the long-shot escape hatch".
export const MAX_TARGET_FRAMING_RADIUS_FT = 60;

const clampFraming = (feet) =>
  Math.min(MAX_TARGET_FRAMING_RADIUS_FT, Math.max(MELEE_FRAMING_RADIUS_FT, feet));

/**
 * The attacker's melee reach in feet — 10 ft with the Reach trait, 5 ft
 * otherwise. A HINT (the same word `MoveGridPicker` uses for its Chebyshev
 * feet): the authority on whether a specific creature is actually reachable is
 * `useAdjacency.inReach`, which is computed bridge-side from real token sizes
 * and fails open. This number only decides where a ring gets drawn.
 */
export function meleeReachFeet(ability) {
  return hasTrait(ability, 'Reach') ? 10 : 5;
}

/**
 * The `radiusFeet` a targeting `snapreq` should carry for this ability.
 *
 * @param {Object}  opts
 * @param {Object}  opts.ability         - the ability being aimed
 * @param {boolean} [opts.isRangedStrike] - `ability.type === 'ranged'`, the same
 *   signal `buildStrikeRangeGating` gates on. A ranged STRIKE's `range` is an
 *   increment (it can legally fire several of them), so it is multiplied; any
 *   other ability's `range` is a hard maximum and is used as-is.
 * @returns {number} feet, always within [MELEE_FRAMING_RADIUS_FT, MAX_TARGET_FRAMING_RADIUS_FT]
 */
export function targetFramingRadiusFeet({ ability, isRangedStrike = false } = {}) {
  const rangeFt = parseRangeIncrement(ability?.range);
  if (!rangeFt) return MELEE_FRAMING_RADIUS_FT;
  return clampFraming(isRangedStrike ? rangeFt * TARGET_FRAMING_INCREMENTS : rangeFt);
}

export default targetFramingRadiusFeet;
