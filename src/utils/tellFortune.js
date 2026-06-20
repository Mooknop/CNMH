// Tell Fortune (#578) — pure rules, React-free.
//
// Jade spends 1 hour telling a creature's fortune: a Fortune-Telling Lore check
// against a HARD DC of the target's level produces the effects of augury on a
// success. Regardless of the result, the target is then immune to her Tell
// Fortune for 1 week. The immunity reuses the shared ability-immunity engine
// (utils/immunity.js), so the clock/expiry sweep clears it automatically.

import { makeImmunityEntry, hasAbilityImmunity } from './immunity';

export const TELL_FORTUNE_ABILITY_KEY = 'tell-fortune';
export const TELL_FORTUNE_NAME = 'Tell Fortune';
export const TELL_FORTUNE_IMMUNITY_SECS = 604800; // 1 week

// PF2e level-based DC table (Core Rulebook), levels 0–25. Tell Fortune applies
// the HARD adjustment (+2). Mirrors InventoryUtils.getLevelBasedDc (which only
// spans 1–20 and returns 0 out of range) but covers the full creature-level
// range so a level-0 or high-level target never collapses to a bogus DC.
const LEVEL_DC = [
  14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30,
  31, 32, 34, 35, 36, 38, 39, 40, 41, 42, 44, 46, 48,
];
const HARD_ADJUSTMENT = 2;

const clampLevel = (lvl) => Math.max(0, Math.min(25, Math.round(Number(lvl) || 0)));

/** Hard DC for a creature of the given level (level-based DC + 2). */
export function hardDcForLevel(level) {
  return LEVEL_DC[clampLevel(level)] + HARD_ADJUSTMENT;
}

// Augury reading by degree of success.
//   reading  — whether the GM gives the caster a woe / weal / both / nothing answer
//   reliable — whether that answer can be trusted (false on a misleading reading)
const OUTCOMES = {
  criticalSuccess: { reading: true,  reliable: true,  label: 'Critical Success', note: 'A clear augury — the GM gives a reliable reading.' },
  success:         { reading: true,  reliable: true,  label: 'Success',          note: 'Augury — the GM gives a woe / weal / both / nothing reading.' },
  failure:         { reading: false, reliable: false, label: 'Failure',          note: 'No useful reading.' },
  criticalFailure: { reading: true,  reliable: false, label: 'Critical Failure', note: 'A misleading reading — the GM may give false information.' },
};

/** The augury result for a degree of success (unknown degrees read as failure). */
export function auguryOutcome(degree) {
  return OUTCOMES[degree] || OUTCOMES.failure;
}

/** Is the target already immune to THIS caster's Tell Fortune? */
export function isTellFortuneImmune(targetEffects, casterId, nowSecs) {
  return hasAbilityImmunity(targetEffects, {
    abilityKey: TELL_FORTUNE_ABILITY_KEY,
    casterId,
    scope: 'per-caster',
    nowSecs,
  });
}

/**
 * The 1-week per-caster immunity entry to stamp on the target after a reading.
 * Applied regardless of the degree of success (the feat says "regardless of the
 * result, the creature is then immune ... for 1 week").
 */
export function tellFortuneImmunityEntry(casterId, nowSecs) {
  return makeImmunityEntry({
    abilityKey: TELL_FORTUNE_ABILITY_KEY,
    abilityName: TELL_FORTUNE_NAME,
    casterId,
    nowSecs,
    durationSecs: TELL_FORTUNE_IMMUNITY_SECS,
  });
}

// ── Caster-side immunity ledger ────────────────────────────────────────────
// The caster owns one ledger (cnmh_tellfortune_<casterId>) mapping a target key
// to the immunity entry they last stamped. This works uniformly for party PCs
// (keyed by their id) and arbitrary GM-named creatures (keyed by name slug),
// which have no effects store of their own. The gate reuses isTellFortuneImmune
// on the single stored entry.

/** Ledger key for a GM-named creature target. */
export function creatureKey(name) {
  return `creature:${String(name || '').trim().toLowerCase().replace(/\s+/g, '-')}`;
}

/** True if the caster's ledger blocks re-reading this target right now. */
export function ledgerBlocks(ledger, targetKey, casterId, nowSecs) {
  if (!targetKey) return false;
  return isTellFortuneImmune([ledger?.[targetKey]].filter(Boolean), casterId, nowSecs);
}

/** Drop expired entries (housekeeping on each write). */
export function pruneTellFortuneLedger(ledger, nowSecs) {
  const out = {};
  for (const [key, entry] of Object.entries(ledger || {})) {
    if (entry && typeof entry.expireAtSecs === 'number' && entry.expireAtSecs > nowSecs) {
      out[key] = entry;
    }
  }
  return out;
}
