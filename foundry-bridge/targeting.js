// Feature: combat-action targeting (Slice 2 substrate).
//
// The app emits cnmh_action_<charId> = { kind, sourceUid, targets:[entryId], ts }
// when a player aims an action at one or more encounter entries. The bridge:
//   1. Resolves each entryId → token and sets Foundry's user target set.
//   2. For melee strikes, checks the latest flanked state to annotate which
//      targets are flanked by this attacker (off-guard: true). The annotation is
//      available for downstream roll resolution in Slice 4+.
//
// All Foundry access goes through pf2eAdapter.js.
import { resolveCombatantToken, setUserTargets } from './pf2eAdapter.js';
import { getLatestFlankedState } from './flankingPush.js';

// Called by bridge.js when cnmh_action_<charId> arrives.
// Returns an array of resolved { entryId, token, offGuard } for use by future
// slices — the return value is intentionally surfaced so callers can extend it.
export function handleAction(charId, value) {
  const entryIds  = Array.isArray(value?.targets) ? value.targets : [];
  const isMelee   = value?.kind === 'strike' || value?.kind == null;
  const flanked   = isMelee ? (getLatestFlankedState() ?? {}) : {};

  const resolved = entryIds.map((id) => {
    const token   = resolveCombatantToken(id);
    const offGuard = !!(flanked[id]?.byCharIds?.includes(charId));
    return { entryId: id, token, offGuard };
  });

  const tokens = resolved.map((r) => r.token).filter(Boolean);
  setUserTargets(tokens);

  return resolved;
}
