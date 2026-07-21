// Feature: native NPC strike execution (#1531 S3) — the GM Command Dock's
// strike rail. The dock's enemy pane emits
//   cnmh_strikereq_global = { id, entryId, actionIndex, variant, damage?,
//                             targets?, ts }
// where entryId is the acting enemy combatant, actionIndex the strike's index
// in the foe kit, variant the MAP step (0|1|2), and damage 'roll'|'critical'
// for the damage buttons. targets (optional, app entryIds) pre-set the GM
// client's Foundry target set so the chat card carries the target and PF2e
// computes the degree natively.
//
// Acks on cnmh_strikedone_global = { id, ok, mode, total, faces, degree, ts }.
// ok:false = immediate "read Foundry chat instead" — the pane shows a fallback
// note; nothing app-side depends on the ack (resolution is native, #1490's
// stat-parity doctrine doesn't apply to NPCs). Dispatch only sees LIVE UPDATEs
// (FULL_STATE never replays strikereq). All Foundry access via pf2eAdapter.js.

import {
  resolveCombatantActor, resolveCombatantToken, setUserTargets,
  rollStrikeVariant, rollStrikeDamage,
} from './pf2eAdapter.js';
import { RELAY } from './syncKeys.js';

let _sendUpdate = null;

export function initStrikes(sendUpdate) {
  _sendUpdate = sendUpdate;
}

// Called by bridge.js when cnmh_strikereq_global arrives.
export async function handleStrikeRequest(value) {
  const { id, entryId, actionIndex, variant = 0, damage = null, targets } = value || {};
  if (!id) return;  // nothing to correlate an ack to

  const ack = (extra) =>
    _sendUpdate?.('global', RELAY.STRIKEDONE, { id, ...extra, ts: Date.now() });

  const actor = entryId ? resolveCombatantActor(entryId) : null;
  if (!actor || !Number.isInteger(actionIndex)) {
    ack({ ok: false });
    return;
  }

  // Pre-set targets only when the app picked some — an absent/empty list
  // leaves whatever the GM has targeted in Foundry alone.
  if (Array.isArray(targets) && targets.length) {
    setUserTargets(targets.map((t) => resolveCombatantToken(t)).filter(Boolean));
  }

  try {
    const result = damage
      ? await rollStrikeDamage(actor, actionIndex, damage === 'critical')
      : await rollStrikeVariant(actor, actionIndex, variant);
    if (!result) {
      ack({ ok: false });
      return;
    }
    ack({ ok: true, mode: damage || 'attack', ...result });
  } catch (err) {
    console.error('CNMH Bridge | strike roll failed:', err);
    ack({ ok: false });
  }
}
