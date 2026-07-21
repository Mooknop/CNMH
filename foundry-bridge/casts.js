// Feature: native NPC spellcasting (#1531 S4) — the GM Command Dock's cast
// rail. The dock's enemy pane emits
//   cnmh_castreq_global = { id, entryId, entryItemId, spellId, rank, ts }
// where entryId is the acting enemy combatant, entryItemId the spellcasting
// entry, and spellId the spell to cast (heightened to `rank` when present).
//
// The bridge invokes SpellcastingEntryPF2e#cast — chat card + REAL resource
// consumption (slot / innate use) in Foundry, per the v1 decision that
// Foundry owns NPC resources. The foekit re-push triggered by the resulting
// item update refreshes the pane's remaining counts; the ack only feeds the
// pane's read-out line.
//
// Acks on cnmh_castdone_global = { id, ok, name?, rank?, ts }. ok:false =
// "cast it from the Foundry sheet instead". Dispatch only sees LIVE UPDATEs
// (FULL_STATE never replays castreq). All Foundry access via pf2eAdapter.js.

import { resolveCombatantActor, castActorSpell } from './pf2eAdapter.js';
import { RELAY } from './syncKeys.js';

let _sendUpdate = null;

export function initCasts(sendUpdate) {
  _sendUpdate = sendUpdate;
}

// Called by bridge.js when cnmh_castreq_global arrives.
export async function handleCastRequest(value) {
  const { id, entryId, entryItemId, spellId, rank = null } = value || {};
  if (!id) return;  // nothing to correlate an ack to

  const ack = (extra) =>
    _sendUpdate?.('global', RELAY.CASTDONE, { id, ...extra, ts: Date.now() });

  const actor = entryId ? resolveCombatantActor(entryId) : null;
  if (!actor || !entryItemId || !spellId) {
    ack({ ok: false });
    return;
  }

  try {
    const result = await castActorSpell(actor, entryItemId, spellId, rank);
    if (!result) {
      ack({ ok: false });
      return;
    }
    ack({ ok: true, ...result });
  } catch (err) {
    console.error('CNMH Bridge | spell cast failed:', err);
    ack({ ok: false });
  }
}
