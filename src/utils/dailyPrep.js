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
import { staffPrepValue } from './staffPrep';
import { clampSlotAllocation } from './slotSacrifice';
import { unlockRepairs, hasLockedBroken } from './itemBroken';
import { APP, syncKey } from '../sync/keys';

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
  const slots = getState(id, APP.SLOTS);
  if (slots && typeof slots === 'object' && Object.values(slots).some((n) => Number(n) > 0)) {
    resets.push({
      type: 'slots',
      value: Object.fromEntries(Object.keys(slots).map((k) => [k, 0])),
      label: 'spell slots',
    });
  }

  // Focus points — single integer of points spent.
  const focus = getState(id, APP.FOCUS);
  if (Number(focus) > 0) {
    resets.push({ type: 'focus', value: 0, label: 'focus points' });
  }

  // Staff charges — single integer of charges spent.
  const staff = getState(id, APP.STAFF);
  if (Number(staff) > 0) {
    resets.push({ type: 'staff', value: 0, label: 'staff charges' });
  }

  // Wand uses — map of wandKey -> 'available' | 'used' | 'overcharged'.
  const wands = getState(id, APP.WANDS);
  if (wands && typeof wands === 'object' && Object.values(wands).some((s) => s !== 'available')) {
    resets.push({
      type: 'wands',
      value: Object.fromEntries(Object.keys(wands).map((k) => [k, 'available'])),
      label: 'wand uses',
    });
  }

  // Broken items (#957 S4) — daily prep UNLOCKS repair for anything broken
  // (source: "can't be repaired before your next daily preparations"). It does
  // not auto-repair; a Repair action or minimum-rank slot sacrifice clears it.
  const itembroken = getState(id, APP.ITEMBROKEN);
  if (hasLockedBroken(itembroken)) {
    resets.push({ type: 'itembroken', value: unlockRepairs(itembroken), label: 'broken items (repair unlocked)' });
  }

  // Daily ability frequencies — prune per:'day' records from the ledger.
  const freq = getState(id, APP.FREQ);
  if (freq && typeof freq === 'object'
    && Object.values(freq).some((records) => (records || []).some((r) => r.per === 'day'))) {
    resets.push({ type: 'freq', value: pruneLedgerByPer(freq, 'day'), label: 'daily abilities' });
  }

  // Hunt Prey designation (key reserved for #223 — just cleared here).
  const huntprey = getState(id, APP.HUNTPREY);
  if (huntprey) {
    resets.push({ type: 'huntprey', value: null, label: 'Hunt Prey' });
  }

  // Sustained spells (#220) — any lingering sustain ledger is cleared on rest.
  const sustains = getState(id, APP.SUSTAINS);
  if (Array.isArray(sustains) && sustains.length) {
    resets.push({ type: 'sustains', value: [], label: 'sustained spells' });
  }

  // Per-spell counters (#220) — Mirror Image / Bless trackers cleared on rest.
  const spellcounters = getState(id, APP.SPELLCOUNTERS);
  if (Array.isArray(spellcounters) && spellcounters.length) {
    resets.push({ type: 'spellcounters', value: [], label: 'tracked spells' });
  }

  // Stance (#224) — a lingering stance is dropped on rest (you don't wake up
  // mid-stance). Cleared defensively; encounter end is the usual clear path.
  const stance = getState(id, APP.STANCE);
  if (stance?.active) {
    resets.push({ type: 'stance', value: { active: false, name: null, ts: 0 }, label: 'stance' });
  }

  // Harmless Bystander (#226 Slice D) — a leftover declaration is dropped on
  // rest; encounter end is the usual clear path.
  const bystander = getState(id, APP.BYSTANDER);
  if (bystander?.active) {
    resets.push({ type: 'bystander', value: { active: false, mod: null, ts: 0 }, label: 'Harmless Bystander' });
  }

  return resets;
}

// Effects that expire at daily preparations (Mystic/Mage Armor, Light, …) plus
// any clock-immunity already past expiry, opportunistically swept here.
function nextEffects(character, getState, nowSecs) {
  const effects = getState(character?.id, APP.EFFECTS);
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
    currentEldSource: getState(character?.id, APP.ELDATTUNE) || eldSources[0] || null,
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
 * @param {string|null} [staffChoice] - staff to prepare today (#957 S6a): an item
 *   uid to prepare, '' / null to clear, or undefined to refresh the staff already
 *   prepared (the GM party loop passes nothing, so existing staves stay charged).
 * @param {Object} [staffSlots] - rank -> spell slots expended for extra staff
 *   charges (#957 S6b); each adds charges equal to its rank and is spent as if cast.
 * @returns {{ summary: string }}
 */
export function performDailyPrep({ character, getState, sendUpdate, nowSecs, eldChoice, staffChoice, staffSlots }) {
  const id = character?.id;
  const resets = computeResets(character, getState);

  const effectsDrop = nextEffects(character, getState, nowSecs);
  if (effectsDrop) resets.push({ type: 'effects', value: effectsDrop, label: 'daily effects' });

  resets.forEach(({ type, value }) => {
    writeLocal(syncKey(type, id), value);
    sendUpdate(id, type, value);
  });

  // Eld attunement — a daily choice, not a reset. Persist when provided and the
  // character actually has Eld Powers.
  const labels = resets.map((r) => r.label);
  const eldSources = eldSourcesOf(character);
  if (eldChoice && eldSources.includes(eldChoice)) {
    writeLocal(syncKey(APP.ELDATTUNE, id), eldChoice);
    sendUpdate(id, APP.ELDATTUNE, eldChoice);
    labels.push(`attuned to ${eldChoice}`);
  }

  // Staff preparation (#957 S6a) — a daily choice, like Eld attunement. An
  // explicit choice prepares (or clears) a staff; `undefined` (the GM party
  // loop) refreshes whatever staff was prepared so it stays charged.
  // Clamp a requested slot allocation to what the caster actually has of each
  // rank (cantrips/rank 0 never count). Used for BOTH the charge total and the
  // spent-slots write so they can't disagree. Shares the slot-sacrifice
  // clamp primitive (#957 S3); slots were reset above, so maxes == remaining.
  const maxes = character?.spellcasting?.spell_slots || {};

  let nextStaffPrep;
  let expendedForStaff = null; // clamped rank -> slots spent, applied to cnmh_slots below
  if (staffChoice !== undefined) {
    expendedForStaff = staffChoice ? clampSlotAllocation(maxes, staffSlots) : null;
    nextStaffPrep = staffPrepValue(character, staffChoice, expendedForStaff);
  } else {
    const prev = getState(id, APP.STAFFPREP);
    // GM party-loop refresh recomputes base charges only (it can't know the
    // day's slot allocation), so any prior slot bonus is dropped on refresh.
    nextStaffPrep = prev?.staffId ? staffPrepValue(character, prev.staffId) : undefined;
  }
  if (nextStaffPrep !== undefined) {
    writeLocal(syncKey(APP.STAFFPREP, id), nextStaffPrep);
    sendUpdate(id, APP.STAFFPREP, nextStaffPrep);
    // A fresh preparation starts with full charges — clear any spent count.
    writeLocal(syncKey(APP.STAFF, id), 0);
    sendUpdate(id, APP.STAFF, 0);

    // Expend the slots allocated to the staff — spent as if cast. The slot reset
    // above zeroed cnmh_slots, so re-write it with the clamped allocation.
    if (expendedForStaff && Object.values(expendedForStaff).some((n) => n > 0)) {
      writeLocal(syncKey(APP.SLOTS, id), expendedForStaff);
      sendUpdate(id, APP.SLOTS, expendedForStaff);
    }

    if (nextStaffPrep) {
      labels.push(`prepared a staff (${nextStaffPrep.charges} charge${nextStaffPrep.charges !== 1 ? 's' : ''})`);
    }
  }

  const summary = labels.length ? labels.join(', ') : 'nothing to restore';
  return { summary };
}
