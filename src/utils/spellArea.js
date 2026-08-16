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

// ─────────────────────────────────────────────────────────────────────────────
// Cones and lines — directional self-origin geometry (#1735 S1)
// ─────────────────────────────────────────────────────────────────────────────
//
// Pure cell math. No hooks, no relay, no components: `coneCells`/`lineCells`
// take the caster's occupied rectangle (the same `{col,row,width,height}`
// `casterRectFromPosition` produces) plus a compass facing, and hand back the
// `{col,row}` cell list `areaOccupants` and `SnapshotAreaOverlay` already
// speak. Nothing above this file changes until #1735 S3.
//
// ── The compass vocabulary ───────────────────────────────────────────────────
//
// `compassDeg` is degrees clockwise from north, in multiples of 45 — the
// `DirectionRosette` (#1754) vocabulary, whose `ROSETTE_DIRECTIONS` table is
// listed in exactly this order, so `ROSETTE_DIRECTIONS[deg / 45]` is the
// picked point. Screen axes: +col east, +row SOUTH (so north is -row).
//
// ── Self-origin (ruled 2026-08-16, #1735 epic body) ─────────────────────────
//
// Every cone and line in this app starts from the CASTER's space; there is no
// placed origin (those are on the deferred ledger). The origin point is the
// midpoint of the caster rectangle's FACE toward the facing for a cardinal
// direction, and the rectangle's CORNER toward the facing for a diagonal one:
//
//   east from a 1x1 caster at (0,0)  → (1, 0.5)   the east edge's midpoint
//   east from a 2x2 caster at (0,0)  → (2, 1)     that face's midpoint too,
//                                                 which lands on a grid line
//   northeast from a 1x1 at (0,0)    → (1, 0)     the NE corner
//
// That IS the RAW instruction: "the first square of that cone must share an
// edge with your space if you're aiming orthogonally, or it must touch a
// corner of your space if you're aiming diagonally… If you're Large or
// larger, the first square can run along the edge of any square of your
// space" (Player Core 428). The Large-or-larger freedom is a player choice we
// deliberately do not surface — the face midpoint is the one deterministic
// answer, and it keeps the shape symmetric about the caster.
//
// ── The quantization, and where the published diagrams disagree ─────────────
//
// A cell is in the cone when BOTH hold:
//   1. its CENTER lies in the quarter-plane the facing opens (±45° of a
//      cardinal facing; the whole quadrant between the two neighbouring
//      cardinals for a diagonal facing) — boundaries inclusive; and
//   2. its distance from the origin is within `feet`, measured as PF2e
//      measures everything else on this grid: ceil the raw x/y offsets to
//      whole squares, then apply the 5-10-5 alternating-diagonal rule
//      (`diagonalSquaresToFeet`, shared with `rangeIncrement.js`).
//
// Checked against the Player Core "Areas" cone diagrams, cell for cell:
//   15-ft cardinal cone   7 squares  (1 / 3 / 3 by rank)   ✔ matches
//   15-ft diagonal cone   6 squares  (3 / 2 / 1 by rank)   ✔ matches
//   30-ft diagonal cone  24 squares                        ✔ matches
//   30-ft cardinal cone  26 squares  — the book draws 28.
//
// That last one is a KNOWN inconsistency in the published diagrams, not a bug
// here. The book's 15-ft cardinal cone is drawn from a square's EDGE, while
// its 30-ft and 60-ft cardinal cones are drawn from a CORNER (which is why
// they are two squares wide at the base and cover 28 rather than 26). A
// corner-drawn cardinal cone contradicts the rules text quoted above — its
// second base square only touches your space at a corner, it does not share
// an edge — so we take the edge origin for every cardinal facing and accept
// the 26-vs-28 divergence at 30 ft and beyond. The divergence really is only
// the origin: run this same math from a corner and it reproduces the book's
// 28-square shape exactly, which is precisely what a 2x2 caster's cardinal
// cone does here (an even-sized face's midpoint IS a grid corner — see the
// `coneCells` tests, where the 2x2 east cone is the book's 30-ft template).
//
// A naive angle sweep would disagree with the printed templates everywhere,
// because it would measure straight-line distance; we measure the PF2e way.
// The 5-10-5 rule is what makes a cone lumpy rather than a smooth quarter
// disc — our 30-ft cardinal cone is 7 squares wide at rank 5 but only 3 wide
// at rank 6 — and the printed templates are lumpy in exactly those places
// (the book's own 30-ft cone is 8 wide at rank 4 and 2 wide at rank 6).
//
// "You can't aim a cone so that it overlaps your space" needs no special case:
// with the origin on the caster's own face or corner, every cell of the
// caster's rectangle sits behind the quarter-plane and is rejected by test 1.

// Facing → unit step in cell space, indexed by compass degrees.
const COMPASS_STEPS = {
  0: { dc: 0, dr: -1 },
  45: { dc: 1, dr: -1 },
  90: { dc: 1, dr: 0 },
  135: { dc: 1, dr: 1 },
  180: { dc: 0, dr: 1 },
  225: { dc: -1, dr: 1 },
  270: { dc: -1, dr: 0 },
  315: { dc: -1, dr: -1 },
};

/**
 * A compass facing normalized into {0,45,…,315}, or null when it isn't one of
 * the eight rosette points. Wraps, so 405 reads as 45 and -90 as 270.
 *
 * Deliberately strict about the input's TYPE, not just its value: `Number(null)`
 * and `Number([])` are both 0, and 0 is due north — a missing facing must not
 * quietly aim a cone north.
 *
 * @param {number|string} deg
 * @returns {number|null}
 */
export function normalizeCompassDeg(deg) {
  const numeric = typeof deg === 'number'
    || (typeof deg === 'string' && deg.trim() !== '');
  const n = numeric ? Number(deg) : NaN;
  if (!Number.isFinite(n)) return null;
  const wrapped = ((n % 360) + 360) % 360;
  return wrapped % 45 === 0 ? wrapped : null;
}

// The origin point of a self-origin area, in continuous corner space (units of
// grid squares, same axes as {col,row}): the face midpoint toward a cardinal
// facing, the corner toward a diagonal one. See the block comment above.
function selfOriginPoint(rect, step) {
  const left = rect.col;
  const top = rect.row;
  const right = rect.col + rect.width;
  const bottom = rect.row + rect.height;
  return {
    x: step.dc > 0 ? right : step.dc < 0 ? left : (left + right) / 2,
    y: step.dr > 0 ? bottom : step.dr < 0 ? top : (top + bottom) / 2,
  };
}

// Is a cell center (offset dx/dy from the origin) inside the quarter-plane the
// facing opens? Cardinal: within ±45°, i.e. the along-axis offset is at least
// the across-axis one. Diagonal: the whole quadrant between the neighbouring
// cardinals. Boundaries are inclusive — that is what makes an even-sized
// caster's cardinal cone pick up its 45° edge cells (the same cells the book's
// corner-drawn 30-ft cone has).
function withinQuarter(dx, dy, step) {
  if (step.dc !== 0 && step.dr !== 0) return dx * step.dc >= 0 && dy * step.dr >= 0;
  if (step.dc !== 0) return dx * step.dc >= Math.abs(dy);
  return dy * step.dr >= Math.abs(dx);
}

// Row-major so a cell list reads like the printed template top-to-bottom,
// left-to-right, and so two calls with the same inputs are byte-identical.
const sortCells = (cells) =>
  cells.sort((a, b) => (a.row - b.row) || (a.col - b.col));

/**
 * The cells a cone covers, per the PF2e "Areas" cone templates.
 *
 * @param {{col:number,row:number,width?:number,height?:number}} casterRect
 *        the caster's occupied rectangle (`casterRectFromPosition`'s shape);
 *        width/height default to 1 for payloads that predate #1751.
 * @param {number} compassDeg  facing, degrees clockwise from north (mult. of 45)
 * @param {number} feet        the cone's length
 * @param {Object} [opts]
 * @param {number} [opts.feetPerSquare=5]  scene scale
 * @returns {Array<{col:number,row:number}>} row-major; [] on bad input
 */
export function coneCells(casterRect, compassDeg, feet, { feetPerSquare = 5 } = {}) {
  const rect = casterRectFromPosition(casterRect);
  const deg = normalizeCompassDeg(compassDeg);
  const reach = Number(feet);
  const scale = Number(feetPerSquare);
  if (!rect || deg === null || !(reach > 0) || !(scale > 0)) return [];

  const step = COMPASS_STEPS[deg];
  const origin = selfOriginPoint(rect, step);
  // A cell farther than `reach / scale` squares in EITHER axis is out however
  // the diagonals fall, so that plus a square of slack bounds the search.
  const span = Math.ceil(reach / scale) + 1;
  const colFrom = Math.floor(origin.x) - span;
  const rowFrom = Math.floor(origin.y) - span;

  const cells = [];
  for (let row = rowFrom; row <= rowFrom + 2 * span; row += 1) {
    for (let col = colFrom; col <= colFrom + 2 * span; col += 1) {
      const dx = col + 0.5 - origin.x;
      const dy = row + 0.5 - origin.y;
      if (!withinQuarter(dx, dy, step)) continue;
      const squares = diagonalSquaresToFeet(
        Math.ceil(Math.abs(dx)), Math.ceil(Math.abs(dy)), scale,
      );
      if (squares > reach) continue;
      cells.push({ col, row });
    }
  }
  return sortCells(cells);
}

// How many diagonal squares fit in `feet` under the 5-10-5 rule — a 60-ft
// diagonal line is 8 squares long (8 + floor(8/2) = 12 squares of movement),
// not 12.
function diagonalSquaresWithin(feet, feetPerSquare) {
  let n = 0;
  while (diagonalSquaresToFeet(n + 1, n + 1, feetPerSquare) <= feet) n += 1;
  return n;
}

/**
 * The cells a line covers.
 *
 * Same origin rule as `coneCells` (face midpoint cardinal, corner diagonal).
 * From there the line is `feet` long counted the PF2e way — straight squares
 * for a cardinal facing, 5-10-5 diagonal squares for a diagonal one — and
 * `width / feetPerSquare` cells wide, widening perpendicular to the facing.
 *
 * Width quantization: the line is `width / feetPerSquare` parallel runs
 * ("chains"), the ones nearest the origin, ties broken toward the
 * counter-clockwise side of the facing. That falls out cleanly for the two
 * cases that matter:
 *   - 1x1 caster, 5-ft line east  → the caster's own row, one cell wide.
 *   - 2x2 caster, 10-ft line east → the caster's own two rows, symmetric
 *     about the face midpoint (which sits on a grid line for an even face).
 * An even width from an odd-sized face cannot be symmetric — two cells never
 * centre on one cell's middle — so it leans counter-clockwise (a 10-ft line
 * east from a 1x1 caster takes the caster's row and the row north of it).
 *
 * A diagonal line's chains are the adjacent diagonal runs, stepped ONE
 * CARDINAL square apart rather than one diagonal square apart. Stepping them
 * a full diagonal apart is the obvious reading of "perpendicular", and it is
 * wrong: those runs only touch at corners, so a 15-ft-wide diagonal line
 * would come out as a checkerboard with creature-sized holes in it. Adjacent
 * runs give the contiguous swathe the line is meant to be, at the cost of the
 * band being 5/sqrt(2) ft per chain in true geometry — the same grid-counting
 * approximation that lets a diagonal square be "5 feet" at all.
 *
 * @param {{col:number,row:number,width?:number,height?:number}} casterRect
 * @param {number} compassDeg
 * @param {number} feet          the line's length
 * @param {number} [width=5]     the line's width in feet (PF2e default 5)
 * @param {Object} [opts]
 * @param {number} [opts.feetPerSquare=5]
 * @returns {Array<{col:number,row:number}>} row-major; [] on bad input
 */
export function lineCells(casterRect, compassDeg, feet, width = 5, { feetPerSquare = 5 } = {}) {
  const rect = casterRectFromPosition(casterRect);
  const deg = normalizeCompassDeg(compassDeg);
  const reach = Number(feet);
  const scale = Number(feetPerSquare);
  if (!rect || deg === null || !(reach > 0) || !(scale > 0)) return [];

  const step = COMPASS_STEPS[deg];
  const diagonal = step.dc !== 0 && step.dr !== 0;
  // 90° clockwise on screen (y grows south). A diagonal facing keeps only the
  // x half of that, so consecutive chains are edge-adjacent — see the doc
  // comment's note on checkerboard holes.
  const perp = diagonal
    ? { dc: -step.dr, dr: 0 }
    : { dc: -step.dr, dr: step.dc };
  const origin = selfOriginPoint(rect, step);

  const length = diagonal
    ? diagonalSquaresWithin(reach, scale)
    : Math.floor(reach / scale);
  const rawChains = Math.round(Number(width) / scale);
  const chains = Number.isFinite(rawChains) && rawChains >= 1 ? rawChains : 1;
  if (length < 1) return [];

  // Does the origin sit on a chain's centre line (odd face, or any diagonal
  // corner — a diagonal chain's cell centres lie exactly on the corner ray),
  // or between two chains (even face)? That decides whether an odd width can
  // be symmetric.
  const faceSpan = step.dc !== 0 ? rect.height : rect.width;
  const centred = diagonal || faceSpan % 2 === 1;
  const first = centred ? -Math.floor(chains / 2) : -Math.ceil(chains / 2);
  const shift = centred ? 0 : 0.5;

  const cells = [];
  for (let k = first; k < first + chains; k += 1) {
    for (let t = 0; t < length; t += 1) {
      const x = origin.x + (t + 0.5) * step.dc + (k + shift) * perp.dc;
      const y = origin.y + (t + 0.5) * step.dr + (k + shift) * perp.dr;
      cells.push({ col: Math.floor(x), row: Math.floor(y) });
    }
  }
  return sortCells(cells);
}
