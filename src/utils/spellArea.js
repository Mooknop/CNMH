import { diagonalSquaresToFeet } from './rangeIncrement';

// Spell areas (#1573 B3) — pure parsing + occupancy, no React, no relay.
//
// Content authors area as free text on the spell ("20-foot burst", "15-foot
// cone"), which nothing has ever parsed. This reads that text — or an authored
// `areaShape: { shape, feet }` override when the prose is unusual — into the
// shape vocabulary the placement flow needs.
//
// The shapes behave differently, and PF2e is the reason:
//   burst      — placed anywhere in range; the player must SAY where. Occupancy
//                is computable once a point is picked.
//   emanation  — always centred on the caster. Nothing to place, and occupancy
//                is computable immediately from the caster's own occupied space.
//   cone/line  — need a direction, not just a point. v1 lets the player mark an
//                aim point (which pings, so the table sees the intent) but does
//                NOT compute occupancy — the GM adjudicates who is caught.
//
// Grid distance uses PF2e's alternating-diagonal rule (`diagonalSquaresToFeet`,
// shared with `rangeIncrement.js`'s `gridDistanceFeet`), so "within 20 feet"
// agrees with what Foundry measures on the canvas.
//
// ── Origin convention (#1751, ruled 2026-08-16 GM) ───────────────────────────
//
// This is the single place the app decides what "the origin of an area"
// means. #1735 (cones/lines) and #1733 (persistent auras) inherit this rather
// than re-deciding it.
//
//   BURST — originates at a grid INTERSECTION, not a cell. This is the PF2e/
//   Foundry convention (a burst is "centred on a point", and that point snaps
//   to grid lines) and it replaces the old floor-to-containing-cell approach,
//   which silently treated a burst as centred on a *square*. Occupancy is
//   measured from that intersection — a true point — to each candidate cell —
//   a 1x1 region in the same corner-addressed space — using the shortest
//   distance in any axis to the cell's nearest edge (a point-to-square
//   distance), then combined with PF2e's 5-10-5 alternating-diagonal rule.
//   This is the same "measure from the near edge, not the center" idiom PF2e
//   uses for reach/range between two *tokens*; a burst intersection is simply
//   a zero-size token for this purpose. It CHANGES occupancy answers for
//   spells that used to measure center-to-center (a target can now be one
//   square closer than the old math said) — ruled and accepted; see the PR
//   that introduced this comment for the specific diffs found in this repo's
//   own fixtures.
//
//   EMANATION — originates at the caster's occupied RECTANGLE (top-left cell
//   + width x height in grid squares from `cnmh_positions_global`), and the
//   area extends from that rectangle's EDGE, exactly like burst-to-cell
//   above but with a multi-cell origin instead of a point: a candidate cell's
//   distance is measured to the nearest cell of the caster's rectangle, not
//   to the caster's single anchor cell. A 10-ft emanation from a 2x2 creature
//   therefore covers more squares than the same emanation from a 1x1 one.
//   `positions` entries may not carry `width`/`height` yet (pre-#1751-bridge
//   payloads, or any client behind that protocol) — both default to 1, which
//   reproduces the old single-cell behaviour exactly.
//
//   CONE/LINE — do not compute occupancy (see above); when #1735 gives them
//   cell geometry, the origin is the same grid intersection a burst uses, so
//   two area shapes in the same spell list never disagree about "your square".

const AREA_TEXT = /(\d+)\s*-?\s*(?:foot|feet|ft\.?)\s*[- ]?\s*(burst|emanation|cone|line)/i;

export const PLACEABLE_SHAPES = ['burst', 'cone', 'line'];
export const MEASURED_SHAPES = ['burst', 'emanation'];

/**
 * The spell's area as { shape, feet }, or null when it has none (or an
 * unparseable one — a spell that says "special" simply gets no placement UI).
 *
 * Authored override wins: `ability.areaShape = { shape: 'burst', feet: 20 }`.
 */
export function parseSpellArea(ability) {
  const override = ability?.areaShape;
  if (override?.shape && Number(override.feet) > 0) {
    return { shape: String(override.shape).toLowerCase(), feet: Number(override.feet) };
  }
  const text = typeof ability?.area === 'string' ? ability.area : '';
  const match = AREA_TEXT.exec(text);
  if (!match) return null;
  return { shape: match[2].toLowerCase(), feet: Number(match[1]) };
}

// A burst must be placed before its occupancy means anything; an emanation is
// already centred on the caster; a cone/line only ever gets an aim point.
export const areaNeedsPlacement = (area) =>
  !!area && PLACEABLE_SHAPES.includes(area.shape);

export const areaComputesOccupancy = (area) =>
  !!area && MEASURED_SHAPES.includes(area.shape);

/**
 * Nearest grid intersection to a world point, in WORLD coordinates — what a
 * burst tap snaps to before anything else happens. Grid lines sit at
 * multiples of `gridSize`, so "nearest intersection" is a round-to-nearest
 * multiple on each axis. This is the point that gets sent to `templateplace`
 * for a burst: Foundry draws its true circle from here too, so the outline
 * the table sees and the point the app measured from are the same point.
 *
 * @param {{x:number,y:number}} world
 * @param {number} gridSize  pixels per grid square, from the snapshot payload
 * @returns {{x:number,y:number}|null}
 */
export function snapToGridIntersection(world, gridSize) {
  const size = Number(gridSize);
  if (!world || !Number.isFinite(size) || size <= 0) return null;
  const wx = Number(world.x);
  const wy = Number(world.y);
  if (!Number.isFinite(wx) || !Number.isFinite(wy)) return null;
  return { x: Math.round(wx / size) * size, y: Math.round(wy / size) * size };
}

/**
 * The same intersection, addressed in the corner-index space occupancy is
 * measured in: corner (c, r) sits at world (c*gridSize, r*gridSize), shared
 * by the (up to) four cells that touch it. Distinct from a *cell* address
 * ({col,row} floored to a containing square, `cellFromWorldPoint`'s
 * convention in `snapshotGeometry.js`) — an intersection has no "inside",
 * only adjacency to the cells around it.
 *
 * @param {{x:number,y:number}} world
 * @param {number} gridSize
 * @returns {{col:number,row:number}|null}
 */
export function intersectionFromWorld(world, gridSize) {
  const size = Number(gridSize);
  if (!world || !Number.isFinite(size) || size <= 0) return null;
  const wx = Number(world.x);
  const wy = Number(world.y);
  if (!Number.isFinite(wx) || !Number.isFinite(wy)) return null;
  return { col: Math.round(wx / size), row: Math.round(wy / size) };
}

// Clamp a corner-space coordinate into a cell's own corner range [c, c+1] —
// the nearest point of that cell's edge to the coordinate, in one axis.
const clampToCell = (v, cellStart) => Math.min(cellStart + 1, Math.max(cellStart, v));

/**
 * Distance from a grid intersection (a point) to a cell (a 1x1 region in the
 * same corner-addressed space), using the nearest edge of the cell in each
 * axis, then PF2e's 5-10-5 diagonal rule. Zero for any of the (up to) four
 * cells that share the intersection as a corner.
 */
function feetFromIntersectionToCell(intersection, cell, feetPerSquare) {
  const dCol = Math.abs(intersection.col - clampToCell(intersection.col, cell.col));
  const dRow = Math.abs(intersection.row - clampToCell(intersection.row, cell.row));
  return diagonalSquaresToFeet(dCol, dRow, feetPerSquare);
}

/**
 * A caster's occupied rectangle from a `positions` entry — top-left cell plus
 * width x height in grid squares. Tolerant of payloads that don't carry
 * width/height yet (pre-#1751-bridge, or any client behind that protocol):
 * both default to 1, the historical single-cell approximation.
 *
 * @param {{col:number,row:number,width?:number,height?:number}} position
 * @returns {{col:number,row:number,width:number,height:number}|null}
 */
export function casterRectFromPosition(position) {
  if (!position) return null;
  const { col, row } = position;
  if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
  const width = Math.max(1, Math.round(Number(position.width)) || 1);
  const height = Math.max(1, Math.round(Number(position.height)) || 1);
  return { col, row, width, height };
}

// Distance from a caster's occupied rectangle to a cell — the nearest cell
// of the rectangle in each axis, then the 5-10-5 diagonal rule. Zero for any
// cell the rectangle itself covers.
function feetFromRectToCell(rect, cell, feetPerSquare) {
  const clampCol = Math.min(rect.col + rect.width - 1, Math.max(rect.col, cell.col));
  const clampRow = Math.min(rect.row + rect.height - 1, Math.max(rect.row, cell.row));
  const dCol = Math.abs(cell.col - clampCol);
  const dRow = Math.abs(cell.row - clampRow);
  return diagonalSquaresToFeet(dCol, dRow, feetPerSquare);
}

/**
 * The world point Foundry should draw an emanation's circle from — the
 * center of the caster's occupied rectangle, so a 2x2 caster's outline is
 * centred on their whole space rather than their anchor cell.
 *
 * @param {{col,row,width,height}} rect
 * @param {number} gridSize
 * @returns {{x:number,y:number}|null}
 */
export function casterRectCenterWorld(rect, gridSize) {
  const size = Number(gridSize);
  if (!rect || !Number.isFinite(size) || size <= 0) return null;
  return { x: (rect.col + rect.width / 2) * size, y: (rect.row + rect.height / 2) * size };
}

/**
 * Which combatants stand inside the area.
 *
 * @param {{shape:string,feet:number}} area
 * @param {Object}   opts
 * @param {{col,row}} opts.originIntersection  the placed grid intersection
 *                     (burst) — a corner-space point, see `intersectionFromWorld`;
 *                     ignored for emanation.
 * @param {Object}   opts.positions       { [entryId]: { col, row, width?, height? } }
 *                     from the bridge
 * @param {string}   opts.casterEntryId   the caster's combatant id (emanation origin)
 * @param {Array}    opts.order           encounter order, for names/kind
 * @param {number}   [opts.feetPerSquare] scene scale (PF2e default 5)
 * @returns {Array<{entryId,name,kind,feet}>} occupants, nearest first; [] when
 *          the shape doesn't compute occupancy or positions are unavailable.
 */
export function areaOccupants(area, {
  originIntersection,
  positions,
  casterEntryId,
  order = [],
  feetPerSquare = 5,
} = {}) {
  if (!areaComputesOccupancy(area) || !positions) return [];

  const isEmanation = area.shape === 'emanation';
  const casterRect = isEmanation ? casterRectFromPosition(positions[casterEntryId]) : null;
  if (isEmanation && !casterRect) return [];
  if (!isEmanation && !originIntersection) return [];

  const entryOf = (entryId) => order.find((e) => e && e.entryId === entryId) || null;

  return Object.entries(positions)
    .map(([entryId, cell]) => ({ entryId, cell }))
    // An emanation radiates FROM the caster, so they are its origin rather than
    // something caught in it. A burst has no such courtesy — drop one at your
    // own feet and you are standing in the fire like anyone else.
    .filter(({ entryId }) => !(isEmanation && entryId === casterEntryId))
    .map(({ entryId, cell }) => ({
      entryId,
      cell,
      feet: isEmanation
        ? feetFromRectToCell(casterRect, cell, feetPerSquare)
        : feetFromIntersectionToCell(originIntersection, cell, feetPerSquare),
    }))
    .filter(({ feet }) => feet <= area.feet)
    .map(({ entryId, feet }) => {
      const entry = entryOf(entryId);
      return {
        entryId,
        name: entry?.name || entryId,
        kind: entry?.kind || 'enemy',
        feet,
      };
    })
    // Only combatants the encounter actually knows about can be targeted.
    .filter((o) => !!entryOf(o.entryId))
    .sort((a, b) => a.feet - b.feet);
}

// Human label for the section header ("20-foot burst").
export const areaLabel = (area) =>
  (area ? `${area.feet}-foot ${area.shape}` : '');
