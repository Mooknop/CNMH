// Grid pathfinding — pure geometry, no Foundry globals (#1832, epic #1831).
//
// Foundry core offers no A*. `Token#findMovementPath` routes BETWEEN waypoints
// and `Token#constrainMovementPath` CLIPS the result at the first wall — see
// pf2eAdapter.js's own note on `planTokenPath`. So a tap past a corner walks
// into the wall and stops. This module is the missing search: an 8-way A* over
// grid cells that goes AROUND.
//
// Follows the flanking.js / adjacency.js pattern — nothing in here knows what a
// Foundry is (lint enforces it). The per-step wall test arrives as an injected
// callback `(fromCell, toCell) => boolean` (true = blocked), which is what makes
// the whole search unit-testable against synthetic mazes and what keeps every
// canvas access inside pf2eAdapter.js. pathRoute.js is the module that binds
// this to a real scene.
//
// COST MODEL. PF2e's alternating diagonals (5-10-5-10…): the 1st diagonal step
// of a path costs one square, the 2nd costs two, and so on. That is a property
// of the WHOLE path, not of a step, so the search state is `(cell, diagonal
// parity)` rather than `cell` — two routes reaching the same cell with different
// parities genuinely have different futures. Grids configured equidistant
// (Chebyshev, every step one square) are supported too; pathRoute.js calibrates
// which rule is live against the scene's own measurement backend rather than
// assuming, because a cost model that disagrees with `measureTokenPathCost`
// makes `costFeet` drift from what the confirm actually executes.
//
// HEURISTIC. PF2e octile distance to the goal, evaluated at the node's own
// parity — exact on open ground, never an overestimate with walls in the way,
// so A* stays optimal. (Re-opening is allowed: the parity-aware heuristic is
// admissible but not provably consistent, and re-opening costs nothing at these
// search sizes while guaranteeing the cheapest route.)
//
// BOUNDS. Three, all cheap: `budgetFeet` caps g-cost, `radiusCells` caps how far
// from the start the search may wander, and `nodeCap` caps expansions outright.
// A Speed-30 search is a ~13x13 neighbourhood; the caps exist for pathological
// scenes (a sealed vault, a 200x200 open field), not for the normal case.
//
// PARTIAL RESULTS. Unreachable or over budget returns the BEST PARTIAL — the
// route to the expanded node closest to the goal by heuristic (tie-break: lowest
// cost). That is today's "walk the reachable prefix and stop" semantics,
// upgraded to walk around corners on the way.

// Deterministic expansion order (N, NE, E, SE, S, SW, W, NW). Determinism
// matters beyond tidiness: the plan and the confirm run this search separately,
// and a route the plan promised has to be exactly what the confirm executes.
const DIRECTIONS = Object.freeze([
  Object.freeze({ dc: 0, dr: -1 }),
  Object.freeze({ dc: 1, dr: -1 }),
  Object.freeze({ dc: 1, dr: 0 }),
  Object.freeze({ dc: 1, dr: 1 }),
  Object.freeze({ dc: 0, dr: 1 }),
  Object.freeze({ dc: -1, dr: 1 }),
  Object.freeze({ dc: -1, dr: 0 }),
  Object.freeze({ dc: -1, dr: -1 }),
]);

export const DIAGONAL_ALTERNATING = 'alternating';
export const DIAGONAL_EQUIDISTANT = 'equidistant';

// Expansions before the search gives up and answers with its best partial.
// Generous for any real move (a 30ft Stride explores a few hundred states) and
// a hard stop for a scene that has sealed the goal off behind a wall.
export const DEFAULT_NODE_CAP = 2000;

const cellKey = (col, row, parity) => `${col},${row},${parity}`;
const chebyshev = (a, b) => Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
const sameCell = (a, b) => a.col === b.col && a.row === b.row;

// Feet for one step, given how many diagonals the path has already spent.
function stepFeet(diagonal, diagonalsSoFar, feetPerSquare, diagonalRule) {
  if (!diagonal || diagonalRule === DIAGONAL_EQUIDISTANT) return feetPerSquare;
  return diagonalsSoFar % 2 === 0 ? feetPerSquare : feetPerSquare * 2;
}

/**
 * PF2e octile distance between two cells, in feet, honouring the alternating
 * diagonal rule from a given diagonal count. Exact on open ground — which is
 * what makes it an admissible A* heuristic once walls are in the way.
 */
export function octileFeet(from, to, {
  feetPerSquare = 5,
  diagonalRule = DIAGONAL_ALTERNATING,
  diagonalsSoFar = 0,
} = {}) {
  const dx = Math.abs(to.col - from.col);
  const dy = Math.abs(to.row - from.row);
  const diagonals = Math.min(dx, dy);
  const straights = Math.max(dx, dy) - diagonals;
  if (diagonalRule === DIAGONAL_EQUIDISTANT) {
    return (straights + diagonals) * feetPerSquare;
  }
  // Starting on an even count the next diagonal is the cheap one, so cheap
  // steps take the ceiling of the split; starting odd they take the floor.
  const cheap = diagonalsSoFar % 2 === 0
    ? Math.ceil(diagonals / 2)
    : Math.floor(diagonals / 2);
  const pricey = diagonals - cheap;
  return (straights + cheap) * feetPerSquare + pricey * feetPerSquare * 2;
}

/**
 * The terrain-blind cost of walking a cell sequence, under the same rule the
 * search uses. `cells` excludes the origin (the shape findPath returns), so the
 * origin is passed separately.
 */
export function pathCostFeet(origin, cells, {
  feetPerSquare = 5,
  diagonalRule = DIAGONAL_ALTERNATING,
  diagonalsSoFar = 0,
} = {}) {
  let total = 0;
  let diagonals = diagonalsSoFar;
  let from = origin;
  for (const cell of cells ?? []) {
    const dc = Math.abs(cell.col - from.col);
    const dr = Math.abs(cell.row - from.row);
    // Tolerate a leg that spans more than one cell (the degraded planner hands
    // back waypoint-grained routes): price it as its Chebyshev interpolation.
    const legDiagonals = Math.min(dc, dr);
    const legStraights = Math.max(dc, dr) - legDiagonals;
    for (let i = 0; i < legDiagonals; i += 1) {
      total += stepFeet(true, diagonals, feetPerSquare, diagonalRule);
      diagonals += 1;
    }
    total += legStraights * feetPerSquare;
    from = cell;
  }
  return { costFeet: total, diagonals };
}

// Minimal binary min-heap. Ordered by f, then g (prefer the node that has
// actually travelled further — it is closer to a real answer), then STEP COUNT
// (equal-cost routes exist in quantity under the alternating rule — a dog-leg
// of three diagonals and two straights prices identically to four diagonals —
// and the straighter one is the one a player expects to see drawn), then
// insertion sequence so ties never depend on Map iteration order.
class NodeHeap {
  constructor() {
    this.items = [];
    this.seq = 0;
  }

  get size() { return this.items.length; }

  push(node) {
    node.seq = this.seq++;
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (NodeHeap.before(items[i], items[parent])) {
        [items[i], items[parent]] = [items[parent], items[i]];
        i = parent;
      } else break;
    }
  }

  pop() {
    const items = this.items;
    if (!items.length) return null;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < items.length && NodeHeap.before(items[l], items[best])) best = l;
        if (r < items.length && NodeHeap.before(items[r], items[best])) best = r;
        if (best === i) break;
        [items[i], items[best]] = [items[best], items[i]];
        i = best;
      }
    }
    return top;
  }

  static before(a, b) {
    if (a.f !== b.f) return a.f < b.f;
    if (a.g !== b.g) return a.g > b.g;
    if (a.steps !== b.steps) return a.steps < b.steps;
    return a.seq < b.seq;
  }
}

// One memoized wall test per undirected edge per search. Movement legality is
// symmetric, so both directions share the answer — which roughly halves the
// collision rays a dense search fires.
function memoizedBlocker(isBlocked) {
  const cache = new Map();
  return (from, to) => {
    const forward = from.col < to.col || (from.col === to.col && from.row <= to.row);
    const a = forward ? from : to;
    const b = forward ? to : from;
    const key = `${a.col},${a.row}|${b.col},${b.row}`;
    let hit = cache.get(key);
    if (hit === undefined) {
      hit = Boolean(isBlocked(from, to));
      cache.set(key, hit);
    }
    return hit;
  };
}

/**
 * A* from `start` to `goal` over grid cells.
 *
 * @param {{col:number,row:number}} start
 * @param {{col:number,row:number}} goal
 * @param {object} options
 * @param {(from:object,to:object)=>boolean} options.isBlocked  true = a wall
 *   stops movement between these two adjacent cells.
 * @param {number} [options.feetPerSquare=5]
 * @param {string} [options.diagonalRule='alternating']
 * @param {number} [options.diagonalsSoFar=0]  diagonals already spent by the
 *   route this segment continues — the alternating rule runs across the WHOLE
 *   measured path, so a segment that starts mid-route must start mid-cadence.
 * @param {number} [options.budgetFeet=Infinity]  hard cap on accumulated cost.
 * @param {number} [options.nodeCap=DEFAULT_NODE_CAP]
 * @param {number} [options.radiusCells]  how far from the start the search may
 *   stray (Chebyshev). Defaults to the budget's reach, else the straight-line
 *   distance plus room for a detour.
 * @returns {{path:Array,costFeet:number,reachedGoal:boolean,diagonals:number}}
 *   `path` excludes the start and ends at the goal (or, on a partial, at the
 *   expanded cell closest to it).
 */
export function findPath(start, goal, options = {}) {
  const {
    isBlocked,
    feetPerSquare = 5,
    diagonalRule = DIAGONAL_ALTERNATING,
    diagonalsSoFar = 0,
    budgetFeet = Infinity,
    nodeCap = DEFAULT_NODE_CAP,
  } = options;

  const from = { col: Math.round(start.col), row: Math.round(start.row) };
  const to = { col: Math.round(goal.col), row: Math.round(goal.row) };
  const heuristicOpts = { feetPerSquare, diagonalRule };

  if (sameCell(from, to)) {
    return { path: [], costFeet: 0, reachedGoal: true, diagonals: diagonalsSoFar };
  }

  const straightCells = chebyshev(from, to);
  const radiusCells = Number.isFinite(options.radiusCells)
    ? options.radiusCells
    : (Number.isFinite(budgetFeet)
      // A budget is a hard ceiling on reach: nothing beyond it can ever be part
      // of an affordable route, so the box is the budget's own radius.
      ? Math.max(1, Math.ceil(budgetFeet / feetPerSquare))
      // Without one, allow a real detour around a wall without licensing a
      // map-wide wander.
      : straightCells * 2 + 12);

  const blocked = memoizedBlocker(typeof isBlocked === 'function' ? isBlocked : () => false);

  const startParity = diagonalsSoFar % 2;
  const startKey = cellKey(from.col, from.row, startParity);
  const nodes = new Map([[startKey, {
    key: startKey,
    col: from.col,
    row: from.row,
    diagonals: diagonalsSoFar,
    g: 0,
    steps: 0,
    parent: null,
  }]]);

  const open = new NodeHeap();
  const startH = octileFeet(from, to, { ...heuristicOpts, diagonalsSoFar });
  open.push({ key: startKey, g: 0, steps: 0, f: startH });

  const closed = new Set();
  let best = { key: startKey, h: startH, g: 0 };
  let expansions = 0;

  while (open.size) {
    const entry = open.pop();
    // A stale heap entry superseded by a cheaper route to the same state.
    const node = nodes.get(entry.key);
    if (!node || entry.g > node.g || (entry.g === node.g && entry.steps > node.steps)) continue;
    if (closed.has(entry.key)) continue;
    closed.add(entry.key);

    const here = { col: node.col, row: node.row };
    const h = octileFeet(here, to, { ...heuristicOpts, diagonalsSoFar: node.diagonals });
    if (h < best.h || (h === best.h && node.g < best.g)) {
      best = { key: entry.key, h, g: node.g };
    }
    if (sameCell(here, to)) {
      return { ...reconstruct(nodes, entry.key, from), reachedGoal: true };
    }

    expansions += 1;
    if (expansions >= nodeCap) break;

    for (const { dc, dr } of DIRECTIONS) {
      const next = { col: node.col + dc, row: node.row + dr };
      if (chebyshev(from, next) > radiusCells) continue;
      const diagonal = dc !== 0 && dr !== 0;
      const g = node.g + stepFeet(diagonal, node.diagonals, feetPerSquare, diagonalRule);
      if (g > budgetFeet) continue;
      if (blocked(here, next)) continue;

      const diagonals = node.diagonals + (diagonal ? 1 : 0);
      const key = cellKey(next.col, next.row, diagonals % 2);
      const steps = node.steps + 1;
      const known = nodes.get(key);
      if (known && (known.g < g || (known.g === g && known.steps <= steps))) continue;
      // Re-open: the parity-aware heuristic is admissible but not guaranteed
      // consistent, so a closed state that turns out cheaper is re-expanded.
      closed.delete(key);
      nodes.set(key, {
        key, col: next.col, row: next.row, diagonals, g, steps, parent: node.key,
      });
      open.push({
        key,
        g,
        steps,
        f: g + octileFeet(next, to, { ...heuristicOpts, diagonalsSoFar: diagonals }),
      });
    }
  }

  return { ...reconstruct(nodes, best.key, from), reachedGoal: false };
}

function reconstruct(nodes, key, start) {
  const cells = [];
  let node = nodes.get(key);
  const costFeet = node?.g ?? 0;
  const diagonals = node?.diagonals ?? 0;
  while (node && node.parent !== null) {
    cells.push({ col: node.col, row: node.row });
    node = nodes.get(node.parent);
  }
  cells.reverse();
  // The start is never part of the returned route (planTokenPath's shape).
  if (cells.length && sameCell(cells[0], start)) cells.shift();
  return { path: cells, costFeet, diagonals };
}

/**
 * Every cell CONNECTED to `start`, flood-filled over the same injected edge test
 * the search uses, in BFS DISCOVERY ORDER — which is ascending WALKING distance
 * from the start, through the walls rather than across them.
 *
 * That ordering is the whole point. A group move spreading the party around a
 * tapped cell used to enumerate candidates by Chebyshev ring from a straight ray
 * out of the target's centre, and that was wrong twice over: it rejected the
 * cell just around a corner (perfectly reachable, the natural place for the
 * second PC to stand) and it accepted cells that are merely VISIBLE past a
 * wall's end with no route to them at all. Walking distance is the question a
 * spread is actually asking, so BFS is the answer — in a corridor the party
 * strings out along the corridor instead of scattering into geometric rings that
 * sit behind a wall.
 *
 * `dist` is steps from the start (0 = the start itself). Layers are emitted
 * WHOLE: the fill stops on a completed layer once `needed` cells are banked, so
 * a caller choosing "the nearest free candidate" never sees half a layer.
 *
 * @param {{col:number,row:number}} start
 * @param {object} options
 * @param {(from:object,to:object)=>boolean} options.isBlocked
 * @param {number} [options.needed=Infinity]  stop once this many cells are
 *   banked and the layer they are in is complete.
 * @param {number} [options.maxDepth=12]  furthest walking distance to consider.
 * @param {number} [options.maxCells=400]  hard stop for a wide-open scene.
 * @returns {Array<{col:number,row:number,dist:number}>} start included, dist 0.
 */
export function reachableCells(start, {
  isBlocked,
  needed = Infinity,
  maxDepth = 12,
  maxCells = 400,
} = {}) {
  const from = { col: Math.round(start.col), row: Math.round(start.row) };
  const blocked = memoizedBlocker(typeof isBlocked === 'function' ? isBlocked : () => false);

  const out = [{ col: from.col, row: from.row, dist: 0 }];
  const seen = new Set([`${from.col},${from.row}`]);
  let depth = 0;

  for (let head = 0; head < out.length; head += 1) {
    const here = out[head];
    if (here.dist !== depth) {
      // Dequeuing the first cell of a new layer means every shallower layer is
      // complete — the moment to decide whether the fill has done enough.
      if (out.length >= needed) break;
      depth = here.dist;
    }
    if (here.dist >= maxDepth || out.length >= maxCells) continue;
    for (const { dc, dr } of DIRECTIONS) {
      const next = { col: here.col + dc, row: here.row + dr };
      const key = `${next.col},${next.row}`;
      if (seen.has(key)) continue;
      if (blocked(here, next)) continue;
      seen.add(key);
      out.push({ col: next.col, row: next.row, dist: here.dist + 1 });
    }
  }
  return out;
}
