import { RELAY, globalKey, GROUP_MOVE_PROTOCOL } from '../sync/keys';

// Exploration GROUP move relay contract (#1823/#1825, epic #1822) — the
// app-side twin of foundry-bridge/groupMove.js's header. Read that file
// first; this module only builds the outbound payload and carries the
// floors/timeouts the app's own consumers need.
//
//   app → bridge  cnmh_groupmovereq_global  = { id, moverIds[], target, ts }
//   bridge → app  cnmh_groupmovedone_global = { id, results[], ts }
//     results[]  { moverId, ok, dest, feetMoved, reached }
//
// `target`/`dest` are the movement rail's own `{ col, row }` cell shape (dest
// additionally carries `x`/`y`, like movedone.newPosition) — NOT the epic's
// original `{x,y}` sketch; see the bridge module's COORDINATES note for why.
//
// `id` is unique per request (buildGroupMoveRequest below), so ack
// correlation is exact and a persisted groupmovedone hydrated on mount can
// never satisfy a fresh dispatch — same convention as rollreq/snapreq.
export const GROUPMOVEREQ_KEY = globalKey(RELAY.GROUPMOVEREQ);
export const GROUPMOVEDONE_KEY = globalKey(RELAY.GROUPMOVEDONE);

export { GROUP_MOVE_PROTOCOL };

// A group move is N single moves' worth of pathing plus ring assignment,
// executed concurrently but still bounded by the slowest member's route —
// generously longer than a single MOVE_SNAP_TIMEOUT_MS-class round trip
// (snapshotRelay.js) so a legitimately large party doesn't get cut off mid-
// settle, while still being well short of "the GM thinks the table is stuck."
export const GROUP_MOVE_TIMEOUT_MS = 15_000;

let counter = 0;

// `moverIds` is the selection verbatim (PC charIds); `target` is the tapped
// cell in `{ col, row }` form — the caller (DockExplorationPane) derives it
// with the same worldPointFromTap/cellFromWorldPoint pair the single-move
// flow already uses.
export const buildGroupMoveRequest = ({ moverIds, target }) => ({
  id: `grp-${Date.now()}-${(counter += 1)}`,
  moverIds: [...(moverIds || [])],
  target,
  ts: Date.now(),
});

// One result's outcome bucket, per the epic's ruling: `ok:false` is the only
// "failed" case (the mover never moved at all — see the bridge module's
// header); everything else that didn't land on its assigned ring cell is
// "partial" (it walked the reachable prefix, `feetMoved`/`dest` still
// honest); landing exactly where the ring assignment sent it is "reached".
export const GROUP_MOVE_OUTCOME = Object.freeze({
  REACHED: 'reached',
  PARTIAL: 'partial',
  FAILED: 'failed',
});

export function groupMoveOutcomeFor(result) {
  if (!result || result.ok === false) return GROUP_MOVE_OUTCOME.FAILED;
  return result.reached ? GROUP_MOVE_OUTCOME.REACHED : GROUP_MOVE_OUTCOME.PARTIAL;
}

// The group's party-semantic beat distance (epic ruling, #1825): the group
// advanced together, one beat, one number — the MAX feetMoved across every
// mover in the result set, not the sum. Used for the dock's own local
// `feetTotal` display (and by tests/fixtures); the shared exploredist tally's
// accrual is the per-character ledger in utils/exploreDistance.js instead
// (unify-exploredist), which this no longer defines.
export function maxFeetMoved(results) {
  return (results || []).reduce((max, r) => Math.max(max, Number(r?.feetMoved) || 0), 0);
}
