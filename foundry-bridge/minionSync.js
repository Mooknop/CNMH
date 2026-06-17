// Minion state write-back (#362 stretch) — companion/familiar HP + conditions ↔
// Foundry actor.
//
// Mirrors characterSync.js but for minions, which differ from PCs two ways:
//  - HP/conditions live in a *combined* per-owner object
//      cnmh_minions_<ownerId> = { [role]: { hp:{current,max,temp}, conditions:[{id,value}], ... } }
//    holding both companion and familiar, so a Foundry→app push for one role must
//    MERGE into that object, never replace it. We keep a small per-owner cache
//    (seeded from FULL_STATE + every inbound minions UPDATE) to merge against.
//  - Minions aren't in the PC actorMap; they resolve through the ownership-derived
//    getMinionActorLinks(actorMap) — the same links spawn/movement/flanking use.
//
// Foundry → app: a minion actor's HP or condition change merges that role into the
//   owner object and pushes cnmh_minions_<ownerId>.
// App → Foundry: an incoming minions update writes each role's HP to its linked
//   actor, tagged _bridgeSource:'app' (via updateActorHp) so the hook above ignores
//   the echo. Conditions are Foundry→app only, exactly like PCs.

import { getActorMap } from './encounter.js';
import { isBridgeEcho, slugToAppConditionId } from './utils.js';
import {
  getActorById, getActorId, getHp, updateActorHp, getMinionActorLinks,
  getConditions, isConditionItem, getConditionItemActor,
} from './pf2eAdapter.js';

let _sendUpdate = null;

// ownerId → latest cnmh_minions_<ownerId> value. Lets a one-role Foundry→app push
// preserve the other role (and any non-hp fields like flags).
const _minionsCache = new Map();

export function initMinionSync(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;
  Hooks.on('updateActor', onUpdateActorMinion);
  // Conditions (incl. dying/wounded/doomed) are condition-type Items, so Foundry
  // fires per-document hooks rather than updateActor — same as PCs.
  Hooks.on('createItem', onMinionConditionItemChanged);
  Hooks.on('updateItem', onMinionConditionItemChanged);
  Hooks.on('deleteItem', onMinionConditionItemChanged);
}

// Seed/refresh the per-owner cache. Called from bridge.js on FULL_STATE and on
// every inbound `minions` UPDATE so the merge baseline is always current.
export function cacheMinions(ownerId, value) {
  if (!ownerId) return;
  _minionsCache.set(ownerId, value || {});
}

// Test helper — clear the cache between cases.
export function _resetMinionCache() {
  _minionsCache.clear();
}

// app → Foundry: write each role's HP to its linked minion actor.
export async function handleMinionsUpdate(ownerId, value) {
  cacheMinions(ownerId, value);
  if (!value || typeof value !== 'object') return;

  const links = getMinionActorLinks(getActorMap());
  for (const role of Object.keys(value)) {
    const hp = value[role]?.hp;
    if (!hp) continue;
    const link = links.find((l) => l.ownerCharId === ownerId && l.role === role);
    if (!link) continue;
    const actor = getActorById(link.foundryActorId);
    if (!actor) continue;
    await updateActorHp(actor, { current: hp.current, temp: hp.temp });
  }
}

// Merge a patch into one role of the cached owner object (preserving the other
// role and the role's other fields) and push the full combined object.
function mergeAndPushRole(ownerCharId, role, patch) {
  const prev = _minionsCache.get(ownerCharId) || {};
  const merged = {
    ...prev,
    [role]: { ...(prev[role] || {}), ...patch },
  };
  cacheMinions(ownerCharId, merged);
  _sendUpdate?.(ownerCharId, 'minions', merged);
}

// Resolve a Foundry actor to its minion link, or null when it isn't a linked minion.
function linkForActor(actor) {
  if (!actor) return null;
  const actorId = getActorId(actor);
  return getMinionActorLinks(getActorMap()).find((l) => l.foundryActorId === actorId) || null;
}

// Foundry → app: a minion actor's HP changed → merge that role's HP into the
// owner object (preserving the other role) and push the full object.
function onUpdateActorMinion(actor, diff, options) {
  if (isBridgeEcho(options)) return;
  if (!diff?.system?.attributes?.hp) return;

  const link = linkForActor(actor);
  if (!link) return;

  const snap = getHp(actor);
  mergeAndPushRole(link.ownerCharId, link.role, {
    hp: { current: snap.current, max: snap.max, temp: snap.temp },
  });
}

// Foundry → app: a condition item changed on a minion actor → merge that role's
// condition list (and HP, since dying/wounded surface there and arrive as items)
// into the owner object and push it. Conditions are Foundry→app only, like PCs.
function onMinionConditionItemChanged(item) {
  if (!isConditionItem(item)) return;
  const actor = getConditionItemActor(item);
  const link = linkForActor(actor);
  if (!link) return;

  const conditions = getConditions(actor).map((c) => ({
    id: slugToAppConditionId(c.slug),
    value: c.value,
  }));
  const snap = getHp(actor);
  mergeAndPushRole(link.ownerCharId, link.role, {
    conditions,
    hp: { current: snap.current, max: snap.max, temp: snap.temp },
  });
}
