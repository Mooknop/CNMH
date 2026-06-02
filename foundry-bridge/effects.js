// Feature: apply Foundry effect items from the app (Slice B).
//
// The app emits cnmh_applyeffect_<charId> = { ref, op:'apply', targets:[entryId], source, ts }
// when a player uses an ability that has a foundryEffect config. The bridge:
//   1. Resolves each entryId → token → actor.
//   2. Calls applyEffectByUuid to clone the compendium item onto the actor,
//      producing the effect icon/aura visible in Foundry.
//
// Apply-only: removal is left to Foundry's own effect duration or manual GM removal.
// All Foundry access goes through pf2eAdapter.js.

import { resolveCombatantToken, applyEffectByUuid } from './pf2eAdapter.js';

// Called by bridge.js when cnmh_applyeffect_<charId> arrives.
export async function handleApplyEffect(charId, value) {
  const { ref, targets } = value || {};
  if (!ref || !Array.isArray(targets)) return;

  for (const entryId of targets) {
    const token = resolveCombatantToken(entryId);
    if (!token?.actor) continue;
    try {
      await applyEffectByUuid(token.actor, ref);
    } catch (err) {
      console.error('CNMH Bridge | applyEffectByUuid failed:', err);
    }
  }
}
