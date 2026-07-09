// Positions push (#528, epic #527): broadcast each combatant's grid position so
// the app can measure attacker→target distance for ranged range increments.
//
// Protocol:
//   bridge → app: cnmh_positions_global = { gridSize, positions: { [entryId]: { col, row } } }
//
// Keyed by combatant id (the app's encounter-order entryId), so a consumer can
// look up any combatant's current cell. Classification-agnostic (no actorMap
// dependency) — like adjacency, it's keyed purely by combatant id. Kept fresh on
// token move + combat hooks; emits empty positions when no combat is running.

import { getCombatTokenMap, getTokenGridPosition, getGridSize } from './pf2eAdapter.js';
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
  Hooks.on('updateToken', () => pushPositions());

  // Combat lifecycle: a new fight brings new combatants/tokens; turn advances are
  // cheap to recompute; deleteCombat clears positions (no active combat → empty).
  Hooks.on('createCombat', () => pushPositions());
  Hooks.on('updateCombat', () => pushPositions());
  Hooks.on('deleteCombat', () => pushPositions());
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
    positions[combatantId] = getTokenGridPosition(token);
  }

  _latest = { gridSize, positions };
  _sendUpdate('global', RELAY.POSITIONS, _latest);
}
