// Feature: the dice-tower rail (#1490, S1) — the app delegates raw dice rolls
// to Foundry so the table sees real dice (chat card + Dice So Nice), while the
// app keeps ALL resolution: modifiers, DCs, degrees, damage math, side effects.
//
// The app emits
//   cnmh_rollreq_global = { id, charId, formula, flavor, ts }
// The bridge resolves charId → Foundry actor through the GM-maintained actor
// map (speaker attribution ONLY — the roll is a plain core Roll, no actor
// modifiers) and acks on
//   cnmh_rolldone_global = { id, charId, ok, total, faces, ts }
// faces = [[sides, face], …] per kept die, so the app can extract the raw d20
// for nat-20/nat-1 handling (computeSaveDegree stays the one source of truth).
// A request that cannot roll (bad formula, adapter throw) still acks with
// ok:false so the requesting device falls back to manual entry immediately
// instead of waiting out its timeout.
//
// Dispatch only sees LIVE UPDATEs (FULL_STATE never replays rollreq), so a
// bridge that connects after a request simply misses it — the app's manual d20
// entry remains the fallback (offline sandbox #550 unchanged). All Foundry
// access goes through pf2eAdapter.js.

import { getActorById, rollFormula } from './pf2eAdapter.js';
import { getActorMap } from './encounter.js';
import { RELAY } from './syncKeys.js';

let _sendUpdate = null;

export function initDice(sendUpdate) {
  _sendUpdate = sendUpdate;
}

// A formula longer than this is not a dice expression the app would ever
// compose — refuse it rather than hand arbitrary strings to the Roll parser.
const MAX_FORMULA_LENGTH = 128;

// Reverse actor-map lookup (map is foundryActorId → charId, same linear scan
// as characterSync). Unmapped/absent charId → null → the roll speaks as GM.
function actorForCharId(charId) {
  if (!charId) return null;
  for (const [actorId, cid] of Object.entries(getActorMap() || {})) {
    if (cid === charId) return getActorById(actorId);
  }
  return null;
}

// Called by bridge.js when cnmh_rollreq_global arrives.
export async function handleRollRequest(value) {
  const { id, charId, formula, flavor } = value || {};
  if (!id || typeof formula !== 'string') return;

  let rolled = null;
  if (formula.length <= MAX_FORMULA_LENGTH) {
    try {
      rolled = await rollFormula(formula, {
        actor: actorForCharId(charId),
        flavor: typeof flavor === 'string' ? flavor : '',
      });
    } catch (err) {
      console.error('CNMH Bridge | rollFormula failed:', err);
    }
  }

  const ok = rolled != null && typeof rolled.total === 'number';
  _sendUpdate?.('global', RELAY.ROLLDONE, {
    id,
    charId: charId ?? null,
    ok,
    total: ok ? rolled.total : null,
    faces: ok ? rolled.faces : [],
    ts: Date.now(),
  });
}
