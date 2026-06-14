// Minion ↔ Foundry actor linking + token spawn (#362, slice 1).
//
// Companions/familiars are separate PF2e actors owned by the same player as their
// PC. This module derives those links from Foundry ownership (no GM clicks) and
// pushes them to the app as { characterId:'global', key:'minionactors', value:<map> },
// mirroring the roster/summon-pool pushes in bridge.js / summonPool.js.
//
// The app surfaces a "Spawn on map" button per linked minion (GM and the owning
// player). A click sends cnmh_spawnminion_global = { ownerCharId, role }, handled
// here: resolve the owner PC's token, find an open adjacent cell, and create the
// minion's token. The createToken hook then re-pushes the map so `onScene` flips.
//
// The app never writes cnmh_minionactors_global; it's a bridge-owned snapshot.

import { getActorMap } from './encounter.js';
import { resolveToken } from './movement.js';
import {
  getActorById,
  getMinionActorLinks,
  findOpenAdjacentCell,
  createTokenForActor,
} from './pf2eAdapter.js';

let _sendUpdate = null;  // injected by bridge.js on init

// Stable key shared with the app's minionTurnId(ownerId, role).
const linkKey = (ownerCharId, role) => `${ownerCharId}-${role}`;

export function pushMinionActors() {
  const links = getMinionActorLinks(getActorMap());
  const map = {};
  for (const link of links) {
    map[linkKey(link.ownerCharId, link.role)] = link;
  }
  _sendUpdate?.('global', 'minionactors', map);
}

export function initMinionActors(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;
  // Links depend on actor ownership/type; presence on the scene depends on tokens.
  // The set is small, so recompute from scratch on any relevant change.
  Hooks.on('createActor', () => pushMinionActors());
  Hooks.on('updateActor', () => pushMinionActors());
  Hooks.on('deleteActor', () => pushMinionActors());
  Hooks.on('createToken', () => pushMinionActors());
  Hooks.on('deleteToken', () => pushMinionActors());
}

// App-requested refresh (cnmh_minionactorsreq_global) — reconnect / manual.
export function handleMinionActorsReq() {
  pushMinionActors();
}

// App asked to spawn a linked minion's token (cnmh_spawnminion_global).
// No-op when the link is unknown, the minion is already on the scene, or the
// owner has no token to anchor to.
export async function handleSpawnMinion(value) {
  const { ownerCharId, role } = value ?? {};
  if (!ownerCharId || !role) return;

  const link = getMinionActorLinks(getActorMap())
    .find((l) => l.ownerCharId === ownerCharId && l.role === role);
  if (!link || link.onScene) return;

  const ownerToken = resolveToken(ownerCharId);
  if (!ownerToken) return;

  const actor = getActorById(link.foundryActorId);
  if (!actor) return;

  const { x, y } = findOpenAdjacentCell(ownerToken);
  await createTokenForActor(actor, x, y);
}
