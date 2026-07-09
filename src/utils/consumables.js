// Consumable-item helpers (#217): metadata access, the Use/Drink/Apply verb,
// and the two side-effecting apply functions (healing / catalog effect).
// React-free — accepts hooks' return values as plain arguments, mirroring
// the style of treatWounds.js.

import { newEntryUid } from './uid';
import { RELAY, syncKey } from '../sync/keys';

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

/**
 * The item's `consumable` metadata block, or null when the item isn't a
 * metadata-tagged consumable (scrolls are consumables too, but cast through
 * the spell flow — they carry no `consumable` block).
 * Shape: { kind: 'healing'|'effect', effectId?, durationMinutes?, note? }
 */
export const consumableMeta = (item) => {
  const meta = item?.consumable;
  if (!meta || (meta.kind !== 'healing' && meta.kind !== 'effect')) return null;
  return meta;
};

const VERB_BY_TRAIT = {
  potion:  'Drink',
  elixir:  'Drink',
  mutagen: 'Drink',
  oil:     'Apply',
};

/** Use-button label derived from the item's traits: Drink / Apply / Use. */
export const consumableVerb = (item) => {
  for (const t of item?.traits || []) {
    const verb = VERB_BY_TRAIT[String(t).toLowerCase()];
    if (verb) return verb;
  }
  return 'Use';
};

/** Whether the character has the Godless Healing feat (healing-bonus hint). */
export const hasGodlessHealing = (character) =>
  (character?.feats || []).some((f) => f?.name === 'Godless Healing');

/**
 * Applies a healing consumable: HP up (clamped to max), combat-log line.
 * The player rolls the dice physically and enters the final total.
 *
 * HP writes go through sendUpdate(id, RELAY.HP, value) so the Foundry bridge
 * picks them up (same route as applyTreatWounds).
 *
 * @param {Object}   user       - { id, name, maxHp } — the drinking character
 * @param {string}   itemName
 * @param {number}   amount     - HP entered by the player
 * @param {Function} getState   - (charId, key) => value  (from SessionContext)
 * @param {Function} sendUpdate - (charId, key, value) => void
 * @param {Function} appendLog  - ({ type, charId, text }) => void
 */
export function applyHealingConsumable({ user, itemName, amount, getState, sendUpdate, appendLog }) {
  applyHealing({
    target: user,
    amount,
    getState,
    sendUpdate,
    appendLog,
    logText: `${user.name} used ${itemName} — healed ${amount} HP`,
  });
}

/**
 * Generic HP-up (clamped to max) with a combat-log line — the shared core of
 * healing consumables, Harrow Casting's Shields/Stars suits (#227), and any
 * future player-rolled healing. HP writes go through sendUpdate(id, RELAY.HP, v)
 * so the Foundry bridge picks them up.
 *
 * @param {Object}   target   - { id, name, maxHp? } — the healed character
 * @param {number}   amount   - HP entered by the player (rolled physically)
 * @param {string}   [logText] - full log line; defaults to "<name> healed N HP"
 */
export function applyHealing({ target, amount, getState, sendUpdate, appendLog, logText }) {
  const seedHp = {
    current: target.maxHp || 0,
    max:     target.maxHp || 0,
    temp:    0,
    dying:   0,
    wounded: 0,
    doomed:  0,
  };
  const currentHp = getState(target.id, RELAY.HP) || seedHp;
  const newHp = { ...currentHp, current: Math.min(currentHp.max, currentHp.current + amount) };

  writeLocal(syncKey(RELAY.HP, target.id), newHp);
  sendUpdate(target.id, RELAY.HP, newHp);

  appendLog({
    type:   'action',
    charId: target.id,
    text:   logText || `${target.name} healed ${amount} HP`,
  });
}

/**
 * Applies an effect consumable: adds the catalog effect to the user's effects
 * with an optional game-clock expiry (the expiry sweep clears it), then logs.
 *
 * @param {Object}   user       - { id, name }
 * @param {string}   itemName
 * @param {Object}   meta       - consumableMeta(item); needs effectId
 * @param {number}   [nowSecs]  - current absolute game seconds; with
 *                                meta.durationMinutes set, stamps expireAtSecs
 * @param {Function} getState
 * @param {Function} sendUpdate
 * @param {Function} appendLog
 */
export function applyEffectConsumable({ user, itemName, meta, nowSecs, getState, sendUpdate, appendLog }) {
  const entry = {
    id:        newEntryUid(),
    effectId:  meta.effectId,
    appliedBy: user.id,
    source:    itemName,
    ...(typeof nowSecs === 'number' && meta.durationMinutes
      ? { expireAtSecs: nowSecs + meta.durationMinutes * 60 }
      : {}),
    ts: Date.now(),
  };
  const nextEffects = [...(getState(user.id, 'effects') || []), entry];

  writeLocal(`cnmh_effects_${user.id}`, nextEffects);
  sendUpdate(user.id, 'effects', nextEffects);

  const durationLabel = meta.durationMinutes ? ` (${meta.durationMinutes} min)` : '';
  appendLog({
    type:   'action',
    charId: user.id,
    text:   `${user.name} used ${itemName}${durationLabel}`,
  });
}
