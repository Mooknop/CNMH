// Flanking push: on every relevant Foundry event (token move, combat turn
// advance) recompute who is flanked and push the result.
//
// Protocol:
//   bridge → app: cnmh_flanked_global = { [enemyEntryId]: { byCharIds:[...] } }
//
// The app merges this into encounter state (per-entry flanked flag) and shows a
// badge. Feature modules read it at strike time to know whether to apply
// off-guard (−2 circumstance to AC, attacker-relative).

import { getActorMap } from './encounter.js';
import { getCombatTokenMap, checkFlanking } from './pf2eAdapter.js';

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

  const actorMap  = getActorMap();
  const combatMap = getCombatTokenMap(); // [{ combatantId, actorId, token }]

  const send0 = () => { _latest = {}; _sendUpdate('global', 'flanked', {}); };

  if (!combatMap.length) { send0(); return; }

  // Split into PC entries and enemy entries using the app-maintained actor map.
  const pcEntries     = [];
  const enemyEntries  = [];

  for (const entry of combatMap) {
    const charId = entry.actorId ? (actorMap[entry.actorId] ?? null) : null;
    if (charId) {
      pcEntries.push({ charId, token: entry.token });
    } else {
      enemyEntries.push({ combatantId: entry.combatantId, token: entry.token });
    }
  }

  if (!pcEntries.length || !enemyEntries.length) { send0(); return; }

  // Delegate flanking detection to the PF2e system.
  // TokenPF2e.isFlanking(target) returns true when this token AND at least one
  // ally are on opposite sides of the target. The system handles diagonal rules,
  // reach weapons, multi-square tokens, and wall blocking — we don't need to.
  const result = {};
  for (const { combatantId, token: enemyToken } of enemyEntries) {
    const byCharIds = pcEntries
      .filter(({ token: pcToken }) => checkFlanking(pcToken, enemyToken))
      .map(({ charId }) => charId);
    if (byCharIds.length > 0) {
      result[combatantId] = { byCharIds };
    }
  }

  _latest = result;
  _sendUpdate('global', 'flanked', result);
}
