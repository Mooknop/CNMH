// Path preview push (#1736 S3): mirror the v14 movement pipeline's plan and
// move phases onto the relay so the app can draw a route ghost for movements it
// did NOT initiate — a GM drag-planning a foe in Foundry, an enemy turn driven
// natively, or another player's stride. The app already gets its OWN route from
// the `moveplanned` reply (#1736 S1); this is the other direction.
//
// Protocol:
//   bridge → app: cnmh_pathpreview_global =
//     { tokenId, id, origin: { col, row }, path: [{ col, row }, …],
//       phase: 'plan' | 'move', source: 'app' | 'foundry', ts }
//
// GLOBAL channel (like `positions`, not per-character): one consumer draws every
// mover's ghost, and a preview can legitimately fire for a token the app has no
// mover id for at all — `id` is null there, `tokenId` always identifies the
// token. `path` runs from `origin` EXCLUSIVE to the destination INCLUSIVE, in
// grid cells.
//
// The app consumer is deliberately not built yet (a later slice owns it); an
// absent consumer is free, which is why this ships as a pure additive channel.
//
// Echo policy: unlike the other hook listeners this does NOT suppress the
// bridge's own writes. An app-driven move is worth previewing too — the other
// players at the table want to watch it happen — so bridge moves emit with
// `source: 'app'` instead of being dropped.

import {
  MOVEMENT_HOOKS,
  getGridSize,
  getTokenIdentity,
  onHook,
  pixelsToGrid,
  readMovementSource,
  readTokenMovement,
} from './pf2eAdapter.js';
import { resolveMoverId } from './movement.js';
import { GLOBAL_ID, RELAY } from './syncKeys.js';

// Plan-phase hooks fire as the planned path changes — once per pointer move
// while a GM drags a token, which is per animation frame. One emission per
// token per window, with a trailing edge so the LAST path of a drag (the one
// the GM actually stopped on) always reaches the app.
export const PLAN_THROTTLE_MS = 150;

let _sendUpdate = null;
let _latest = null;
const _timers  = new Map(); // throttle key → timeout handle (window is open)
const _pending = new Map(); // throttle key → payload waiting on the trailing edge

export function getLatestPathPreview() {
  return _latest;
}

// Test seam: drop every open throttle window (a suite that leaves one armed
// would leak a timer into the next test).
export function _resetPathPreview() {
  for (const timer of _timers.values()) clearTimeout(timer);
  _timers.clear();
  _pending.clear();
  _latest = null;
}

export function initPathPreview(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;
  _resetPathPreview();

  // See MOVEMENT_HOOKS in pf2eAdapter.js for why these two names and not the
  // epic sketch's `preMoveToken`. Registration is defensive on purpose: a build
  // that renamed or dropped a hook just never fires it, and must not take the
  // whole module's init down on the way past.
  registerHook(MOVEMENT_HOOKS.PLAN, (document) =>
    emitPathPreview(document, null, null, 'plan'));
  registerHook(MOVEMENT_HOOKS.MOVE, (document, movement, operation) =>
    emitPathPreview(document, movement, operation, 'move'));
}

function registerHook(name, fn) {
  if (!name) return;
  try {
    onHook(name, fn);
  } catch {
    // No hook registry (or a build that rejects the name): no preview, no crash.
  }
}

// Build and route one preview emission. Exported so the contract test and the
// unit suite can drive it the way a hook would. Returns the payload it sent, or
// null when there was nothing to say (deferred plan emissions also return the
// payload — the send happens on the trailing edge).
export function emitPathPreview(document, movement, operation, phase) {
  if (!_sendUpdate) return null;

  const data = readTokenMovement(document, movement);
  if (!data?.points?.length) return null;

  const gridSize = getGridSize();
  if (!gridSize) return null;

  const origin = data.origin ? pixelsToGrid(data.origin.x, data.origin.y) : null;

  // Cells from origin (exclusive) to destination (inclusive). Foundry's waypoint
  // list starts AT the origin and can repeat a cell — across the passed/pending
  // seam, and wherever a movement records sub-cell intermediate waypoints — so
  // drop the origin and collapse consecutive duplicates.
  const path = [];
  let previous = origin;
  for (const point of data.points) {
    const cell = pixelsToGrid(point.x, point.y);
    if (previous && cell.col === previous.col && cell.row === previous.row) continue;
    path.push(cell);
    previous = cell;
  }
  if (!path.length) return null;

  const { tokenId } = getTokenIdentity(document);
  const payload = {
    tokenId,
    id: resolveMoverId(document),
    origin,
    path,
    phase,
    source: readMovementSource(movement, operation),
    ts: Date.now(),
  };

  // 'move' fires once per movement — send it straight through, and drop any
  // plan still waiting for this token: the plan it described just became real.
  if (phase !== 'plan') {
    clearThrottle(throttleKey(tokenId));
    return send(payload);
  }
  return throttlePlan(throttleKey(tokenId), payload);
}

// Tokens throttle independently; an id-less token shares one window (it can only
// ever be one anonymous document per hook fire in practice).
const throttleKey = (tokenId) => tokenId ?? '';

function throttlePlan(key, payload) {
  if (_timers.has(key)) {
    _pending.set(key, payload);
    return payload;
  }

  send(payload);
  _timers.set(key, setTimeout(() => {
    _timers.delete(key);
    const trailing = _pending.get(key);
    if (!trailing) return;
    _pending.delete(key);
    // Re-enter rather than send directly: the trailing edge opens the next
    // window, so a drag that is still going stays throttled.
    throttlePlan(key, trailing);
  }, PLAN_THROTTLE_MS));

  return payload;
}

function clearThrottle(key) {
  const timer = _timers.get(key);
  if (timer) clearTimeout(timer);
  _timers.delete(key);
  _pending.delete(key);
}

function send(payload) {
  _latest = payload;
  _sendUpdate?.(GLOBAL_ID, RELAY.PATHPREVIEW, payload);
  return payload;
}
