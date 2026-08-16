// Range bands and reach rings, drawn instead of described (#1749 S5).
//
// `rangeIncrementResult` already answers "what does THIS shot cost" for every
// selected target, and the roll sheet already prints it. What it never showed
// is the shape those numbers come from: where -2 starts, where -6 starts, and
// where the house-rule 4x wall is. Everything below is that same arithmetic,
// turned into geometry — no new rules, no new gating. `buildStrikeRangeGating`
// stays the authority on whether a Strike is blocked; a ring is a picture.
//
// ## Why the bands are octagons, not circles
//
// This table measures with PF2e's alternating diagonals (`gridDistanceFeet` →
// `diagonalSquaresToFeet`): the first diagonal step costs 5 ft, the second 10,
// alternating. Reduced, that is
//
//     feet = 5 * (max(|dCol|, |dRow|) + floor(min(|dCol|, |dRow|) / 2))
//
// whose continuous relaxation drops the floor:
//
//     feet = feetPerSquare * (max + min / 2)
//
// The iso-distance contour of THAT is a regular octagon, not a circle — a
// circle would over-promise along the diagonals by up to ~30%, which is
// exactly where "am I in range" arguments happen. Sampling the closed form
// below reproduces the octagon at whatever resolution the caller asks for, and
// costs one `normalizedFromWorld` per sample.
//
// The floor() the relaxation drops means a drawn band can disagree with
// `gridDistanceFeet` by at most one 5-ft step on a near-diagonal cell. That is
// why every label this module produces reads as a hint and why the per-target
// penalty on the roll sheet is still computed by `rangeIncrementResult`, never
// read off the picture.
import { normalizedFromWorld } from './snapshotGeometry';
import { MAX_RANGE_INCREMENTS } from './rangeIncrement';

// Enough samples that the octagon's corners land cleanly (its vertices sit at
// multiples of 45 degrees, so any multiple of 8 hits every corner exactly).
const DEFAULT_SAMPLES = 48;

/**
 * The iso-distance contour at `feet` around a world-space centre, projected
 * into normalized snapshot space.
 *
 * @param {{x:number,y:number}} centerWorld
 * @param {number} feet
 * @param {Object} opts
 * @param {Object} opts.snapshot        the snapdone payload ({ capture, worldRect, gridSize })
 * @param {number} [opts.feetPerSquare=5]
 * @param {number} [opts.samples]
 * @returns {Array<{nx:number,ny:number}>|null} polygon, or null when ungeometrizable
 */
export function isoDistancePolygon(centerWorld, feet, { snapshot, feetPerSquare = 5, samples = DEFAULT_SAMPLES } = {}) {
  const gridSize = Number(snapshot?.gridSize);
  if (!centerWorld || !Number.isFinite(gridSize) || gridSize <= 0) return null;
  if (!Number.isFinite(feet) || feet <= 0 || !(feetPerSquare > 0)) return null;

  const squares = feet / feetPerSquare;
  const points = [];
  for (let i = 0; i < samples; i += 1) {
    const theta = (2 * Math.PI * i) / samples;
    const ux = Math.abs(Math.cos(theta));
    const uy = Math.abs(Math.sin(theta));
    const major = Math.max(ux, uy);
    const minor = Math.min(ux, uy);
    const cost = major + minor / 2;   // squares of distance per unit of direction
    if (cost <= 0) return null;       // unreachable in practice (|cos|,|sin| are never both 0)
    const r = (squares / cost) * gridSize;
    const p = normalizedFromWorld(
      { x: centerWorld.x + r * Math.cos(theta), y: centerWorld.y + r * Math.sin(theta) },
      snapshot
    );
    if (!p) return null;
    points.push(p);
  }
  return points;
}

/**
 * The centre of a token's occupied rectangle, in world coordinates — the
 * origin every band is measured from. Footprint-aware for the same reason
 * `buildTokenMarkers` is: a 2x2 attacker's rings are centred on their space,
 * not on the corner cell `positions` reports.
 *
 * @param {{col:number,row:number,width?:number,height?:number}} pos
 * @param {number} gridSize
 * @returns {{x:number,y:number}|null}
 */
export function originWorldFromPosition(pos, gridSize) {
  const size = Number(gridSize);
  if (!pos || !Number.isFinite(size) || size <= 0) return null;
  const col = Number(pos.col);
  const row = Number(pos.row);
  if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
  const width = Number.isInteger(pos.width) && pos.width >= 1 ? pos.width : 1;
  const height = Number.isInteger(pos.height) && pos.height >= 1 ? pos.height : 1;
  return { x: (col + width / 2) * size, y: (row + height / 2) * size };
}

const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * The bands to draw for an ability.
 *
 * A ranged Strike with a parseable increment gets one band per increment up to
 * the house-rule maximum (`MAX_RANGE_INCREMENTS`), labelled with the penalty
 * `rangeIncrementResult` would report at that distance. Everything else gets a
 * single reach ring.
 *
 * Hunt Prey's waived second increment (#408) is deliberately NOT drawn: it is a
 * per-TARGET waiver, so folding it into a shared ring would draw a picture
 * that is wrong for every creature that isn't the prey. The roll sheet's
 * per-target line still reports it.
 *
 * @param {Object} opts
 * @param {number|null} opts.incrementFt - the weapon's range increment, or null for melee
 * @param {number} opts.reachFt          - melee reach in feet (see targetFraming.meleeReachFeet)
 * @returns {Array<{feet:number, label:string, tone:string, increment:number|null}>}
 */
export function buildRangeBands({ incrementFt = null, reachFt = 5 } = {}) {
  if (Number.isFinite(incrementFt) && incrementFt > 0) {
    return Array.from({ length: MAX_RANGE_INCREMENTS }, (_, i) => {
      const increment = i + 1;
      const penalty = i === 0 ? 0 : -2 * i;
      const isMax = increment === MAX_RANGE_INCREMENTS;
      return {
        increment,
        feet: incrementFt * increment,
        tone: isMax ? 'max' : (penalty === 0 ? 'clear' : 'penalty'),
        label: [
          `${incrementFt * increment} ft`,
          penalty === 0 ? null : signed(penalty),
          isMax ? 'max' : null,
        ].filter(Boolean).join(' · '),
      };
    });
  }
  if (!(reachFt > 0)) return [];
  return [{
    increment: null,
    feet: reachFt,
    tone: 'reach',
    // "hint" is load-bearing wording, not decoration (#1749 S5): useAdjacency
    // is the authority on reach and it accounts for token size, so the drawn
    // ring must never read as a legality claim.
    label: `reach ${reachFt} ft · hint`,
  }];
}

export default buildRangeBands;
