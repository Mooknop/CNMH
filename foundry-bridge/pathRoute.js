// Route-around-on-clip (#1832, epic #1831) — the ONE planning function every
// movement rail consumes.
//
// `planTokenPath` (pf2eAdapter.js) is core's answer: it routes BETWEEN the
// requested waypoints and constrains the result at the first wall. Tapping past
// a corner therefore walks into the wall and stops. `planRoutedPath` is a
// drop-in replacement with the same `{ path, clipped }` contract that adds one
// thing: when a segment CLIPS, it re-runs that segment through pathfind.js's A*
// and walks around instead.
//
// STRAIGHT FIRST, ALWAYS. The whole-request straight plan runs before anything
// else, and an unclipped result is returned untouched — no search, no grid
// calibration, not one extra collision ray. Open ground behaves byte-for-byte
// as it did before this module existed; the search is a clip-only cost.
//
// And when it does clip, core's answer is KEPT, not re-derived: the legal route
// core produced up to the clip becomes the prefix (terrain-priced and occupancy-
// aware, which the pure search is not), and only the unreachable REMAINDER is
// searched. A route that clips on its last leg therefore pays for exactly one
// A*, and the waypoints core already delivered are never re-planned.
//
// ONE FUNCTION, THREE CALLERS. `handleMovePlan`, `confirmWaypointMove`'s re-plan
// and `groupMove.moveOne` all call this. That is not tidiness — the confirm
// RE-PLANS from the captured start, so a plan that routed and a confirm that
// merely constrained would execute a different route than the player approved.
// A* is deterministic (fixed expansion order, total tie-break ordering), so the
// same request from the same position yields the same cells every time.
//
// CLIPPED, RESTATED. `clipped: true` used to mean "a wall is in the way". It now
// means "even going around, the destination is out of reach within budget" —
// the partial route toward it rides along, exactly as the truncated straight
// route used to. That is a semantics change with an unchanged wire shape, which
// is what PATHFIND_PROTOCOL = 23 announces.
//
// DEGRADED BACKEND. Pre-v14 (or a build missing the movement-path pipeline)
// keeps today's leg-by-leg collision walk untouched — see
// `supportsMovementPathApi`. The v14 pipeline is the target; gen-13 compat is
// preserved by leaving it alone rather than by half-routing it.
//
// All canvas/geometry calls go through pf2eAdapter.js.

import {
  getGridSize,
  getGridDistance,
  getTokenDimensions,
  gridToPixels,
  hasWallCollision,
  measureGridPathCost,
  planTokenPath,
  supportsMovementPathApi,
} from './pf2eAdapter.js';
import {
  DIAGONAL_ALTERNATING,
  DIAGONAL_EQUIDISTANT,
  findPath,
  pathCostFeet,
  reachableCells,
} from './pathfind.js';

// Pixel slop when asking "did this leg land where it was asked to?" — the same
// half-pixel tolerance planTokenPath and walkTokenPath already use.
const EPSILON = 0.5;

// Cell ↔ creature-centre conversion for one token. Deliberately local rather
// than movement.js's `cellGeometry`: this module is imported BY movement.js, and
// a cycle between the planner and its caller is not worth saving eight lines.
// Both derive from the same adapter primitives, so they cannot drift.
function routeGeometry(token) {
  const gridSize = getGridSize();
  const { width, height } = getTokenDimensions(token);
  const offX = (width * gridSize) / 2;
  const offY = (height * gridSize) / 2;
  return {
    gridSize,
    offX,
    offY,
    // The token's CURRENT centre — the same reading planTokenPath takes when no
    // explicit origin is supplied.
    centreOf: (t) => ({
      x: Number(t.x ?? t.document?.x ?? 0) + offX,
      y: Number(t.y ?? t.document?.y ?? 0) + offY,
    }),
    toCentre: ({ col, row }) => {
      const { x, y } = gridToPixels(col, row);
      return { x: x + offX, y: y + offY };
    },
    toCell: ({ x, y }) => ({
      col: Math.round((x - offX) / gridSize),
      row: Math.round((y - offY) / gridSize),
    }),
  };
}

// What diagonal rule and square size is this scene actually measuring with?
//
// Guessing is not an option: pathfind's cost model has to agree with
// `measureTokenPathCost`, or a budget clip stops the mover somewhere the wire's
// costFeet does not describe. So probe the live measurement backend — one
// orthogonal step for the square's worth in feet, then one and two diagonals.
// PF2e's alternating rule prices two diagonals at 3x one (5 + 10); an
// equidistant grid prices them at 2x (5 + 5). Anything the probe cannot answer
// falls back to the PF2e default.
function gridMetrics(sample, gridSize) {
  const at = (dx, dy) => ({ x: sample.x + dx * gridSize, y: sample.y + dy * gridSize });
  const orthogonal = measureGridPathCost([sample, at(1, 0)]);
  const feetPerSquare = orthogonal > 0 ? orthogonal : getGridDistance();

  const oneDiagonal = measureGridPathCost([sample, at(1, 1)]);
  const twoDiagonals = measureGridPathCost([sample, at(1, 1), at(2, 2)]);
  const diagonalRule = (oneDiagonal > 0 && twoDiagonals > 0)
    ? (twoDiagonals >= oneDiagonal * 2.5 ? DIAGONAL_ALTERNATING : DIAGONAL_EQUIDISTANT)
    : DIAGONAL_ALTERNATING;

  return { feetPerSquare, diagonalRule };
}

// The per-step wall test the search runs on, bound to this token's footprint.
// Centre-to-centre, for the same reason the 5-ft stepper is: a corner-to-corner
// ray runs along the grid lines where walls sit and reports phantom collisions.
function cellBlocker(geo) {
  return (from, to) => {
    const a = geo.toCentre(from);
    const b = geo.toCentre(to);
    return hasWallCollision(a.x, a.y, b.x, b.y);
  };
}

const reached = (point, want) => Boolean(point)
  && Math.abs(point.x - want.x) <= EPSILON
  && Math.abs(point.y - want.y) <= EPSILON;

/**
 * Plan the route a token would walk through `waypointCenters`, going AROUND
 * walls that the straight plan would have clipped at.
 *
 * @param {object} token
 * @param {Array<{x:number,y:number}>} waypointCenters  creature centres,
 *   excluding the origin — planTokenPath's own input shape.
 * @param {object} [options]
 * @param {{x:number,y:number}} [options.origin]  measure from here rather than
 *   the token's live position (the confirm captures its start before moving).
 * @param {number} [options.budgetFeet]  the mover's reach; caps how far the
 *   search will route. Absent = uncapped (the single-tap plan flow, where the
 *   app prices the route and the player decides).
 * @returns {Promise<{path:Array,clipped:boolean,routed:boolean,costFeet:(number|null)}>}
 *   `path` is centres excluding the origin, exactly like planTokenPath.
 *   `routed` = A* produced at least one segment. `costFeet` is the search's own
 *   terrain-blind estimate (null when nothing was routed) — callers still price
 *   the wire's costFeet through measureTokenPathCost, which is terrain-aware.
 */
export async function planRoutedPath(token, waypointCenters, { origin, budgetFeet } = {}) {
  const requested = (waypointCenters ?? []).map((p) => ({ x: Number(p.x), y: Number(p.y) }));
  const straight = await planTokenPath(token, requested, { origin });
  if (!requested.length || !straight.clipped) {
    return { ...straight, routed: false, costFeet: null };
  }
  if (!supportsMovementPathApi(token)) {
    // Degraded backend: today's behaviour, untouched.
    return { ...straight, routed: false, costFeet: null };
  }

  const geo = routeGeometry(token);
  const startCentre = origin ?? geo.centreOf(token);
  const metrics = gridMetrics(startCentre, geo.gridSize);
  const isBlocked = cellBlocker(geo);
  const budget = Number.isFinite(budgetFeet) && budgetFeet > 0 ? budgetFeet : Infinity;

  // KEEP what core already legally produced. The straight route up to the clip
  // is core's own answer — terrain-priced, occupancy-aware, and identical to
  // what shipped before this module. Only the REMAINDER is searched, so a route
  // that clips on its last leg pays for one search, not one per waypoint.
  const path = [...straight.path];
  const startCell = geo.toCell(startCentre);
  let fromCentre = straight.path.at(-1) ?? startCentre;
  let fromCell = geo.toCell(fromCentre);

  const priced = pathCostFeet(startCell, path.map(geo.toCell), metrics);
  let spent = priced.costFeet;
  let diagonals = priced.diagonals;

  // How much of the request core actually delivered: everything up to and
  // including the last requested waypoint the straight route passed through.
  // The next one is where the wall is, so it goes straight to the search — core
  // has already answered "not this way" for that segment.
  let next = 0;
  for (const want of requested) {
    if (path.some((p) => reached(p, want))) next += 1;
    else break;
  }

  // Core flagged a constraint yet still delivered every requested waypoint —
  // there is nothing left to search for, so its answer stands verbatim, flag
  // included.
  if (next >= requested.length) return { ...straight, routed: false, costFeet: null };

  let routed = false;
  let clipped = false;

  for (let i = next; i < requested.length; i += 1) {
    const want = requested[i];
    if (i > next) {
      // Beyond the routed segment, straight-first applies again: a clear leg
      // costs exactly what it always did.
      const leg = await planTokenPath(token, [want], { origin: fromCentre });
      if (!leg.clipped && reached(leg.path.at(-1), want)) {
        const legPriced = pathCostFeet(fromCell, leg.path.map(geo.toCell), {
          ...metrics, diagonalsSoFar: diagonals,
        });
        path.push(...leg.path);
        spent += legPriced.costFeet;
        diagonals = legPriced.diagonals;
        fromCentre = leg.path.at(-1) ?? fromCentre;
        fromCell = geo.toCell(fromCentre);
        continue;
      }
    }

    const search = findPath(fromCell, geo.toCell(want), {
      isBlocked,
      ...metrics,
      diagonalsSoFar: diagonals,
      budgetFeet: budget === Infinity ? Infinity : Math.max(0, budget - spent),
    });
    routed = true;
    path.push(...search.path.map(geo.toCentre));
    spent += search.costFeet;
    diagonals = search.diagonals;
    if (search.path.length) {
      fromCell = search.path.at(-1);
      fromCentre = geo.toCentre(fromCell);
    }
    if (!search.reachedGoal) {
      // Not reachable even going around, within budget — the best partial is
      // the answer, and THAT is what `clipped` now means.
      clipped = true;
      break;
    }
  }

  return { path, clipped, routed, costFeet: routed ? spent : null };
}

/**
 * Cells CONNECTED to a target cell, in ascending WALKING distance from it — the
 * candidate list a group-move spread picks destinations from (#1832). Wraps
 * pathfind's flood fill with this scene's geometry.
 *
 * Cell centres here are grid-centres, size-agnostic: candidate selection is
 * about the CELLS, not about which creature ends up in one.
 */
export function connectedCells(target, options = {}, gridSize = getGridSize()) {
  const centre = ({ col, row }) => {
    const { x, y } = gridToPixels(col, row);
    return { x: x + gridSize / 2, y: y + gridSize / 2 };
  };
  return reachableCells(target, {
    ...options,
    isBlocked: (from, to) => {
      const a = centre(from);
      const b = centre(to);
      return hasWallCollision(a.x, a.y, b.x, b.y);
    },
  });
}
