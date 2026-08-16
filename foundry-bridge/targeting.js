// Feature: combat-action targeting (Slice 2 substrate).
//
// The app emits cnmh_action_<charId> = { kind, sourceUid, targets:[entryId], ts }
// when a player aims an action at one or more encounter entries. The bridge:
//   1. Resolves each entryId → token.
//   2. Sets Foundry's user target set — but ONLY for the combatant whose turn
//      it is (see the gate below).
//   3. For melee strikes, checks the latest flanked state to annotate which
//      targets are flanked by this attacker (off-guard: true). The annotation is
//      available for downstream roll resolution in Slice 4+.
//
// THE ACTIVE-COMBATANT GATE (#1749 OQ-3 ruling)
// setUserTargets writes ONE user's target set — `game.user`, and the bridge
// runs on the GM client, so that is the GM's canvas. There is exactly one of
// those and any number of players deliberating at once, so an ungated write
// means two players silently overwrite each other's aim on the shared canvas.
// The ruling: any player may target in the app at any time, but the canvas is
// only written for the ACTIVE combatant. Non-active writes still resolve and
// still return their array — the app-local preview path is untouched — they
// just never touch Foundry. Genuinely per-player target sets would need a
// Foundry user account per player, which this table does not have; that is
// ledgered out of scope, not solved here.
//
// Nothing ever cleared the target set before (a stale aim persisted on the GM
// canvas until someone else wrote), so initTargeting also clears on every turn
// change: the turn that owns the canvas is the turn that owns the targets.
//
// All Foundry access goes through pf2eAdapter.js.
import { resolveCombatantToken, setUserTargets, onHook } from './pf2eAdapter.js';
import { getLatestFlankedState } from './flankingPush.js';
import { getActiveEntryId } from './encounter.js';
import { resolveMoverId } from './movement.js';

// The active entryId as of the last combat hook, so a change can be detected.
let _lastActiveEntryId = null;

// Registered by bridge.js on ready. Combat hooks are the only seam that can
// tell a turn change from a same-turn re-push, and encounter.js already
// listens on all three — this mirrors them rather than reaching into it.
export function initTargeting() {
  _lastActiveEntryId = getActiveEntryId();
  onHook('createCombat', () => onCombatChanged());
  onHook('updateCombat', () => onCombatChanged());
  onHook('deleteCombat', () => onCombatChanged());
}

// Test seam: reset the remembered turn without registering hooks again.
export function _resetTargeting() {
  _lastActiveEntryId = null;
}

function onCombatChanged() {
  const activeEntryId = getActiveEntryId();
  if (activeEntryId === _lastActiveEntryId) return;  // same turn, re-pushed
  _lastActiveEntryId = activeEntryId;
  // A new combatant is up (or combat ended): the previous player's aim is no
  // longer what the canvas should be showing.
  setUserTargets([]);
}

// Is this charId the combatant whose turn it is? charId arrives in whichever
// of the three id spaces the app uses (PC charId, minion `<owner>-<role>`,
// combat entryId for a GM-dock-driven foe), so the comparison runs through
// resolveMoverId — the same token→id walk the movement rail uses, in the same
// precedence — rather than assuming one of them.
function isActiveCombatant(charId) {
  if (!charId) return false;
  const activeEntryId = getActiveEntryId();
  if (!activeEntryId) return false;
  // An entryId acting directly (the GM dock driving a foe's turn) matches
  // without needing a placed token at all.
  if (charId === activeEntryId) return true;
  const token = resolveCombatantToken(activeEntryId);
  return !!token && resolveMoverId(token) === charId;
}

// Called by bridge.js when cnmh_action_<charId> arrives.
// Returns an array of resolved { entryId, token, offGuard } for use by future
// slices — the return value is intentionally surfaced so callers can extend it,
// and it is returned whether or not the canvas write happened.
export function handleAction(charId, value) {
  const entryIds  = Array.isArray(value?.targets) ? value.targets : [];
  const isMelee   = value?.kind === 'strike' || value?.kind == null;
  const flanked   = isMelee ? (getLatestFlankedState() ?? {}) : {};

  const resolved = entryIds.map((id) => {
    const token   = resolveCombatantToken(id);
    const offGuard = !!(flanked[id]?.byCharIds?.includes(charId));
    return { entryId: id, token, offGuard };
  });

  if (isActiveCombatant(charId)) {
    setUserTargets(resolved.map((r) => r.token).filter(Boolean));
  }

  return resolved;
}
