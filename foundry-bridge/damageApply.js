// Feature: apply typed damage from the app's damage step to Foundry actors (#1016).
//
// The app emits cnmh_dmgapply_global = { id, sourceName, hits:[{ entryId, name,
// amount, type, instances? }], ts } after a damage result is confirmed
// (UseAbilityModal / RequestedSaves — enemy targets only). The bridge:
//   1. Resolves each entryId → combatant token → actor.
//   2. Applies the RAW typed total via applyTypedDamage — PF2e's applyDamage
//      nets the target's IWR (immunities/weaknesses/resistances) itself, so
//      the app never pre-nets and nothing double-applies. A hit carrying
//      `instances: [{ amount, type }]` (#1019 — a piercing sword with a
//      flaming rune) goes through applyDamageInstances instead: ONE
//      multi-instance DamageRoll so PF2e nets IWR per instance within a
//      single application.
//   3. Acks on cnmh_dmgdone_global = { id, sourceName, applied[], failed[], ts };
//      the GM client mirrors that into the encounter log (useDamageRelayAck).
//
// Dispatch only sees LIVE UPDATEs (FULL_STATE never replays dmgapply), so a
// bridge that connects after a confirm simply misses it — no stale re-applies.
// All Foundry access goes through pf2eAdapter.js.

import { resolveCombatantToken, applyTypedDamage, applyDamageInstances } from './pf2eAdapter.js';
import { RELAY } from './syncKeys.js';

let _sendUpdate = null;

export function initDamageApply(sendUpdate) {
  _sendUpdate = sendUpdate;
}

// Called by bridge.js when cnmh_dmgapply_global arrives.
export async function handleDamageApply(value) {
  const { id, sourceName, hits } = value || {};
  if (!Array.isArray(hits) || hits.length === 0) return;

  const applied = [];
  const failed = [];
  for (const hit of hits) {
    const { entryId, name, amount, type, instances } = hit || {};
    const token = entryId ? resolveCombatantToken(entryId) : null;
    // Negative amounts are healing (#1537 S4 — the dock's quick heal);
    // zero / non-numeric stays a failure.
    if (!token?.actor || typeof amount !== 'number' || amount === 0 || Number.isNaN(amount)) {
      failed.push({ entryId: entryId ?? null, name: name || '' });
      continue;
    }
    const multi = Array.isArray(instances) && instances.length > 0;
    try {
      if (multi) {
        await applyDamageInstances(token, instances);
      } else {
        await applyTypedDamage(token, amount, type || '');
      }
      applied.push({
        entryId, name: token.actor.name || name || '', amount, type: type || '',
        ...(multi ? { instances } : {}),
      });
    } catch (err) {
      console.error('CNMH Bridge | applyTypedDamage failed:', err);
      failed.push({ entryId, name: name || '' });
    }
  }

  _sendUpdate?.('global', RELAY.DMGDONE, {
    id: id ?? null,
    sourceName: sourceName || '',
    applied,
    failed,
    ts: Date.now(),
  });
}
