// src/utils/partySweep.js
// GM encounter-end sweep (#230, #1677). THE encounter-end cleanup path: the
// dock-format migration (#1556) retired the surface that called useEncounter's
// endEncounter, so the GM's "End-encounter sweep" button (PartyPanel) is what
// actually ends a fight — usable mid-session or after the fact. Per character
// it resets turn-scoped combat state (turn economy, shield, stance, aura,
// Hunt Prey, sustains, Harmless Bystander, playing, Lingering Composition) and
// expires encounter-scoped effects (turn/round-bound durations); clock-based
// immunities (expireAtSecs) and manually-applied effects are kept. The
// once-per-sweep globals — the encounter record itself, Recall Knowledge
// pruning, persistent damage, enemy fx, summons — live in
// performEncounterGlobalSweep below.
//
// React-free: takes getState / sendUpdate (the dailyPrep / applyAbility
// pattern) so the same logic drives a per-character call and the party loop.
// Only writes state that's actually dirty, so the log summary stays meaningful.
import { defaultTurnState } from '../hooks/useTurnState';
import { isEncounterScopedEffect } from './EffectUtils';
import { pruneEncounterKnowledge } from './recallKnowledge';
import { defaultEncounter } from './encounterUtils';
import { RELAY, APP, GLOBAL_ID, syncKey, globalKey } from '../sync/keys';

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

// Compute the combat-state resets this character needs right now. Each carries
// the synced `type`, the value to write, and a human label for the log.
function computeCombatResets(character, getState) {
  const id = character?.id;
  const resets = [];

  const turn = getState(id, APP.TURNSTATE);
  if (turn && (turn.actionsSpent || turn.attacksMade || turn.reactionSpent || turn.hasStartedFirstTurn
    || (turn.actionsLog || []).length)) {
    resets.push({ type: 'turnstate', value: defaultTurnState(), label: 'turn economy' });
  }

  const shield = getState(id, RELAY.SHIELDRAISE);
  if (shield?.raised) {
    resets.push({ type: 'shieldraise', value: { raised: false, ts: 0 }, label: 'raised shield' });
  }

  const stance = getState(id, APP.STANCE);
  if (stance?.active) {
    resets.push({ type: 'stance', value: { active: false, name: null, ts: 0 }, label: 'stance' });
  }

  const aura = getState(id, APP.AURA);
  if (aura?.active) {
    resets.push({ type: 'aura', value: { active: false, ts: 0 }, label: 'aura' });
  }

  const huntprey = getState(id, APP.HUNTPREY);
  if (huntprey) {
    resets.push({ type: 'huntprey', value: null, label: 'Hunt Prey' });
  }

  const sustains = getState(id, APP.SUSTAINS);
  if (Array.isArray(sustains) && sustains.length) {
    resets.push({ type: 'sustains', value: [], label: 'sustained spells' });
  }

  // Harmless Bystander is declared per-encounter (#226 Slice D) — drop the
  // flag so it doesn't carry into the next fight or onto the sheet.
  const bystander = getState(id, APP.BYSTANDER);
  if (bystander?.active) {
    resets.push({ type: APP.BYSTANDER, value: { active: false, mod: null, ts: 0 }, label: 'Harmless Bystander' });
  }

  // The playing state is turn-bound (#935) — no turns outside an encounter,
  // so the performance lapses when the fight ends.
  const playing = getState(id, APP.PLAYING);
  if (playing?.active) {
    resets.push({ type: APP.PLAYING, value: { active: false, ts: 0 }, label: 'playing state' });
  }

  // A pending Lingering Composition extension (#226-B) that never got spent on
  // a composition shouldn't survive into the next encounter.
  const lingering = getState(id, APP.LINGERING);
  if (lingering) {
    resets.push({ type: APP.LINGERING, value: null, label: 'Lingering Composition' });
  }

  return resets;
}

// Drop effects anchored to the encounter: turn/round-bound ones (they carry an
// `expireAt`) plus catalog-flagged `encounterScoped` states like eld-charged
// (#275). Manual effects (no expiry) and clock-based immunities (`expireAtSecs`)
// survive the sweep.
function expireEncounterEffects(character, getState) {
  const effects = getState(character?.id, APP.EFFECTS);
  if (!Array.isArray(effects) || effects.length === 0) return null;
  const kept = effects.filter((e) => !isEncounterScopedEffect(e));
  return kept.length === effects.length ? null : kept;
}

/**
 * Run an encounter-end sweep for a single character. Writes each dirty combat
 * state back through sendUpdate (+ localStorage) and returns a one-line human
 * summary for the session log.
 *
 * @param {Object}   character  - resolved character (needs id)
 * @param {Function} getState   - (charId, key) => value
 * @param {Function} sendUpdate - (charId, key, value) => void
 * @returns {{ summary: string, changed: number }}
 */
export function performEncounterSweep({ character, getState, sendUpdate }) {
  const id = character?.id;
  const resets = computeCombatResets(character, getState);

  const effectsDrop = expireEncounterEffects(character, getState);
  if (effectsDrop) resets.push({ type: 'effects', value: effectsDrop, label: 'encounter effects' });

  resets.forEach(({ type, value }) => {
    writeLocal(syncKey(type, id), value);
    sendUpdate(id, type, value);
  });

  const labels = resets.map((r) => r.label);
  return {
    summary: labels.length ? labels.join(', ') : 'nothing to clear',
    changed: resets.length,
  };
}

// Does the shared encounter record hold anything worth resetting? Field-by-field
// against defaultEncounter()'s idle shape, so a sweep over an already-idle
// record stays a no-op (same dirty-only ethos as the per-character resets).
const encounterIsDirty = (enc) =>
  !!enc && (
    enc.active
    || (enc.phase || 'idle') !== 'idle'
    || (enc.round || 0) !== 0
    || (enc.order || []).length > 0
    || (enc.log || []).length > 0
    || (enc.saveRequests || []).length > 0
    || (enc.saveResolutions || []).length > 0
    || (enc.armedPayloads || []).length > 0
  );

/**
 * Run the once-per-sweep half of the encounter-end cleanup: the shared globals
 * that used to be reset by useEncounter's endEncounter (#1677). Call it once
 * after the per-character performEncounterSweep loop, not per character.
 *
 * Clears, when dirty:
 *  - cnmh_encounter_global  → defaultEncounter() (order, log, save requests /
 *    resolutions, armed payloads — the whole record; actorMap is kept)
 *  - cnmh_knowledge_global  → pruneEncounterKnowledge: creatureKey-keyed
 *    records persist for the campaign, this fight's ephemeral entryId-keyed
 *    records drop, and per-character crit-fail locks reset (#333). Pruning
 *    reads the RAW synced order — an actorMap-unresolved PC entry can land in
 *    the ephemeral set, but RK records only ever exist for real enemies, so
 *    the extra key is a no-op.
 *  - cnmh_persistent_global → {} (tracked persistent damage, #272)
 *  - cnmh_enemyfx_global    → {} (enemy conditions + immunity timers, #260)
 *  - cnmh_summons_global    → [] (GM-added summons, #261)
 *
 * @param {Function} getState   - (charId, key) => value
 * @param {Function} sendUpdate - (charId, key, value) => void
 * @returns {{ summary: string, changed: number }}
 */
export function performEncounterGlobalSweep({ getState, sendUpdate }) {
  const cleared = [];
  const write = (type, value, label) => {
    writeLocal(globalKey(type), value);
    sendUpdate(GLOBAL_ID, type, value);
    cleared.push(label);
  };

  const encounter = getState(GLOBAL_ID, RELAY.ENCOUNTER);
  const order = encounter?.order || [];
  if (encounterIsDirty(encounter)) {
    write(RELAY.ENCOUNTER, defaultEncounter(), 'encounter record');
  }

  const knowledge = getState(GLOBAL_ID, APP.KNOWLEDGE);
  if (knowledge && Object.keys(knowledge).length) {
    write(APP.KNOWLEDGE, pruneEncounterKnowledge(knowledge, order), 'Recall Knowledge locks');
  }

  const persistent = getState(GLOBAL_ID, APP.PERSISTENT);
  if (persistent && Object.keys(persistent).length) {
    write(APP.PERSISTENT, {}, 'persistent damage');
  }

  const enemyFx = getState(GLOBAL_ID, APP.ENEMYFX);
  if (enemyFx && Object.keys(enemyFx).length) {
    write(APP.ENEMYFX, {}, 'enemy conditions');
  }

  const summons = getState(GLOBAL_ID, APP.SUMMONS);
  if (Array.isArray(summons) && summons.length) {
    write(APP.SUMMONS, [], 'summons');
  }

  return {
    summary: cleared.length ? cleared.join(', ') : 'nothing to clear',
    changed: cleared.length,
  };
}
