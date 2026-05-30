// Feature 2: Live character state sync — HP, conditions, hero points.
//
// Foundry → app: actor update hooks push cnmh_hp_*, cnmh_conditions_*,
//   cnmh_heropoints_* to the session relay.
// App → Foundry: incoming relay updates for hp/heroPoints are written back to
//   the Foundry actor. Tagged with _bridgeSource:'app' to prevent echo loops.

// Actor→charId resolution uses the app-maintained actorMap (set by GM in the
// encounter UI and stored in session state) rather than the static config.js map.
import { getActorMap } from './encounter.js';
import { BRIDGE_SOURCE_FLAG, isBridgeEcho, slugToAppConditionId } from './utils.js';
import {
  getHp, getHeroPoints, getConditions,
} from './pf2eAdapter.js';

let _sendUpdate = null;

export function initCharacterSync(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;

  Hooks.on('updateActor', onUpdateActor);
  // Conditions — including dying/wounded/doomed — are condition-type Items on the
  // actor. Foundry fires per-document hooks (createItem/updateItem/deleteItem),
  // not a generic createEmbeddedDocuments hook. updateItem catches badge changes
  // (e.g. Dying 1 → 2).
  Hooks.on('createItem', onConditionItemChanged);
  Hooks.on('updateItem', onConditionItemChanged);
  Hooks.on('deleteItem', onConditionItemChanged);
}

// Called by bridge.js when an incoming relay UPDATE arrives for a character key.
export async function handleCharacterUpdate(charId, key, value) {
  // Reverse lookup: charId → foundryActorId using the app-maintained map.
  const actorMap = getActorMap();
  const actorId  = Object.keys(actorMap).find((k) => actorMap[k] === charId);
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

  const charId = getActorMap()[actor.id];
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

function onConditionItemChanged(item) {
  if (item?.type !== 'condition') return;
  const actor = item.parent;
  if (!actor || actor.documentName !== 'Actor') return;

  const charId = getActorMap()[actor.id];
  if (!charId) return;

  // Push the full condition list…
  const conditions = getConditions(actor).map((c) => ({
    id:    slugToAppConditionId(c.slug),
    value: c.value,
  }));
  _sendUpdate?.(charId, 'conditions', conditions);

  // …and re-push HP, since dying/wounded/doomed surface in the HP box and are
  // applied as condition items rather than direct actor-attribute writes.
  _sendUpdate?.(charId, 'hp', getHp(actor));
}
