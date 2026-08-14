// Path preview push (#1736 S3): mirror the v14 movement pipeline's plan and
// move phases onto the relay so the app can draw a route ghost for movements it
// did NOT initiate — a GM drag-planning a foe in Foundry, an enemy turn driven
// natively, or another player's stride. The app already gets its OWN route from
// the `moveplanned` reply (#1736 S1); this is the other direction.
//
// Protocol (protocol 16 — #1744 WS-1):
//   bridge → app: cnmh_pathpreview_global   = PUBLIC, filtered
//   bridge → app: cnmh_pathpreviewgm_global = GM, unfiltered
//     { tokenId, id, name, disposition, sceneId,
//       origin: { col, row }, path: [{ col, row }, …],
//       phase: 'plan' | 'move', source: 'app' | 'foundry', ts }
//
// TWO CHANNELS, one payload shape (epic #1744, OQ-2 ruling). As shipped in
// #1736 S3 this channel had NO visibility filtering at all: a GM dragging a
// hidden ambusher into position broadcast its origin and route to every player
// device — while still deliberating, because the plan phase fires during the
// drag. The relay has no per-key ACL and inventing one is its own epic, so the
// separation is made at the SOURCE:
//
//   * `pathpreview`   — only movers a player may legitimately watch: NOT hidden
//     (`document.hidden` falsy) AND friendly (`disposition > 0`). Everything
//     else — hostile, neutral, SECRET(-2), or any hidden token — is simply not
//     written to this channel.
//   * `pathpreviewgm` — everything, unfiltered, exactly what the old single
//     channel carried. Player devices still RECEIVE it (the relay broadcasts
//     every key to every peer); the app render-gates it to GM surfaces. That is
//     the accepted trade-off for a home table — wire-level audience separation
//     in the session DO is explicitly out of scope for this arc.
//
// GLOBAL channel (like `positions`, not per-character): one consumer draws every
// mover's ghost, and a preview can legitimately fire for a token the app has no
// mover id for at all — `id` is null there, `tokenId` always identifies the
// token. `path` runs from `origin` EXCLUSIVE to the destination INCLUSIVE, in
// grid cells.
//
// SCENE IDENTITY (#1744 WS-1). `moveToken` fires for EVERY TokenDocument in the
// world, including tokens on scenes nobody is looking at. The payload now names
// the token's own `sceneId` (like `snapdone` / `pingpoint` / `templateplace`),
// and — the correctness half — cells are converted against THAT scene's grid
// rather than `canvas.scene`'s, so a move on a differently-gridded scene no
// longer resolves to silently wrong cells.
//
// IDENTITY FIELDS (#1744 OQ-7). `name` + `disposition` ride along: a ghost with
// no mover `id` (an unmapped NPC) is otherwise unlabelable, and `disposition` is
// the field the filter above reads anyway — so the consumer can colour by side
// without a join against the encounter order.
//
// Echo policy: unlike the other hook listeners this does NOT suppress the
// bridge's own writes. An app-driven move is worth previewing too — the other
// players at the table want to watch it happen — so bridge moves emit with
// `source: 'app'` instead of being dropped.

import {
  MOVEMENT_HOOKS,
  getSceneGridSize,
  getTokenDisposition,
  getTokenIdentity,
  getTokenName,
  getTokenScene,
  isTokenHidden,
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

// The last payload put on the wire, whichever channel(s) carried it — the
// payload object is shared, only the audience differs.
export function getLatestPathPreview() {
  return _latest;
}

// Whether a mover may be shown to players: visible AND friendly, nothing else.
// `hidden` deliberately does NOT ride the payload — the public channel simply
// never mentions such a token, and the GM channel's consumer has the actual
// canvas. Exported so the rule is stated exactly once.
// Foundry CONST.TOKEN_DISPOSITIONS: FRIENDLY 1, NEUTRAL 0, HOSTILE -1, SECRET -2.
export function isPubliclyVisible({ hidden, disposition }) {
  return !hidden && Number(disposition) > 0;
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

  // The TOKEN's OWN scene's grid, not the active canvas's (#1744 WS-1): the
  // move hooks fire world-wide and a differently-gridded scene would otherwise
  // convert to silently wrong cells.
  const scene = getTokenScene(document);
  const gridSize = getSceneGridSize(scene);
  if (!gridSize) return null;

  const origin = data.origin ? pixelsToGrid(data.origin.x, data.origin.y, gridSize) : null;

  // Cells from origin (exclusive) to destination (inclusive). Foundry's waypoint
  // list starts AT the origin and can repeat a cell — across the passed/pending
  // seam, and wherever a movement records sub-cell intermediate waypoints — so
  // drop the origin and collapse consecutive duplicates.
  const path = [];
  let previous = origin;
  for (const point of data.points) {
    const cell = pixelsToGrid(point.x, point.y, gridSize);
    if (previous && cell.col === previous.col && cell.row === previous.row) continue;
    path.push(cell);
    previous = cell;
  }
  if (!path.length) return null;

  const { tokenId } = getTokenIdentity(document);
  const disposition = getTokenDisposition(document);
  const payload = {
    tokenId,
    id: resolveMoverId(document),
    name: getTokenName(document),
    disposition,
    sceneId: String(scene?.id ?? ''),
    origin,
    path,
    phase,
    source: readMovementSource(movement, operation),
    ts: Date.now(),
  };
  // Decided ONCE here, off the live document, and carried with the payload — a
  // plan queued on the trailing edge must not be re-classified against a token
  // whose GM toggled its visibility in the meantime.
  const audience = {
    gm: true,
    players: isPubliclyVisible({ hidden: isTokenHidden(document), disposition }),
  };

  // 'move' fires once per movement — send it straight through, and drop any
  // plan still waiting for this token: the plan it described just became real.
  if (phase !== 'plan') {
    clearThrottle(throttleKey(tokenId));
    return send(payload, audience);
  }
  return throttlePlan(throttleKey(tokenId), payload, audience);
}

// Tokens throttle independently; an id-less token shares one window (it can only
// ever be one anonymous document per hook fire in practice).
const throttleKey = (tokenId) => tokenId ?? '';

function throttlePlan(key, payload, audience) {
  if (_timers.has(key)) {
    _pending.set(key, { payload, audience });
    return payload;
  }

  send(payload, audience);
  _timers.set(key, setTimeout(() => {
    _timers.delete(key);
    const trailing = _pending.get(key);
    if (!trailing) return;
    _pending.delete(key);
    // Re-enter rather than send directly: the trailing edge opens the next
    // window, so a drag that is still going stays throttled.
    throttlePlan(key, trailing.payload, trailing.audience);
  }, PLAN_THROTTLE_MS));

  return payload;
}

function clearThrottle(key) {
  const timer = _timers.get(key);
  if (timer) clearTimeout(timer);
  _timers.delete(key);
  _pending.delete(key);
}

// The GM channel always carries the emission; the public one only when the
// mover passes the filter. Both get the SAME object — one shape, two audiences.
function send(payload, audience) {
  _latest = payload;
  if (audience?.gm) _sendUpdate?.(GLOBAL_ID, RELAY.PATHPREVIEWGM, payload);
  if (audience?.players) _sendUpdate?.(GLOBAL_ID, RELAY.PATHPREVIEW, payload);
  return payload;
}
