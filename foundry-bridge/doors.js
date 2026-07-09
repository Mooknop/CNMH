// Feature: Door detection and interaction for Exploration mode.
//
// Protocol:
//   App → bridge:  cnmh_doorreq_<charId>      = { ts }
//   Bridge → app:  cnmh_dooropts_<charId>     = { doors:[{ wallId, state, x, y }], reqTs }
//   App → bridge:  cnmh_doorinteract_<charId> = { wallId, op:'open'|'close', ts }
//
// Auto-off: when any door's ds changes to open (1) via Foundry's updateWall hook,
// cnmh_exploremove_global is set false regardless of who opened it.
//
// Adjacency: a door is "nearby" if its midpoint or either endpoint is within
// ADJACENCY_SQUARES grid squares of the PC token's centre cell.

import { resolveToken } from './movement.js';
import {
  getSceneWalls,
  getWallById,
  isDoor,
  getDoorState,
  getWallCoords,
  setDoorState,
  getGridSize,
  onHook,
} from './pf2eAdapter.js';
import { BRIDGE_SOURCE_FLAG } from './utils.js';
import { RELAY } from './syncKeys.js';

const ADJACENCY_SQUARES = 1.5;

let _sendUpdate = null;

export function initDoors(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;

  onHook('updateWall', (wallDoc, change, _options, _userId) => {
    // Skip echoes the bridge itself caused.
    if (_options?.[BRIDGE_SOURCE_FLAG] === 'app') return;
    // When a door transitions to open, turn off exploration movement for everyone.
    if (change.ds === 1 && isDoor(wallDoc)) {
      _sendUpdate?.('global', RELAY.EXPLOREMOVE, false);
    }
  });
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
    const doorType = wall?.document?.door ?? wall?.door ?? 0;
    const state = getDoorState(wall);
    // Secret doors (type 2) are hidden unless already open.
    if (doorType === 2 && state !== 1) continue;

    const [x1, y1, x2, y2] = getWallCoords(wall);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    const distToMid   = Math.hypot(midX - cx, midY - cy);
    const distToStart = Math.hypot(x1   - cx, y1   - cy);
    const distToEnd   = Math.hypot(x2   - cx, y2   - cy);

    if (Math.min(distToMid, distToStart, distToEnd) <= threshold) {
      const wallId = wall.id ?? wall.document?.id;
      doors.push({ wallId, state, x: Math.round(midX), y: Math.round(midY) });
    }
  }

  _sendUpdate?.(charId, RELAY.DOOROPTS, { doors, reqTs: ts ?? null });
}

// Open or close a door. Ignores locked doors (ds === 2).
export function handleDoorInteract(charId, { wallId, op, ts } = {}) {
  const wall = getWallById(wallId);
  if (!wall) return;
  if (!isDoor(wall)) return;

  const state = getDoorState(wall);
  if (state === 2) return; // locked — ignore

  const targetDs = op === 'open' ? 1 : 0;
  setDoorState(wall, targetDs);

  // Auto-off is handled by the updateWall hook in initDoors, but for the
  // in-bridge path the hook fires synchronously in tests, so no extra push needed.
  void ts; // ts is for correlation; bridge doesn't echo a dooropts here
}
