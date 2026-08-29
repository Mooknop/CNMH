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
//       reached   — the mover ended in the cell the ring assignment gave it.
//                   false = it walked the reachable prefix and stopped short
//                   (out of budget, or a wall clipped the route). `dest` and
//                   `feetMoved` are honest either way — that one rule IS "as
//                   close as they can".
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
  getGridSize, getSpeed, gridToPixels, hasWallCollision, planTokenPath,
  measureTokenPathCost,
} from './pf2eAdapter.js';
import { MOVER_RADIUS_FALLBACK_FEET, MOVER_RADIUS_SPEED_FACTOR } from './snapshots.js';
import { GLOBAL_ID, RELAY } from './syncKeys.js';

// How far out the spread search looks before giving up. 8 rings is a 17×17 cell
// window — vastly more than a party needs on open ground, and a hard stop when
// walls have sealed the target off (the alternative is an unbounded scan).
const MAX_RING = 8;

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

// The cells at Chebyshev distance `ring` from (col,row), in col-then-row order
// so the candidate list is deterministic before any distance sort touches it.
// Ring 0 is the target cell itself.
function ringCells(col, row, ring) {
  if (ring === 0) return [{ col, row, ring: 0 }];
  const cells = [];
  for (let dc = -ring; dc <= ring; dc += 1) {
    for (let dr = -ring; dr <= ring; dr += 1) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
      cells.push({ col: col + dc, row: row + dr, ring });
    }
  }
  return cells;
}

// Expanding rings of WALKABLE candidate cells around the target. "Walkable" is
// the target's own point of view: a cell whose centre a wall test rejects from
// the target's centre is inside or behind a wall, so nobody is sent there. The
// target cell itself is ring 0 and is walkable by definition (the GM tapped it).
// Stops as soon as a ring completes with at least `needed` candidates banked —
// whole rings, never a partial one, so the per-mover pick below always chooses
// from a complete ring.
function walkableCandidates(target, needed, gridSize) {
  const origin = cellCentre(target.col, target.row, gridSize);
  const out = [];
  for (let ring = 0; ring <= MAX_RING && out.length < needed; ring += 1) {
    for (const cell of ringCells(target.col, target.row, ring)) {
      if (ring > 0) {
        const c = cellCentre(cell.col, cell.row, gridSize);
        if (hasWallCollision(origin.x, origin.y, c.x, c.y)) continue;
      }
      out.push(cell);
    }
  }
  return out;
}

const cellKey = (c) => `${c.col},${c.row}`;

// Spread assignment. Movers are served CLOSEST-PC-FIRST by straight-line
// distance to the target (tie-broken by moverId, so a tie is stable and
// reproducible), and each in turn takes a free cell from the LOWEST ring that
// still has one — within that ring, the cell nearest to that mover, tie-broken
// col-then-row. Nobody shares a destination.
//
// Serving the nearest PC first is what makes the formation read right: the PC
// already standing next to the target gets the target cell, and the stragglers
// fan outward instead of the ordering being an accident of the request array.
export function assignDestinations(movers, target, gridSize = getGridSize()) {
  const targetCentre = cellCentre(target.col, target.row, gridSize);
  const candidates = walkableCandidates(target, movers.length, gridSize);

  const order = [...movers].sort((a, b) => {
    const d = sqDist(a.centre, targetCentre) - sqDist(b.centre, targetCentre);
    if (d !== 0) return d;
    return a.moverId < b.moverId ? -1 : (a.moverId > b.moverId ? 1 : 0);
  });

  const taken = new Set();
  const assigned = new Map();
  for (const mover of order) {
    const free = candidates.filter((c) => !taken.has(cellKey(c)));
    if (!free.length) continue;
    const lowestRing = Math.min(...free.map((c) => c.ring));
    const pool = free
      .filter((c) => c.ring === lowestRing)
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

// One mover's whole trip: plan the route to its assigned cell with the same core
// path machinery the single tap-flow uses, clip it to the mover's budget, walk
// what is left, and report the truth about where it ended up.
async function moveOne(token, cell, budgetOverride) {
  const geo = cellGeometry(token);
  const startCentre = tokenStartCenter(token, geo);
  const { path } = await planTokenPath(
    token,
    [geo.toCenter({ col: cell.col, row: cell.row })],
    { origin: startCentre },
  );
  const walk = await affordablePrefix(
    token, path, startCentre, budgetFeetFor(token, budgetOverride),
  );
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
    // No cell at all = MAX_RING of walled-off pocket around the target. Nothing
    // to walk toward, so this reads as a failure, not a zero-foot success.
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
