// Main bridge entry point. Loaded by Foundry as an esmodule on the `ready` hook.
//
// Connects to the Cloudflare session relay at /bridge/{campaignId}?key=<secret>,
// which forwards all traffic to the same CampaignSession Durable Object that
// player devices connect to. The bridge is a normal session peer: it sends and
// receives { type:'UPDATE', characterId, key, value } messages.
//
// Dispatches incoming updates to the feature modules (encounter, characterSync,
// movement) and exposes sendUpdate for those modules to push outbound messages.

import { WORKER_WSS_URL, CAMPAIGN_ID, BRIDGE_SECRET } from './config.js';
import { initEncounter, handleTurnCommand, handleInitCommit, handleInitRoll, updateActorMap } from './encounter.js';
import { initActorFeed } from './actorFeed.js';
import { initCharacterSync, handleCharacterUpdate }    from './characterSync.js';
import { initMovement, handleMoveRequest, handleMoveConfirm } from './movement.js';
import { handleAction } from './targeting.js';
import { initDoors, handleDoorRequest, handleDoorInteract } from './doors.js';
import { handleApplyEffect } from './effects.js';
import { initDamageApply, handleDamageApply } from './damageApply.js';
import { initSaves, handleSaveRoll } from './saves.js';
import { handleFxPlay } from './animations.js';
import { initFlankingPush, pushFlankedState } from './flankingPush.js';
import { initAdjacencyPush, pushAdjacencyState } from './adjacencyPush.js';
import { initPositions, pushPositions } from './positions.js';
import { initSummonPool, pushSummonPool, handleSummonPoolReq } from './summonPool.js';
import { initMinionActors, pushMinionActors, handleMinionActorsReq, handleSpawnMinion } from './minionActors.js';
import { initMinionSync, handleMinionsUpdate, cacheMinions } from './minionSync.js';
import { getPlayerActors, getActorId, getSpeed, getModuleVersion } from './pf2eAdapter.js';
import { RELAY, PROTOCOL_VERSION } from './syncKeys.js';

const MODULE_ID = 'cnmh-bridge';
const RECONNECT_MS = 3000;
const PING_INTERVAL_MS = 30_000;

let _ws          = null;
let _reconnTimer = null;
let _pingTimer   = null;

// --- Public API (used by feature modules) ---

function sendUpdate(characterId, key, value) {
  if (_ws?.readyState !== WebSocket.OPEN) return;
  _ws.send(JSON.stringify({ type: 'UPDATE', characterId, key, value }));
}

// --- Foundry lifecycle ---

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, 'workerUrl', {
    name: 'Worker WebSocket URL',
    hint: 'wss:// URL of the CNMH Cloudflare Worker. Change this to switch between staging and production without a new module release.',
    scope: 'world',
    config: true,
    type: String,
    default: WORKER_WSS_URL,
  });
  game.settings.register(MODULE_ID, 'campaignId', {
    name: 'Campaign ID',
    hint: 'Session key used by the Worker (default: osprey-covey).',
    scope: 'world',
    config: true,
    type: String,
    default: CAMPAIGN_ID,
  });
  game.settings.register(MODULE_ID, 'summonFolder', {
    name: 'Summons folder',
    hint: 'Name of the Actors folder whose creatures the app offers as summons (#261).',
    scope: 'world',
    config: true,
    type: String,
    default: 'Summons',
  });
});

Hooks.once('ready', () => {
  console.log('CNMH Bridge | Foundry ready — connecting to session relay');
  initEncounter(sendUpdate);
  initActorFeed(sendUpdate);
  initCharacterSync(sendUpdate);
  initMovement(sendUpdate);
  initFlankingPush(sendUpdate);
  initAdjacencyPush(sendUpdate);
  initPositions(sendUpdate);
  initSummonPool(sendUpdate);
  initMinionActors(sendUpdate);
  initMinionSync(sendUpdate);
  initDoors(sendUpdate);
  initDamageApply(sendUpdate);
  initSaves(sendUpdate);
  connect();
});

// Protocol handshake (#1310): announce the wire-protocol version + module
// version on every connect. The app compares against its minimum and shows a
// GM-facing "bridge outdated" warning instead of letting a stale module
// degrade silently. Persisted like any synced key, so gate reads on live
// Foundry presence app-side.
function pushHello() {
  sendUpdate('global', RELAY.BRIDGEHELLO, {
    protocol: PROTOCOL_VERSION,
    module: getModuleVersion(MODULE_ID),
    ts: Date.now(),
  });
}

// Push the PC roster once connected so the app can resolve charId → token
// even before a combat has run (exploration movement depends on actorMap).
function pushRoster() {
  const actors = getPlayerActors();
  const roster = actors.map((a) => ({ actorId: getActorId(a), name: a.name, speed: getSpeed(a) }));
  sendUpdate('global', RELAY.ROSTER, roster);
}

Hooks.on('createActor', (actor) => { if (actor.hasPlayerOwner) pushRoster(); });
Hooks.on('deleteActor', (actor) => { if (actor.hasPlayerOwner) pushRoster(); });

// --- WebSocket management ---

function connect() {
  const workerUrl  = game.settings.get(MODULE_ID, 'workerUrl')  || WORKER_WSS_URL;
  const campaignId = game.settings.get(MODULE_ID, 'campaignId') || CAMPAIGN_ID;
  const url = `${workerUrl}/bridge/${campaignId}?key=${encodeURIComponent(BRIDGE_SECRET)}`;
  let ws;
  try {
    ws = new WebSocket(url);
  } catch (err) {
    console.error('CNMH Bridge | WebSocket constructor failed:', err);
    scheduleReconnect();
    return;
  }
  _ws = ws;

  ws.onopen = () => {
    console.log('CNMH Bridge | Connected to session relay');
    clearTimeout(_reconnTimer);
    schedulePing();
    pushHello();
    pushRoster();
    pushSummonPool();
    pushMinionActors();
    pushPositions();
  };

  ws.onclose = (evt) => {
    console.warn(`CNMH Bridge | Connection closed (${evt.code}), reconnecting in ${RECONNECT_MS}ms`);
    clearInterval(_pingTimer);
    scheduleReconnect();
  };

  ws.onerror = () => {
    try { ws.close(); } catch { /* already closing */ }
  };

  ws.onmessage = (evt) => {
    let msg;
    try { msg = JSON.parse(evt.data); }
    catch { return; }
    dispatch(msg);
  };
}

function scheduleReconnect() {
  clearTimeout(_reconnTimer);
  _reconnTimer = setTimeout(connect, RECONNECT_MS);
}

function schedulePing() {
  clearInterval(_pingTimer);
  _pingTimer = setInterval(() => {
    if (_ws?.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify({ type: 'PING' }));
    }
  }, PING_INTERVAL_MS);
}

// --- Incoming message dispatch ---

function dispatch(msg) {
  if (msg.type === 'PONG') return;

  if (msg.type === 'FULL_STATE') {
    // Seed the actor map from persisted session state so the first encounter
    // push already has correct charId resolution.
    const map = msg.payload?.global?.actormap;
    if (map) {
      updateActorMap(map);
      pushFlankedState();  // actorMap just became valid — re-evaluate with correct PC set
      pushMinionActors();  // minion→PC links resolve through the actor map
    }
    // Adjacency is classification-agnostic (keyed by combatant id), so it doesn't
    // need the actor map — but push once on connect so a mid-combat reconnect has
    // reach data without waiting for a token to move.
    pushAdjacencyState();
    // Seed the minion-HP merge cache from persisted state so the first Foundry→app
    // push for one role doesn't clobber the other (#362 stretch).
    for (const [cid, state] of Object.entries(msg.payload || {})) {
      if (cid !== 'global' && state?.minions) cacheMinions(cid, state.minions);
    }
    return;
  }

  if (msg.type !== 'UPDATE') return;

  const { characterId, key, value } = msg;
  if (!characterId || !key) return;

  // App requests a fresh roster (e.g. after reconnect).
  if (characterId === 'global' && key === RELAY.ROSTERREQ) {
    pushRoster();
    return;
  }

  // App requests a fresh summon pool (Add-summon modal refresh / reconnect).
  if (characterId === 'global' && key === RELAY.SUMMONPOOLREQ) {
    handleSummonPoolReq();
    return;
  }

  // App requests fresh combatant positions (range-increment resolver / reconnect).
  if (characterId === 'global' && key === RELAY.POSITIONSREQ) {
    pushPositions();
    return;
  }

  // Actor map updated by GM in GmEncounter → refresh bridge-side resolution.
  if (characterId === 'global' && key === RELAY.ACTORMAP) {
    updateActorMap(value);
    pushFlankedState();  // PC set changed — re-evaluate immediately
    pushMinionActors();  // minion→PC links resolve through the actor map
    return;
  }

  // App requests a fresh minion-actor link map (reconnect / refresh).
  if (characterId === 'global' && key === RELAY.MINIONACTORSREQ) {
    handleMinionActorsReq();
    return;
  }

  // App asked to spawn a linked minion's token on the active scene.
  if (characterId === 'global' && key === RELAY.SPAWNMINION) {
    handleSpawnMinion(value);
    return;
  }

  // Encounter turn command from app → drive Foundry combat.
  if (characterId === 'global' && key === RELAY.TURNCMD) {
    handleTurnCommand(value);
    return;
  }

  // Initiative commit from app → write inits, roll NPCs, start Foundry combat (#495).
  if (characterId === 'global' && key === RELAY.INITCOMMIT) {
    handleInitCommit(value);
    return;
  }

  // Player setup-phase initiative roll → tally; auto-commits when all PCs are in (#497).
  if (key === RELAY.INITROLL) {
    handleInitRoll(characterId, value);
    return;
  }

  // Movement requests.
  if (key === RELAY.MOVEREQ) {
    handleMoveRequest(characterId, value);
    return;
  }
  if (key === RELAY.MOVECONFIRM) {
    handleMoveConfirm(characterId, value);
    return;
  }

  // Door detection / interaction.
  if (key === RELAY.DOORREQ) {
    handleDoorRequest(characterId, value);
    return;
  }
  if (key === RELAY.DOORINTERACT) {
    handleDoorInteract(characterId, value);
    return;
  }

  // HP / hero points write-back from app → Foundry actor.
  if (key === RELAY.HP || key === RELAY.HEROPOINTS) {
    handleCharacterUpdate(characterId, key, value);
    return;
  }

  // Minion (companion/familiar) HP write-back from app → linked Foundry actor(s).
  if (key === RELAY.MINIONS) {
    handleMinionsUpdate(characterId, value);
    return;
  }

  // Action targeting from app → set Foundry's user target set.
  if (key === RELAY.ACTION) {
    handleAction(characterId, value);
    return;
  }

  // Foundry effect application from app → clone effect item onto target actors.
  if (key === RELAY.APPLYEFFECT) {
    handleApplyEffect(characterId, value);
    return;
  }

  // Typed damage from the app's damage step → PF2e applyDamage (IWR nets there).
  if (characterId === 'global' && key === RELAY.DMGAPPLY) {
    handleDamageApply(value);
    return;
  }

  // Enemy saving throws for the app's save-request rail (#1275) — rolled
  // natively so the actor's live modifiers apply; acked on cnmh_savedone_global.
  if (characterId === 'global' && key === RELAY.SAVEROLL) {
    handleSaveRoll(value);
    return;
  }

  // Canvas-animation recipe from the app's fx catalog → Sequencer (#1415).
  if (characterId === 'global' && key === RELAY.FXPLAY) {
    handleFxPlay(value);
    return;
  }
}
