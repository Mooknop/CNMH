// Feature 2: Live character state sync — HP, conditions, hero points.
//
// Foundry → app: actor update hooks push cnmh_hp_*, cnmh_conditions_*,
//   cnmh_heropoints_* to the session relay.
// App → Foundry: incoming relay updates for hp/heroPoints are written back to
//   the Foundry actor. Tagged with _bridgeSource:'app' to prevent echo loops.

// Actor→charId resolution uses the app-maintained actorMap (set by GM in the
// encounter UI and stored in session state) rather than the static config.js map.
import { getActorMap } from './encounter.js';
import { isBridgeEcho, slugToAppConditionId, slugToAppEffectId } from './utils.js';
import {
  getHp, getHeroPoints, getConditions, getEffects,
  getActorById, getActorId, updateActorHp, updateActorHeroPoints,
  isConditionItem, getConditionItemActor,
  isEffectItem, getEffectItemActor,
} from './pf2eAdapter.js';
import { RELAY } from './syncKeys.js';

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

  // Effect items — Foundry → app effect read-back (#455). The Courageous Anthem
  // aura grants the stock spell effect to allied tokens in range; mirroring those
  // effect items into cnmh_foundryeffects_<charId> lets the app show + apply the
  // +1 the same way an app-applied effect would. Enter/leave the aura fires
  // create/delete on the ally actor, so membership tracking is automatic.
  Hooks.on('createItem', onEffectItemChanged);
  Hooks.on('updateItem', onEffectItemChanged);
  Hooks.on('deleteItem', onEffectItemChanged);
}

// Called by bridge.js when an incoming relay UPDATE arrives for a character key.
export async function handleCharacterUpdate(charId, key, value) {
  // Reverse lookup: charId → foundryActorId using the app-maintained map.
  const actorMap = getActorMap();
  const actorId  = Object.keys(actorMap).find((k) => actorMap[k] === charId);
  if (!actorId) return;
  const actor = getActorById(actorId);
  if (!actor) return;

  if (key === RELAY.HP) {
    await updateActorHp(actor, { current: value.current, temp: value.temp });
  }

  if (key === RELAY.HEROPOINTS) {
    await updateActorHeroPoints(actor, value);
  }
}

function onUpdateActor(actor, diff, options) {
  if (isBridgeEcho(options)) return;

  const charId = getActorMap()[getActorId(actor)];
  if (!charId) return;

  const hpDiff = diff.system?.attributes?.hp;
  const dyingDiff  = diff.system?.attributes?.dying;
  const woundedDiff= diff.system?.attributes?.wounded;
  const doomedDiff = diff.system?.attributes?.doomed;
  const heroDiff   = diff.system?.resources?.heroPoints;

  if (hpDiff || dyingDiff || woundedDiff || doomedDiff) {
    _sendUpdate?.(charId, RELAY.HP, getHp(actor));
  }
  if (heroDiff) {
    _sendUpdate?.(charId, RELAY.HEROPOINTS, getHeroPoints(actor));
  }
}

function onConditionItemChanged(item) {
  if (!isConditionItem(item)) return;
  const actor = getConditionItemActor(item);
  if (!actor) return;

  const charId = getActorMap()[getActorId(actor)];
  if (!charId) return;

  // Push the full condition list…
  const conditions = getConditions(actor).map((c) => ({
    id:    slugToAppConditionId(c.slug),
    value: c.value,
  }));
  _sendUpdate?.(charId, RELAY.CONDITIONS, conditions);

  // …and re-push HP, since dying/wounded/doomed surface in the HP box and are
  // applied as condition items rather than direct actor-attribute writes.
  _sendUpdate?.(charId, RELAY.HP, getHp(actor));
}

// Effect-item create/update/delete on a synced PC → push the actor's current
// app-modelled effects as cnmh_foundryeffects_<charId>. The bridge owns this key
// outright (full-list replace, like conditions), so it never clobbers the app's
// own cnmh_effects_<charId> store. Effect slugs the app doesn't model
// (slugToAppEffectId → null) — including the aura *source* — are dropped.
function onEffectItemChanged(item) {
  if (!isEffectItem(item)) return;
  const actor = getEffectItemActor(item);
  if (!actor) return;

  const charId = getActorMap()[getActorId(actor)];
  if (!charId) return;

  const effects = getEffects(actor)
    .map((e) => ({ slug: e.slug, effectId: slugToAppEffectId(e.slug), source: e.name }))
    .filter((e) => e.effectId)
    // Stable id per (effectId) so the app can key/merge without churn; the same
    // buff appearing twice collapses to one entry.
    .map((e) => ({ id: `foundry-${e.effectId}`, effectId: e.effectId, source: e.source, fromFoundry: true }));

  _sendUpdate?.(charId, RELAY.FOUNDRYEFFECTS, effects);
}
