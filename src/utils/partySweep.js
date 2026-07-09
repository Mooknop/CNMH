// src/utils/partySweep.js
// GM encounter-end sweep (#230). The encounter tracker's endEncounter clears
// sustains/stances when a fight is ended through it; this is the GM-initiated
// equivalent for the party dashboard — usable mid-session or after the fact —
// that resets every PC's turn-scoped combat state and expires encounter-scoped
// effects (turn/round-bound durations). Clock-based immunities (expireAtSecs)
// and manually-applied effects are kept.
//
// React-free: takes getState / sendUpdate (the dailyPrep / applyAbility
// pattern) so the same logic drives a per-character call and the party loop.
// Only writes state that's actually dirty, so the log summary stays meaningful.
import { defaultTurnState } from '../hooks/useTurnState';
import { isEncounterScopedEffect } from './EffectUtils';
import { RELAY } from '../sync/keys';

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

// Compute the combat-state resets this character needs right now. Each carries
// the synced `type`, the value to write, and a human label for the log.
function computeCombatResets(character, getState) {
  const id = character?.id;
  const resets = [];

  const turn = getState(id, 'turnstate');
  if (turn && (turn.actionsSpent || turn.attacksMade || turn.reactionSpent || turn.hasStartedFirstTurn
    || (turn.actionsLog || []).length)) {
    resets.push({ type: 'turnstate', value: defaultTurnState(), label: 'turn economy' });
  }

  const shield = getState(id, RELAY.SHIELDRAISE);
  if (shield?.raised) {
    resets.push({ type: 'shieldraise', value: { raised: false, ts: 0 }, label: 'raised shield' });
  }

  const stance = getState(id, 'stance');
  if (stance?.active) {
    resets.push({ type: 'stance', value: { active: false, name: null, ts: 0 }, label: 'stance' });
  }

  const aura = getState(id, 'aura');
  if (aura?.active) {
    resets.push({ type: 'aura', value: { active: false, ts: 0 }, label: 'aura' });
  }

  const huntprey = getState(id, 'huntprey');
  if (huntprey) {
    resets.push({ type: 'huntprey', value: null, label: 'Hunt Prey' });
  }

  const sustains = getState(id, 'sustains');
  if (Array.isArray(sustains) && sustains.length) {
    resets.push({ type: 'sustains', value: [], label: 'sustained spells' });
  }

  return resets;
}

// Drop effects anchored to the encounter: turn/round-bound ones (they carry an
// `expireAt`) plus catalog-flagged `encounterScoped` states like eld-charged
// (#275). Manual effects (no expiry) and clock-based immunities (`expireAtSecs`)
// survive the sweep.
function expireEncounterEffects(character, getState) {
  const effects = getState(character?.id, 'effects');
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
    writeLocal(`cnmh_${type}_${id}`, value);
    sendUpdate(id, type, value);
  });

  const labels = resets.map((r) => r.label);
  return {
    summary: labels.length ? labels.join(', ') : 'nothing to clear',
    changed: resets.length,
  };
}
