// Feature: Active-enemy foe kit (#1531 S1) — the GM Command Dock's enemy-turn
// data feed. Whenever the active combatant is an enemy (no actorMap charId),
// push the actor's full offensive kit (strikes, spellcasting + remaining
// slots/uses, ability items, listed skills) on cnmh_foekit_global; on PC turns
// and combat end push a cleared payload so the dock never renders a stale kit.
//
// The kit rides its own key rather than the encounter blob: it's an order of
// magnitude heavier than the per-combatant defenses/bestiary fields and only
// ever needed for ONE combatant at a time. Persisted (not live-only) so a dock
// refresh mid-enemy-turn recovers without waiting for the next turn change.
//
// Re-pushed on the foe actor's own updateActor and embedded-item hooks so a
// cast spell's consumed slot (or a freshly applied condition) is reflected
// immediately. Pushes are un-debounced like the other geometry/state pushes —
// item bursts during a cast are small and the relay is last-write-wins.

import {
  getActiveCombat, getCombatState, getCombatantActor, getCombatantActorId,
  getOffense, onHook,
} from './pf2eAdapter.js';
import { getActorMap } from './encounter.js';
import { RELAY } from './syncKeys.js';

let _sendUpdate = null;  // injected by bridge.js on init

export function initFoeKit(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;
  onHook('createCombat', ()              => pushFoeKit());
  onHook('deleteCombat', ()              => pushCleared());
  onHook('updateCombat', (_combat, diff) => onUpdateCombat(diff));
  onHook('updateActor',  (actor)         => { if (isActiveFoeActor(actor?.id)) pushFoeKit(); });
  onHook('createItem',   (item)          => onItemHook(item));
  onHook('updateItem',   (item)          => onItemHook(item));
  onHook('deleteItem',   (item)          => onItemHook(item));
}

// Turn/round advancement re-keys the kit; any other combat edit (initiative
// tweak, combatant rename) leaves it untouched — same gate as the actor feed.
function onUpdateCombat(diff) {
  if (diff?.turn === undefined && diff?.round === undefined) return;
  pushFoeKit();
}

// An embedded-item change on the active foe (slot consumption, condition,
// granted effect) refreshes the kit; items on any other actor are ignored.
function onItemHook(item) {
  const parent = item?.parent;
  if (!parent || parent.documentName !== 'Actor') return;
  if (isActiveFoeActor(parent.id)) pushFoeKit();
}

function isActiveFoeActor(actorId) {
  return !!actorId && activeFoe()?.actorId === actorId;
}

// The active combatant, iff it resolves to an enemy actor. A combatant whose
// Foundry actor maps to a PC charId is the app's business (the dock stages the
// player deck for them) — no kit.
function activeFoe() {
  const combat = getActiveCombat();
  if (!combat) return null;
  const { activeCombatantId, combatants } = getCombatState(combat);
  if (!activeCombatantId) return null;
  // combatants is a Foundry Collection in Foundry and a plain array in tests;
  // both expose .find.
  const combatant = combatants?.find?.((c) => c.id === activeCombatantId) ?? null;
  if (!combatant) return null;
  const actorId = getCombatantActorId(combatant);
  const charId = actorId ? (getActorMap()[actorId] ?? null) : null;
  if (charId) return null;
  const actor = getCombatantActor(combatant);
  if (!actor) return null;
  return { entryId: activeCombatantId, actorId, actor };
}

// Push the current state — a kit when an enemy is acting, cleared otherwise.
// Also called by bridge.js on socket open so a reconnect mid-enemy-turn is fresh.
export function pushFoeKit() {
  const foe = activeFoe();
  if (!foe) {
    pushCleared();
    return;
  }
  _sendUpdate?.('global', RELAY.FOEKIT, {
    entryId:        foe.entryId,
    foundryActorId: foe.actorId,
    kit:            getOffense(foe.actor),
    ts:             Date.now(),
  });
}

function pushCleared() {
  _sendUpdate?.('global', RELAY.FOEKIT, {
    entryId: null, foundryActorId: null, kit: null, ts: Date.now(),
  });
}
