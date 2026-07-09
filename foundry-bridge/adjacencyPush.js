// Adjacency push (#430): on every relevant Foundry event (token move, combat turn
// advance, combat start) recompute the combatant adjacency map and push it.
//
// Protocol:
//   bridge → app: cnmh_adjacency_global = { [entryId]: [adjacentEntryId, …] }
//
// The app (useAdjacency) reads it to gate reach-limited actions — e.g. disabling
// "Battle Medicine on the focused ally" when that ally is out of reach. The app
// degrades gracefully when the key is absent (bridge offline / no tokens), so
// this relay is purely additive.
//
// Mirrors flankingPush.js. Adjacency is general (all combat tokens, keyed by
// combatant id) so it can also back future melee-reach / door-reach checks.

import { getCombatTokenMap, getGridSize } from './pf2eAdapter.js';
import { computeAdjacency } from './adjacency.js';
import { RELAY } from './syncKeys.js';

let _sendUpdate = null;
let _latest = {};

export function getLatestAdjacencyState() {
  return _latest;
}

export function initAdjacencyPush(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;

  // Recompute whenever a token moves (the document update fires after the move).
  Hooks.on('updateToken', () => pushAdjacencyState());
  // Turn advance / combat changes (cheap; positions may matter for the new actor).
  Hooks.on('updateCombat', () => pushAdjacencyState());
  // Combat start — combatants and their tokens are now known.
  Hooks.on('createCombat', () => pushAdjacencyState());
}

export function pushAdjacencyState() {
  if (!_sendUpdate) return;

  const combatMap = getCombatTokenMap(); // [{ combatantId, actorId, token }]
  if (!combatMap.length) {
    _latest = {};
    _sendUpdate('global', RELAY.ADJACENCY, {});
    return;
  }

  const result = computeAdjacency(combatMap, getGridSize());
  _latest = result;
  _sendUpdate('global', RELAY.ADJACENCY, result);
}
