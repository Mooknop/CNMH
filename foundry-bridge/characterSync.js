// Feature 2: Live character state sync — HP, conditions, hero points.
//
// Foundry → app: actor update hooks push cnmh_hp_*, cnmh_conditions_*,
//   cnmh_heropoints_* to the session relay.
// App → Foundry: incoming relay updates for hp/heroPoints are written back to
//   the Foundry actor. Tagged with _bridgeSource:'app' to prevent echo loops.

import { ACTOR_MAP, ACTOR_MAP_REVERSE } from './config.js';
import { BRIDGE_SOURCE_FLAG, isBridgeEcho, slugToAppConditionId } from './utils.js';
import {
  getHp, getHeroPoints, getConditions,
} from './pf2eAdapter.js';

let _sendUpdate = null;

export function initCharacterSync(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;

  Hooks.on('updateActor', onUpdateActor);
  Hooks.on('createEmbeddedDocuments', onEmbeddedDocumentsChanged);
  Hooks.on('deleteEmbeddedDocuments', onEmbeddedDocumentsChanged);
}

// Called by bridge.js when an incoming relay UPDATE arrives for a character key.
export async function handleCharacterUpdate(charId, key, value) {
  const actorId = ACTOR_MAP[charId];
  if (!actorId) return;
  const actor = game.actors.get(actorId);
  if (!actor) return;

  if (key === 'hp') {
    await actor.update({
      'system.attributes.hp.value': value.current,
      'system.attributes.hp.temp':  value.temp ?? 0,
    }, { [BRIDGE_SOURCE_FLAG]: 'app' });
  }

  if (key === 'heropoints') {
    await actor.update({
      'system.resources.heroPoints.value': value,
    }, { [BRIDGE_SOURCE_FLAG]: 'app' });
  }
}

function onUpdateActor(actor, diff, options) {
  if (isBridgeEcho(options)) return;

  const charId = ACTOR_MAP_REVERSE[actor.id];
  if (!charId) return;

  const hpDiff = diff.system?.attributes?.hp;
  const dyingDiff  = diff.system?.attributes?.dying;
  const woundedDiff= diff.system?.attributes?.wounded;
  const doomedDiff = diff.system?.attributes?.doomed;
  const heroDiff   = diff.system?.resources?.heroPoints;

  if (hpDiff || dyingDiff || woundedDiff || doomedDiff) {
    _sendUpdate?.(charId, 'hp', getHp(actor));
  }
  if (heroDiff) {
    _sendUpdate?.(charId, 'heropoints', getHeroPoints(actor));
  }
}

function onEmbeddedDocumentsChanged(parent, type, docs) {
  if (type !== 'Item') return;
  const hasCondition = docs.some((d) => d.type === 'condition');
  if (!hasCondition) return;

  const charId = ACTOR_MAP_REVERSE[parent.id];
  if (!charId) return;

  const conditions = getConditions(parent).map((c) => ({
    id:    slugToAppConditionId(c.slug),
    value: c.value,
  }));
  _sendUpdate?.(charId, 'conditions', conditions);
}
