// Feature: Door detection and interaction for Exploration mode.
//
// Protocol (per-character — the player's adjacency-gated feed):
//   App → bridge:  cnmh_doorreq_<charId>      = { ts }
//   Bridge → app:  cnmh_dooropts_<charId>     = { doors:[{ wallId, state, x, y }], reqTs }
//   App → bridge:  cnmh_doorinteract_<charId> = { wallId, op:'open'|'close', ts }
//
// Protocol (scene-scoped — the GM dock's door overlay, protocol ≥ 20 / #1805):
//   App → bridge:  cnmh_doorreq_global        = { ts }
//   Bridge → app:  cnmh_dooropts_global       = { doors:[{ wallId, state, x, y, secret? }],
//                                                 sceneId, reqTs }
//   App → bridge:  cnmh_doorinteract_global   = { wallId, op, ts }
//
// The two feeds differ deliberately:
//   * per-character — adjacency-gated, and SECRET doors (door type 2) are
//     hidden unless already open. Players must not learn where the secret
//     doors are from the wire.
//   * global — every door on the rendered scene, no adjacency gate, and secret
//     doors ARE included with `secret: true` so the GM's map can draw them with
//     a distinct glyph. Wire-privacy caveat (the relay fans out to all clients)
//     accepted by user ruling on #1805.
//
// Auto-off: when any door's ds changes to open (1) via Foundry's updateWall
// hook, cnmh_exploremove_global is set false regardless of who opened it —
// except for the bridge's own app-driven writes (BRIDGE_SOURCE_FLAG). That
// skip is scoped to the auto-off latch ONLY: the scene feed re-push below fires
// for every ds change including app-initiated ones, so the dock overlay tracks
// doors toggled from the app, from Foundry, or by another player.
//
// Adjacency: a door is "nearby" if its midpoint or either endpoint is within
// ADJACENCY_SQUARES grid squares of the PC token's centre cell.

import { resolveToken } from './movement.js';
import {
  getSceneWalls,
  getWallById,
  getWallId,
  isDoor,
  getDoorType,
  getDoorState,
  getWallCoords,
  setDoorState,
  getGridSize,
  getSceneId,
  onHook,
} from './pf2eAdapter.js';
import { BRIDGE_SOURCE_FLAG } from './utils.js';
import { GLOBAL_ID, RELAY } from './syncKeys.js';

const ADJACENCY_SQUARES = 1.5;

// CONST.WALL_DOOR_TYPES / WALL_DOOR_STATES, inlined so doors.js stays free of
// Foundry globals (every such read goes through pf2eAdapter.js).
const DOOR_TYPE_SECRET = 2;
const DOOR_STATE_CLOSED = 0;
const DOOR_STATE_OPEN = 1;
const DOOR_STATE_LOCKED = 2;

let _sendUpdate = null;

export function initDoors(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;

  onHook('updateWall', (wallDoc, change, options, _userId) => {
    // Only door-state changes are interesting; a wall being dragged is not.
    if (!change || !('ds' in change)) return;
    if (!isDoor(wallDoc)) return;

    // Auto-off latch: skip echoes the bridge itself caused, so opening a door
    // from the app doesn't immediately kill the app's own exploration movement.
    if (options?.[BRIDGE_SOURCE_FLAG] !== 'app' && change.ds === DOOR_STATE_OPEN) {
      _sendUpdate?.(GLOBAL_ID, RELAY.EXPLOREMOVE, false);
    }

    // Scene feed: re-push unconditionally — including app-initiated changes —
    // so every dock overlay converges on the canvas truth (#1805).
    pushSceneDoors();
  });
}

// Wall-midpoint world coordinates + state for one door WallDocument.
function doorEntry(wall) {
  const [x1, y1, x2, y2] = getWallCoords(wall);
  return {
    wallId: getWallId(wall),
    state: getDoorState(wall),
    x: Math.round((x1 + x2) / 2),
    y: Math.round((y1 + y2) / 2),
  };
}

// Returns doors within ~1.5 grid squares of the PC token.
// Includes regular doors (door === 1); skips secret doors (door === 2) unless open.
export function handleDoorRequest(charId, { ts } = {}) {
  const token = resolveToken(charId);
  if (!token) return;

  const gridSize = getGridSize();
  const threshold = ADJACENCY_SQUARES * gridSize;

  // Centre pixel of the PC token's grid cell.
  const cx = token.x + gridSize / 2;
  const cy = token.y + gridSize / 2;

  const doors = [];

  for (const wall of getSceneWalls()) {
    if (!isDoor(wall)) continue;
    const state = getDoorState(wall);
    // Secret doors (type 2) are hidden from players unless already open.
    if (getDoorType(wall) === DOOR_TYPE_SECRET && state !== DOOR_STATE_OPEN) continue;

    const [x1, y1, x2, y2] = getWallCoords(wall);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    const distToMid   = Math.hypot(midX - cx, midY - cy);
    const distToStart = Math.hypot(x1   - cx, y1   - cy);
    const distToEnd   = Math.hypot(x2   - cx, y2   - cy);

    if (Math.min(distToMid, distToStart, distToEnd) <= threshold) {
      doors.push(doorEntry(wall));
    }
  }

  _sendUpdate?.(charId, RELAY.DOOROPTS, { doors, reqTs: ts ?? null });
}

// Every door on the rendered scene, no adjacency gate — the GM dock's overlay
// feed (#1805). Secret doors ride along carrying `secret: true`.
export function pushSceneDoors(reqTs = null) {
  if (!_sendUpdate) return;

  const doors = [];
  for (const wall of getSceneWalls()) {
    if (!isDoor(wall)) continue;
    const entry = doorEntry(wall);
    if (getDoorType(wall) === DOOR_TYPE_SECRET) entry.secret = true;
    doors.push(entry);
  }

  _sendUpdate(GLOBAL_ID, RELAY.DOOROPTS, {
    doors,
    sceneId: getSceneId(),
    reqTs: reqTs ?? null,
  });
}

// cnmh_doorreq_global — app asks for the whole scene's doors.
export function handleSceneDoorRequest({ ts } = {}) {
  pushSceneDoors(ts ?? null);
}

// Open or close a door. Ignores locked doors (ds === 2).
// `charId` is unused — the wallId alone identifies the door — so the same
// handler serves both the per-character and the `global` key forms.
export function handleDoorInteract(_charId, { wallId, op, ts } = {}) {
  const wall = getWallById(wallId);
  if (!wall) return Promise.resolve();
  if (!isDoor(wall)) return Promise.resolve();

  const state = getDoorState(wall);
  if (state === DOOR_STATE_LOCKED) return Promise.resolve(); // locked — ignore

  const targetDs = op === 'open' ? DOOR_STATE_OPEN : DOOR_STATE_CLOSED;

  // Live Foundry's WallDocument#update is ASYNC. Returned (not awaited by the
  // relay dispatcher) so tests and future callers can sequence on it; the
  // adapter already turns a rejection into a console warning rather than an
  // invisible unhandled rejection (#452).
  //
  // The re-push to app clients is the updateWall hook's job — it fires for
  // app-driven changes too, so both feeds refresh from the one code path.
  void ts; // ts is for correlation; bridge doesn't echo a dooropts here
  return setDoorState(wall, targetDs);
}
