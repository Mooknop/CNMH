// Positions push (#528, epic #527): broadcast each combatant's grid position so
// the app can measure attacker→target distance for ranged range increments.
//
// Protocol (protocol ≥ 17, #1749 / #1751):
//   bridge → app: cnmh_positions_global =
//     { gridSize, positions: { [entryId]: { col, row, width, height, hidden } } }
//
// Keyed by combatant id (the app's encounter-order entryId), so a consumer can
// look up any combatant's current cell. Classification-agnostic (no actorMap
// dependency) — like adjacency, it's keyed purely by combatant id. Kept fresh on
// token move + combat hooks; emits empty positions when no combat is running.
//
// `col`/`row` are the token's TOP-LEFT cell; `width`/`height` are its footprint
// in grid squares (integers ≥ 1), so a 2×2 ogre is a square rather than a
// corner marker (#1749 OQ-1.3 hit testing, #1751 OQ-1.2 emanation origins).
// `hidden` mirrors TokenDocument#hidden — the GM's eye toggle — because
// captureSceneSnapshot omits hidden tokens from the image and a marker drawn
// over that gap would be an X over an invisible creature (#1749 OQ-5). The
// entry is still SENT: the channel stays the complete combat picture for GM
// surfaces, and the flag is what lets player surfaces drop it.

import {
  getCombatTokenMap, getTokenGridPosition, getTokenDimensions, isTokenHidden,
  getGridSize, onHook,
} from './pf2eAdapter.js';
import { RELAY } from './syncKeys.js';

let _sendUpdate = null;
let _latest = { gridSize: 0, positions: {} };

export function getLatestPositions() {
  return _latest;
}

export function initPositions(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;

  // Re-broadcast whenever a token moves on the canvas (v13/v14: updateToken
  // fires on the token document after the move is applied).
  onHook('updateToken', () => pushPositions());

  // Combat lifecycle: a new fight brings new combatants/tokens; turn advances are
  // cheap to recompute; deleteCombat clears positions (no active combat → empty).
  onHook('createCombat', () => pushPositions());
  onHook('updateCombat', () => pushPositions());
  onHook('deleteCombat', () => pushPositions());
}

export function pushPositions() {
  if (!_sendUpdate) return;

  const combatMap = getCombatTokenMap(); // [{ combatantId, actorId, token }]
  if (!combatMap.length) {
    _latest = { gridSize: 0, positions: {} };
    _sendUpdate('global', RELAY.POSITIONS, _latest);
    return;
  }

  const gridSize = getGridSize();
  const positions = {};
  for (const { combatantId, token } of combatMap) {
    if (!token) continue;
    const { width, height } = getTokenDimensions(token);
    positions[combatantId] = {
      ...getTokenGridPosition(token),
      width,
      height,
      hidden: isTokenHidden(token),
    };
  }

  _latest = { gridSize, positions };
  _sendUpdate('global', RELAY.POSITIONS, _latest);
}
