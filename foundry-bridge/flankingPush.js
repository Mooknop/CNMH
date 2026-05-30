// Flanking push: on every relevant Foundry event (token move, combat turn
// advance) recompute who is flanked and push the result.
//
// Protocol:
//   bridge → app: cnmh_flanked_global = { [enemyEntryId]: { byCharIds:[...] } }
//
// The app merges this into encounter state (per-entry flanked flag) and shows a
// badge. Feature modules read it at strike time to know whether to apply
// off-guard (−2 circumstance to AC, attacker-relative).

import { computeFlanking } from './flanking.js';
import { getActorMap } from './encounter.js';
import { getGridSize, getCombatTokenMap } from './pf2eAdapter.js';

let _sendUpdate = null;
let _latest = {};

export function getLatestFlankedState() {
  return _latest;
}

export function initFlankingPush(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;

  // Re-evaluate flanking every time a token moves on the canvas.
  // v13/v14: updateToken fires on the token document after the move is applied.
  Hooks.on('updateToken', () => pushFlankedState());

  // Re-evaluate at every turn advance (tokens haven't moved, but the "can act"
  // status may change — and it's cheap to recompute).
  Hooks.on('updateCombat', () => pushFlankedState());

  // Re-evaluate when combat starts (combatants and tokens are now known).
  Hooks.on('createCombat', () => pushFlankedState());

  // If combat is already active when the bridge connects, the actormap will
  // arrive via FULL_STATE a moment later (bridge.js calls pushFlankedState after
  // seeding the map from FULL_STATE). Nothing to do here — avoid pushing before
  // the actormap is seeded, which would misclassify all combatants as enemies.
}

export function pushFlankedState() {
  if (!_sendUpdate) return;

  const actorMap = getActorMap();
  const gridSize = getGridSize();
  const combatMap = getCombatTokenMap(); // [{ combatantId, actorId, token }]

  const send0 = () => { _latest = {}; _sendUpdate('global', 'flanked', {}); };

  if (!combatMap.length) { send0(); return; }

  // Split into PC entries and enemy tokens using the app-maintained actor map.
  const pcEntries   = [];
  const enemyTokens = [];

  for (const { combatantId, actorId, token } of combatMap) {
    const charId = actorId ? (actorMap[actorId] ?? null) : null;
    if (charId) {
      pcEntries.push({ charId, token });
    } else {
      // Use the combatant id (= entryId in the app's encounter order) as the
      // key so the app can look it up directly in encounter.order.
      enemyTokens.push({ ...token, id: combatantId });
    }
  }

  if (!pcEntries.length || !enemyTokens.length) { send0(); return; }

  const result = computeFlanking(enemyTokens, pcEntries, gridSize);
  _latest = result;
  _sendUpdate('global', 'flanked', result);
}
