// src/utils/dailyPrep.js
// Unified daily preparations (#219). One pass restores a character's daily
// resources — spell slots, focus points, staff charges, wand uses, daily
// ability frequencies — clears the Hunt Prey designation, expires
// until-daily-prep effects, and records the chosen Eld attunement.
//
// React-free: takes getState / sendUpdate as arguments (the applyAbility /
// treatWounds pattern) so the same logic drives the player modal and the GM
// party-wide loop. Resets only pools that are actually "dirty" (something was
// spent / used), so martials and full-pool casters write nothing and the log
// summary stays meaningful.
import { pruneLedgerByPer } from './frequency';

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

const eldSourcesOf = (character) => {
  const eld = character?.spellcasting?.eldPowers || character?.eldPowers || [];
  return eld.map((e) => e.source).filter(Boolean);
};

// Compute the set of resets this character needs right now. Each reset carries
// the synced state `type`, the value to write, and a human label for the log /
// checklist. Pure — reads current state via getState only.
function computeResets(character, getState) {
  const id = character?.id;
  const resets = [];

  // Spell slots — map of rank -> spent count.
  const slots = getState(id, 'slots');
  if (slots && typeof slots === 'object' && Object.values(slots).some((n) => Number(n) > 0)) {
    resets.push({
      type: 'slots',
      value: Object.fromEntries(Object.keys(slots).map((k) => [k, 0])),
      label: 'spell slots',
    });
  }

  // Focus points — single integer of points spent.
  const focus = getState(id, 'focus');
  if (Number(focus) > 0) {
    resets.push({ type: 'focus', value: 0, label: 'focus points' });
  }

  // Staff charges — single integer of charges spent.
  const staff = getState(id, 'staff');
  if (Number(staff) > 0) {
    resets.push({ type: 'staff', value: 0, label: 'staff charges' });
  }

  // Wand uses — map of wandKey -> 'available' | 'used' | 'overcharged'.
  const wands = getState(id, 'wands');
  if (wands && typeof wands === 'object' && Object.values(wands).some((s) => s !== 'available')) {
    resets.push({
      type: 'wands',
      value: Object.fromEntries(Object.keys(wands).map((k) => [k, 'available'])),
      label: 'wand uses',
    });
  }

  // Daily ability frequencies — prune per:'day' records from the ledger.
  const freq = getState(id, 'freq');
  if (freq && typeof freq === 'object'
    && Object.values(freq).some((records) => (records || []).some((r) => r.per === 'day'))) {
    resets.push({ type: 'freq', value: pruneLedgerByPer(freq, 'day'), label: 'daily abilities' });
  }

  // Hunt Prey designation (key reserved for #223 — just cleared here).
  const huntprey = getState(id, 'huntprey');
  if (huntprey) {
    resets.push({ type: 'huntprey', value: null, label: 'Hunt Prey' });
  }

  // Sustained spells (#220) — any lingering sustain ledger is cleared on rest.
  const sustains = getState(id, 'sustains');
  if (Array.isArray(sustains) && sustains.length) {
    resets.push({ type: 'sustains', value: [], label: 'sustained spells' });
  }

  // Per-spell counters (#220) — Mirror Image / Bless trackers cleared on rest.
  const spellcounters = getState(id, 'spellcounters');
  if (Array.isArray(spellcounters) && spellcounters.length) {
    resets.push({ type: 'spellcounters', value: [], label: 'tracked spells' });
  }

  // Stance (#224) — a lingering stance is dropped on rest (you don't wake up
  // mid-stance). Cleared defensively; encounter end is the usual clear path.
  const stance = getState(id, 'stance');
  if (stance?.active) {
    resets.push({ type: 'stance', value: { active: false, name: null, ts: 0 }, label: 'stance' });
  }

  return resets;
}

// Effects that expire at daily preparations (Mystic/Mage Armor, Light, …) plus
// any clock-immunity already past expiry, opportunistically swept here.
function nextEffects(character, getState, nowSecs) {
  const effects = getState(character?.id, 'effects');
  if (!Array.isArray(effects) || effects.length === 0) return null;
  const kept = effects.filter((e) => {
    if (e.expireOnDailyPrep === true) return false;
    if (typeof e.expireAtSecs === 'number' && nowSecs != null && e.expireAtSecs <= nowSecs) return false;
    return true;
  });
  return kept.length === effects.length ? null : kept;
}

/**
 * Describe what a daily-prep pass would do for this character — drives the
 * modal checklist and the Eld attunement picker.
 * @returns {{ resets: Array, hasEld: boolean, eldSources: string[], currentEldSource: string|null }}
 */
export function dailyPrepPlanFor(character, getState) {
  const eldSources = eldSourcesOf(character);
  const effectsDrop = nextEffects(character, getState, null);
  const resets = computeResets(character, getState);
  if (effectsDrop) resets.push({ type: 'effects', value: effectsDrop, label: 'daily effects' });
  return {
    resets,
    hasEld: eldSources.length > 0,
    eldSources,
    currentEldSource: getState(character?.id, 'eldattune') || eldSources[0] || null,
  };
}

/**
 * Run daily preparations for a character. Writes every dirty pool back through
 * sendUpdate (+ localStorage), applies the Eld attunement choice when given,
 * and returns a one-line human summary for the session log.
 *
 * @param {Object}   character  - resolved character (needs id + spellcasting/eldPowers)
 * @param {Function} getState   - (charId, key) => value
 * @param {Function} sendUpdate - (charId, key, value) => void
 * @param {number}   [nowSecs]  - current game seconds (sweeps expired immunities too)
 * @param {string}   [eldChoice]- chosen Eld attunement source (synced when provided)
 * @returns {{ summary: string }}
 */
export function performDailyPrep({ character, getState, sendUpdate, nowSecs, eldChoice }) {
  const id = character?.id;
  const resets = computeResets(character, getState);

  const effectsDrop = nextEffects(character, getState, nowSecs);
  if (effectsDrop) resets.push({ type: 'effects', value: effectsDrop, label: 'daily effects' });

  resets.forEach(({ type, value }) => {
    writeLocal(`cnmh_${type}_${id}`, value);
    sendUpdate(id, type, value);
  });

  // Eld attunement — a daily choice, not a reset. Persist when provided and the
  // character actually has Eld Powers.
  const labels = resets.map((r) => r.label);
  const eldSources = eldSourcesOf(character);
  if (eldChoice && eldSources.includes(eldChoice)) {
    writeLocal(`cnmh_eldattune_${id}`, eldChoice);
    sendUpdate(id, 'eldattune', eldChoice);
    labels.push(`attuned to ${eldChoice}`);
  }

  const summary = labels.length ? labels.join(', ') : 'nothing to restore';
  return { summary };
}
