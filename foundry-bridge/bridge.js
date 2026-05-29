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
import { initEncounter, handleTurnCommand, updateActorMap } from './encounter.js';
import { initCharacterSync, handleCharacterUpdate }    from './characterSync.js';
import { initMovement, handleMoveRequest, handleMoveConfirm } from './movement.js';

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
});

Hooks.once('ready', () => {
  console.log('CNMH Bridge | Foundry ready — connecting to session relay');
  initEncounter(sendUpdate);
  initCharacterSync(sendUpdate);
  initMovement(sendUpdate);
  connect();
});

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
    if (map) updateActorMap(map);
    return;
  }

  if (msg.type !== 'UPDATE') return;

  const { characterId, key, value } = msg;
  if (!characterId || !key) return;

  // Actor map updated by GM in GmEncounter → refresh bridge-side resolution.
  if (characterId === 'global' && key === 'actormap') {
    updateActorMap(value);
    return;
  }

  // Encounter turn command from app → drive Foundry combat.
  if (characterId === 'global' && key === 'turncmd') {
    handleTurnCommand(value);
    return;
  }

  // Movement requests.
  if (key === 'movereq') {
    handleMoveRequest(characterId, value);
    return;
  }
  if (key === 'moveconfirm') {
    handleMoveConfirm(characterId, value);
    return;
  }

  // HP / hero points write-back from app → Foundry actor.
  if (key === 'hp' || key === 'heropoints') {
    handleCharacterUpdate(characterId, key, value);
    return;
  }
}
