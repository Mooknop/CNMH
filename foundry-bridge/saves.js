// Feature: save / degree-of-success prompts (Slice 5).
//
// Protocol (mirrors the movement handshake):
//   bridge → app: cnmh_saveprompt_<charId> = { reqId, save, dc, effectName, basic, source }
//   app → bridge: cnmh_saveroll_<charId>   = { reqId }         ← player tapped Roll
//   bridge → app: cnmh_saveresult_<charId> = { reqId, total, degree }
//
// The bridge sends a prompt when the GM (or a spell effect targeting a PC) calls
// handleSavePrompt(). The player's device shows the prompt; when they tap Roll the
// bridge resolves it via the PF2e system and pushes the result.
//
// Stale-reqId guard: only the latest reqId per character is honoured. A prompt
// superseded before the player taps Roll is ignored (same pattern as reqTs in
// movement.js).
//
// All Foundry access goes through pf2eAdapter.js.

import { getActorMap } from './encounter.js';
import { getActorById, rollSave } from './pf2eAdapter.js';

let _sendUpdate = null;
let _counter = 0;
// Stores the most-recently-issued reqId per charId so stale rolls are ignored.
const _latestReqId = {};

export function initSaves(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;
}

// Bridge → app: push a save prompt to a PC's device.
// Called by the GM workflow (future: spell targeting via Slice 2 channel).
export function handleSavePrompt(charId, { save, dc, effectName, basic = false, source = null }) {
  const reqId = `save-${charId}-${Date.now()}-${++_counter}`;
  _latestReqId[charId] = reqId;
  _sendUpdate?.(charId, 'saveprompt', { reqId, save, dc, effectName, basic, source });
}

// App → bridge: player tapped Roll on a save prompt.
export async function handleSaveRoll(charId, value) {
  const { reqId } = value || {};
  // Stale-reqId guard.
  if (!reqId || _latestReqId[charId] !== reqId) return;

  const actorMap = getActorMap();
  const actorId  = Object.keys(actorMap).find((k) => actorMap[k] === charId);
  if (!actorId) return;
  const actor = getActorById(actorId);
  if (!actor) return;

  // Retrieve the save type from the prompt that issued this reqId.
  // We need the save type to call rollSave; it was in the prompt payload, but
  // the bridge doesn't store it. The app echoes it back inside the saveroll payload.
  const save = value.save;
  if (!save) return;

  try {
    const { total, degree } = await rollSave(actor, save);
    _sendUpdate?.(charId, 'saveresult', { reqId, total, degree });
  } catch (err) {
    console.error('CNMH Bridge | save roll failed:', err);
  }
}
