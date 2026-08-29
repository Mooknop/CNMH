// Exploration GROUP move (#1823, epic #1822) — one request moves N selected PCs
// to spread destinations ringing a tapped cell, in one round trip, with one
// recapture at the end.
//
// Protocol (protocol ≥ GROUP_MOVE_PROTOCOL):
//   App → bridge:  cnmh_groupmovereq_global  = { id, moverIds[], target, ts,
//                                                budgetFeet? }
//     target      — the tapped GRID CELL, the same space every other movement
//                   key speaks. Canonically `{ col, row }`; `{ x, y }` is
//                   accepted as a col/row alias (the epic sketched the wire
//                   that way) — see the coordinate note below.
//     moverIds    — resolve through movement.js's resolveToken, i.e. the SAME
//                   three id spaces as every movement key (PC charId, minion
//                   `<owner>-<role>`, combat entryId). v1 selection is PCs.
//     budgetFeet  — optional per-request override of the Speed-derived reach.
//   Bridge → app:  cnmh_groupmovedone_global = { id, results[], ts }
//     results[]   — { moverId, ok, dest, feetMoved, reached }, one per requested
//                   moverId, in request order.
//       ok        — false ONLY for a mover that never moved at all: an id that
//                   resolves to no token, a per-token error, or (a walled-in
//                   pocket) no assignable destination. dest null, feetMoved 0.
//       dest      — the REAL landing cell `{ col, row, x, y }` — the same shape
//                   `movedone.newPosition` uses (`x`,`y` = the cell's top-left
//                   pixels).
//       reached   — the mover ended in the cell the spread assignment gave it.
//                   false = it walked the reachable prefix and stopped short
//                   (out of budget, or the route could not reach even going
//                   around). `dest` and `feetMoved` are honest either way —
//                   that one rule IS "as close as they can".
//
// ORDERING (#1832). Candidates are enumerated by WALKING distance from the
// target — one flood fill through the walls — not by Chebyshev ring off a
// straight ray from the target's centre, which is what shipped first. The ray
// was wrong in both directions: it rejected the cell just around a corner
// (perfectly reachable, the natural place for the second PC to stand) and it
// accepted a cell merely VISIBLE past a wall's end with no route to it at all.
// The consequence at the table is the whole point: tap into a corridor and the
// party strings out ALONG the corridor, closest-to-the-goal first, instead of
// scattering into geometric rings that sit behind a wall. Distinct destinations
// and the closest-mover-first serving order are unchanged; a pocket smaller
// than the party hands the overflow movers the target cell itself to path at
// (see assignDestinations).
//   Live-only and id-correlated, like snapreq/snapdone: a late bridge simply
//   misses a request, and the app's timeout is the fallback.
//
// COORDINATES. The issue sketched both `target` and `dest` as `{x,y}`. This
// rail canonicalizes on the movement rail's existing cell shape instead —
// `{ col, row }` in, `{ col, row, x, y }` out — because `dest.x` meaning a
// column on one field and a pixel on another is a trap, and `movedone` already
// established the out shape. `{ x, y }` on the INPUT target is read as
// `{ col, row }` so an app sending the sketched shape still works.
//
// GATING. None, bridge-side: the app owns the exploremove/playmode gate and the
// bridge executes what it is told. Occupancy is unconditionally ignored (#617
// semantics) — this is an exploration rail, creatures never block, only
// walls/doors do.
//
// CAPTURE SUPPRESSION, by composition. movement.js's movedone seam
// (setMoveDoneListener → snapshots.pushMoverSnapshot) belongs to the single-move
// ACK WRAPPER, not to movement execution. This module composes the execution
// primitive (movement.js's walkTokenPath) and never the wrapper, so a group move
// structurally cannot fire a per-member capture — the single-move path is not
// touched at all. The ONE capture a settled group does want is a separate seam
// (setGroupSettledListener), wired to snapshots.pushPartySnapshot in bridge.js,
// keeping this module and the snapshot rail as independent as movement.js and
// snapshots.js already are.
//
// All canvas/geometry calls go through pf2eAdapter.js.

import {
  cellGeometry, resolveToken, tokenStartCenter, walkTokenPath,
} from './movement.js';
import {
  getGridSize, getSpeed, gridToPixels, measureTokenPathCost,
} from './pf2eAdapter.js';
import { connectedCells, planRoutedPath } from './pathRoute.js';
import { MOVER_RADIUS_FALLBACK_FEET, MOVER_RADIUS_SPEED_FACTOR } from './snapshots.js';
import { GLOBAL_ID, RELAY } from './syncKeys.js';

// How far out the spread's flood fill looks before giving up. 12 steps of
// WALKING distance is vastly more than a party needs on open ground and enough
// to string a party down a corridor; the cell cap is the hard stop for a wide
// open scene (the alternative is an unbounded scan). Both bound a fill that
// normally terminates in one or two layers.
const MAX_SPREAD_DEPTH = 12;
const MAX_SPREAD_CELLS = 400;

let _sendUpdate = null;
let _onGroupSettled = null;

export function initGroupMove(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;
}

// Group-settled seam — the group-move twin of movement.js's move-done listener.
// Fires ONCE, after every mover has settled and the ack is on the wire, with
// the request id. bridge.js fills it with the snapshot rail's party capture;
// this module stays unaware of snapshots.js (beyond the two reach constants).
// Failures are swallowed: a broken listener must not break movement.
export function setGroupSettledListener(fn) {
  _onGroupSettled = typeof fn === 'function' ? fn : null;
}

function notifyGroupSettled(id) {
  if (!_onGroupSettled) return;
  try {
    Promise.resolve(_onGroupSettled(id)).catch((err) =>
      console.error('CNMH Bridge | group-settled listener failed:', err));
  } catch (err) {
    console.error('CNMH Bridge | group-settled listener failed:', err);
  }
}

// --- geometry ----------------------------------------------------------------

// A cell's CENTRE, size-agnostic (grid centre, not a token's footprint centre).
// This is the point the ring's walkability test rays run between: candidate
// selection is about the CELLS, not about who is being sent to them.
function cellCentre(col, row, gridSize) {
  const { x, y } = gridToPixels(col, row);
  return { x: x + gridSize / 2, y: y + gridSize / 2 };
}

const sqDist = (a, b) => ((a.x - b.x) ** 2) + ((a.y - b.y) ** 2);

// Candidate destination cells around the target, in ascending WALKING distance
// from it (#1832). See the ORDERING note in the header — this replaced an
// expanding-Chebyshev-ring scan whose walkability test was a straight ray from
// the target's centre.
function walkableCandidates(target, needed) {
  return connectedCells(target, {
    needed,
    maxDepth: MAX_SPREAD_DEPTH,
    maxCells: MAX_SPREAD_CELLS,
  });
}

const cellKey = (c) => `${c.col},${c.row}`;

// Spread assignment. Movers are served CLOSEST-PC-FIRST by straight-line
// distance to the target (tie-broken by moverId, so a tie is stable and
// reproducible), and each in turn takes a free cell from the NEAREST WALKING
// DISTANCE that still has one — within that distance, the cell nearest to that
// mover, tie-broken col-then-row. Nobody shares a destination.
//
// Serving the nearest PC first is what makes the formation read right: the PC
// already standing next to the target gets the target cell, and the stragglers
// fan outward instead of the ordering being an accident of the request array.
//
// OVERFLOW. A pocket smaller than the party (a closet, a dead-end alcove) runs
// out of candidates. Those movers are given the TARGET CELL as their pathing
// goal rather than being refused: `moveOne`'s best-partial walk takes them as
// close as they can get and reports honestly, which is exactly the "as close as
// they can" rule the rest of this rail follows. They are flagged `overflow` so
// a caller can tell an assignment from a fallback.
export function assignDestinations(movers, target, gridSize = getGridSize()) {
  const targetCentre = cellCentre(target.col, target.row, gridSize);
  const candidates = walkableCandidates(target, movers.length);

  const order = [...movers].sort((a, b) => {
    const d = sqDist(a.centre, targetCentre) - sqDist(b.centre, targetCentre);
    if (d !== 0) return d;
    return a.moverId < b.moverId ? -1 : (a.moverId > b.moverId ? 1 : 0);
  });

  const taken = new Set();
  const assigned = new Map();
  for (const mover of order) {
    const free = candidates.filter((c) => !taken.has(cellKey(c)));
    if (!free.length) {
      assigned.set(mover.moverId, { col: target.col, row: target.row, dist: 0, overflow: true });
      continue;
    }
    const nearest = Math.min(...free.map((c) => c.dist));
    const pool = free
      .filter((c) => c.dist === nearest)
      .sort((a, b) => {
        const d = sqDist(mover.centre, cellCentre(a.col, a.row, gridSize))
          - sqDist(mover.centre, cellCentre(b.col, b.row, gridSize));
        if (d !== 0) return d;
        return (a.col - b.col) || (a.row - b.row);
      });
    taken.add(cellKey(pool[0]));
    assigned.set(mover.moverId, pool[0]);
  }
  return assigned;
}

// --- budget ------------------------------------------------------------------

// A mover's reach for one group move: 1.5× its own Speed — MOVER_RADIUS_SPEED_
// FACTOR, the very multiplier the single-move flow already uses for a mover's
// default capture radius, i.e. the reach of the map that flow lets a player tap
// on. Falling back to MOVER_RADIUS_FALLBACK_FEET when the actor reports no
// Speed keeps the two rails congruent: a group tap can reach anywhere the
// single flow would have let that PC tap, and no further.
export function budgetFeetFor(token, override) {
  const requested = Number(override);
  if (requested > 0) return requested;
  const speed = Number(getSpeed(token.actor));
  return speed > 0 ? speed * MOVER_RADIUS_SPEED_FACTOR : MOVER_RADIUS_FALLBACK_FEET;
}

// The longest prefix of `path` this mover can actually afford. Cost is
// monotonic along a route, so the first leg that busts the budget ends it. An
// over-budget route therefore becomes a walk PART OF THE WAY toward the
// assigned cell rather than a refusal — the same honest stop-short movedone
// already reports for a wall-clipped single move.
//
// (Path granularity is core's: v14's findMovementPath hands back the per-step
// route, so the prefix is cell-grained. On the degraded pre-v14 backend
// planTokenPath returns only the requested waypoint, so an over-budget move
// yields an empty prefix — no move, honestly reported, rather than a
// fabricated intermediate cell.)
async function affordablePrefix(token, path, startCentre, budget) {
  if (!path.length) return path;
  for (let i = 1; i <= path.length; i += 1) {
    const cost = await measureTokenPathCost(token, path.slice(0, i), { origin: startCentre });
    if (cost > budget) return path.slice(0, i - 1);
  }
  return path;
}

// --- execution ---------------------------------------------------------------

// One mover's whole trip: plan the route to its assigned cell with the same
// shared planner the single tap-flow uses — which from #1832 pathfinds around a
// wall rather than stopping at it — clip it to the mover's budget, walk what is
// left, and report the truth about where it ended up.
//
// The budget rides INTO the planner as well as clipping the result: a search
// that knows the mover's reach never proposes a detour it cannot afford, and
// affordablePrefix stays the authoritative (terrain-aware) clip on top.
async function moveOne(token, cell, budgetOverride) {
  const geo = cellGeometry(token);
  const startCentre = tokenStartCenter(token, geo);
  const budgetFeet = budgetFeetFor(token, budgetOverride);
  const { path } = await planRoutedPath(
    token,
    [geo.toCenter({ col: cell.col, row: cell.row })],
    { origin: startCentre, budgetFeet },
  );
  const walk = await affordablePrefix(token, path, startCentre, budgetFeet);
  const { landing, feetMoved } = await walkTokenPath(token, walk, { origin: startCentre });
  return {
    dest: landing,
    feetMoved,
    reached: landing.col === cell.col && landing.row === cell.row,
  };
}

const failed = (moverId) => ({ moverId, ok: false, dest: null, feetMoved: 0, reached: false });

// Read the tapped cell off the wire. `{ col, row }` is canonical; `{ x, y }` is
// the accepted alias (see the coordinate note in the header).
function targetCell(target) {
  const col = Number(target?.col ?? target?.x);
  const row = Number(target?.row ?? target?.y);
  if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
  return { col: Math.round(col), row: Math.round(row) };
}

// Called by bridge.js when cnmh_groupmovereq_global arrives.
//
// Every mover moves CONCURRENTLY (Promise.all) with per-token error isolation:
// one token throwing yields its own ok:false row and never blocks, delays, or
// aborts the rest. The ack always fires for a request carrying an id — an
// unresolvable roster, an empty selection and a nonsense target all answer with
// results rather than silence, because the app is holding an awaiting-done
// state open until this lands.
export async function handleGroupMoveRequest(value) {
  const id = value?.id;
  if (!id) return;

  const moverIds = (Array.isArray(value?.moverIds) ? value.moverIds : [])
    .map((m) => String(m))
    .filter(Boolean);
  const ack = (results) => {
    _sendUpdate?.(GLOBAL_ID, RELAY.GROUPMOVEDONE, { id, results, ts: Date.now() });
    notifyGroupSettled(id);
  };

  const target = targetCell(value?.target);
  if (!target || !moverIds.length) {
    ack(moverIds.map(failed));
    return;
  }

  const gridSize = getGridSize();
  const resolved = [];
  const unresolved = new Set();
  for (const moverId of moverIds) {
    let token = null;
    try {
      token = resolveToken(moverId);
    } catch (err) {
      console.error(`CNMH Bridge | group move: resolving ${moverId} failed:`, err);
    }
    if (!token) { unresolved.add(moverId); continue; }
    resolved.push({ moverId, token, centre: tokenStartCenter(token) });
  }

  const assigned = assignDestinations(resolved, target, gridSize);

  // Concurrent, isolated. Each entry settles to its own row; a rejection is
  // caught here so Promise.all can never short-circuit the group.
  const outcomes = await Promise.all(resolved.map(async ({ moverId, token }) => {
    const cell = assigned.get(moverId);
    // Belt and braces: the target cell is always candidate zero (the GM tapped
    // it) and overflow movers are handed it explicitly, so an unassigned mover
    // is not reachable from here — but a missing cell has nothing to walk
    // toward, and that reads as a failure rather than a zero-foot success.
    if (!cell) return failed(moverId);
    try {
      return { moverId, ok: true, ...(await moveOne(token, cell, value?.budgetFeet)) };
    } catch (err) {
      console.error(`CNMH Bridge | group move: ${moverId} failed:`, err);
      return failed(moverId);
    }
  }));

  // Answer in REQUEST order, not completion order, so the app can zip results
  // against the selection it sent.
  const byId = new Map(outcomes.map((o) => [o.moverId, o]));
  ack(moverIds.map((moverId) =>
    (unresolved.has(moverId) ? failed(moverId) : byId.get(moverId) ?? failed(moverId))));
}
