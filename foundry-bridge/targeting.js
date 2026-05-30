// Feature: combat-action targeting (Slice 2 substrate).
//
// The app emits cnmh_action_<charId> = { kind, sourceUid, targets:[entryId], ts }
// when a player aims an action at one or more encounter entries. The bridge
// resolves each entryId (a combatant id) to its placed token and sets the
// current user's target set in Foundry, so the GM's canvas highlights who's
// being aimed at. No rolls are initiated here — this only establishes targeting;
// strike/save resolution arrives in later slices.
//
// All Foundry access goes through pf2eAdapter.js.
import { resolveCombatantToken, setUserTargets } from './pf2eAdapter.js';

// Called by bridge.js when cnmh_action_<charId> arrives.
export function handleAction(_charId, value) {
  const entryIds = Array.isArray(value?.targets) ? value.targets : [];
  const tokens = entryIds
    .map((id) => resolveCombatantToken(id))
    .filter(Boolean);
  setUserTargets(tokens);
}
