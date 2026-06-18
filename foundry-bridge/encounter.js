// Feature 1: Encounter sync — Foundry combat ↔ app TurnTrackerPanel.
//
// Foundry is the sole authority for combat lifecycle. This module watches
// combat hooks and pushes full encounter snapshots to the session relay as
// { characterId: 'global', key: 'encounter', value: <encounter object> }.
//
// Turn advancement: when the app sends cnmh_turncmd_global = { action:'next-turn' },
// this module calls combat.nextTurn() in Foundry, which triggers updateCombat and
// pushes the updated state back down.

import { BRIDGE_UPDATE_FLAG } from './utils.js';
import {
  getCombatantActorId, getCombatantInitiative, getCombatantActor, getDefenses,
  getBestiaryInfo,
  getCombatById, getActiveCombat, advanceCombatTurn, getCombatState,
  setMultipleInitiatives, rollNpcInitiatives, startCombat,
} from './pf2eAdapter.js';
import { initTokenImages, resolveTokenUrl, ensureTokenUploaded } from './tokenImages.js';

let _sendUpdate    = null;  // injected by bridge.js on init
let _activeCombatId = null;  // stored on createCombat/updateCombat for reliable lookup

// Actor map received from the app via cnmh_actormap_global.
// Shape: { [foundryActorId]: cnmhCharId }
// The app is the authoritative owner; the bridge just reads it for belt-and-suspenders
// resolution so pushes are already correct before the app re-derives them.
let _actorMap = {};

export function updateActorMap(map) {
  _actorMap = map || {};
}

export function getActorMap() {
  return _actorMap;
}

export function initEncounter(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;
  initTokenImages();

  Hooks.on('createCombat',    (combat)             => { _activeCombatId = combat.id; pushEncounterState(combat); });
  Hooks.on('deleteCombat',    ()                   => { _activeCombatId = null;     pushIdleState(); });
  Hooks.on('createCombatant', (combatant)          => pushEncounterState(combatant.combat));
  Hooks.on('deleteCombatant', (combatant)          => pushEncounterState(combatant.combat));
  Hooks.on('updateCombat',    (combat, diff, opts) => { _activeCombatId = combat.id; onUpdateCombat(combat, diff, opts); });
}

// Handle incoming relay message addressed to 'global'/'encounter' channel.
// The bridge calls this when it sees cnmh_turncmd_global arrive.
export async function handleTurnCommand(value) {
  if (value?.action !== 'next-turn') return;
  // Prefer the stored combat ID over the active combat — the active combat can be
  // null if the GM navigated to a different scene while combat is still running.
  const combat = (_activeCombatId ? getCombatById(_activeCombatId) : null) ?? getActiveCombat();
  if (!combat) return;
  await advanceCombatTurn(combat);
}

// Commit app-collected initiatives into Foundry and start the encounter (#495).
// value = { rolls: [{ entryId, initiative }], rollNpcs }.
// The executor primitive: write each PC's initiative, roll the NPCs, start combat.
// No detection logic here — anything that sends the command triggers it (Slice 3
// adds the "all players rolled" gate). The resulting updateCombat hooks re-push the
// now-in-progress encounter via the existing path, so no extra push is needed here.
export async function handleInitCommit(value) {
  const combat = (_activeCombatId ? getCombatById(_activeCombatId) : null) ?? getActiveCombat();
  if (!combat) return;
  // Idempotent: a resent command must not double-start an already-running combat.
  if (getCombatState(combat).started) return;

  // Map the app's { entryId, initiative, statistic? } rolls to PF2e SetInitiativeData
  // and write them all in one batched call (single relay push). statistic is passed
  // through when present so a later slice can carry the rolling stat; absent today.
  const rolls = Array.isArray(value?.rolls) ? value.rolls : [];
  const initiatives = rolls
    .filter(({ entryId, initiative }) => entryId && typeof initiative === 'number')
    .map(({ entryId, initiative, statistic }) => ({
      id: entryId,
      value: initiative,
      ...(statistic ? { statistic } : {}),
    }));
  if (initiatives.length) await setMultipleInitiatives(combat, initiatives);

  if (value?.rollNpcs) await rollNpcInitiatives(combat);

  await startCombat(combat);
}

function onUpdateCombat(combat, diff, opts) {
  if (opts?.[BRIDGE_UPDATE_FLAG]) return;  // echo guard
  pushEncounterState(combat);
}

function pushEncounterState(combat) {
  if (!combat) return;
  const value = buildEncounterPayload(combat);
  _sendUpdate?.('global', 'encounter', value);
}

// Re-push the live combat — used as the callback when an enemy's token image
// finishes uploading, so the refreshed payload carries the now-resolved URL.
function repushActiveEncounter() {
  const combat = (_activeCombatId ? getCombatById(_activeCombatId) : null) ?? getActiveCombat();
  if (combat) pushEncounterState(combat);
}

function pushIdleState() {
  _sendUpdate?.('global', 'encounter', {
    active: false,
    phase:  'idle',
    round:  0,
    currentTurnIndex: 0,
    order:  [],
    log:    [],
    foundryCombatId: null,
  });
}

function buildEncounterPayload(combat) {
  const { active, started, round, combatants, activeCombatantId } = getCombatState(combat);

  let phase = 'idle';
  if (active && !started) phase = 'setup';
  if (active && started)  phase = 'in-progress';
  if (!active && round > 0) phase = 'ended';

  const order = combatants.map((c) => {
    const foundryActorId = getCombatantActorId(c);
    // Primary resolution: use the app-maintained actormap (set by GM in GmEncounter).
    const charId = foundryActorId ? (_actorMap[foundryActorId] ?? null) : null;
    const actor    = getCombatantActor(c);
    const defenses = actor ? getDefenses(actor) : undefined;
    const isEnemy  = !charId;
    const bestiary = (isEnemy && actor) ? getBestiaryInfo(actor) : undefined;
    // Replace the raw Foundry-relative img with a stable app URL (uploading the
    // bytes on first sighting). Emit null until resolved — never the raw path,
    // which would 404 against the app's origin (#394).
    if (bestiary && bestiary.img) {
      const rawImg = bestiary.img;
      bestiary.img = resolveTokenUrl(rawImg);
      if (bestiary.img === null) {
        ensureTokenUploaded(rawImg, repushActiveEncounter);
      }
    }
    return {
      entryId:       c.id,
      kind:          charId ? 'pc' : 'enemy',
      name:          c.name,
      initiative:    getCombatantInitiative(c),
      foundryActorId,
      ...(charId    ? { charId }    : {}),
      ...(defenses  ? { defenses }  : {}),
      ...(bestiary  ? { bestiary }  : {}),
      ...(bestiary?.creatureKey ? { creatureKey: bestiary.creatureKey } : {}),
    };
  });

  // Keep initiative order consistent with how Foundry sorted them.
  const sortedOrder = [...order].sort((a, b) => {
    const ai = a.initiative ?? -Infinity;
    const bi = b.initiative ?? -Infinity;
    return bi - ai;
  });

  // Map Foundry's turn index to the sorted order index.
  const currentTurnIndex = activeCombatantId
    ? sortedOrder.findIndex((e) => e.entryId === activeCombatantId)
    : 0;

  return {
    active,
    phase,
    round,
    currentTurnIndex: Math.max(0, currentTurnIndex),
    order:            sortedOrder,
    log:              [],  // log is app-side only; don't clobber
    foundryCombatId:  combat.id,
  };
}
