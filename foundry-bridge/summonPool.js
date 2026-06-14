// Summon pool sync (#261) — exposes the actors filed under a designated Foundry
// folder (default "Summons") to the app so the GM can add one as a sustain-linked
// summon. Mirrors the roster push in bridge.js: a full snapshot is sent to
// { characterId:'global', key:'summonpool', value:[…] } whenever the folder's
// actors change, and on demand when the app sends cnmh_summonpoolreq_global.
//
// The app never writes this key; summons the GM creates live in cnmh_summons_global.

import { getSummonFolderActors } from './pf2eAdapter.js';

const MODULE_ID = 'cnmh-bridge';
const DEFAULT_FOLDER = 'Summons';

let _sendUpdate = null;  // injected by bridge.js on init

function folderName() {
  try {
    return game.settings?.get(MODULE_ID, 'summonFolder') || DEFAULT_FOLDER;
  } catch {
    return DEFAULT_FOLDER;
  }
}

export function pushSummonPool() {
  const pool = getSummonFolderActors(folderName());
  _sendUpdate?.('global', 'summonpool', pool);
}

export function initSummonPool(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;
  // Any actor or folder edit can change the pool; it's small, so just recompute
  // from the current folder contents rather than tracking membership deltas.
  Hooks.on('createActor', () => pushSummonPool());
  Hooks.on('updateActor', () => pushSummonPool());
  Hooks.on('deleteActor', () => pushSummonPool());
  Hooks.on('updateFolder', () => pushSummonPool());
}

// App-requested refresh (cnmh_summonpoolreq_global), e.g. the Add-summon modal's
// "refresh" button or a reconnect.
export function handleSummonPoolReq() {
  pushSummonPool();
}
