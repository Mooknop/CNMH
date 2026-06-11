// src/utils/immunity.js
// Target immunity timers (#218). Some abilities make a target immune to further
// use for a fixed real-world duration (Guidance 1 hour, Battle Medicine 1 day,
// Tell Fortune 1 week, Disrupting Performance 1 minute). We stamp a generic
// immunity effect onto the target carrying an absolute game-seconds expiry
// (expireAtSecs) the clock sweep can evaluate — the same shape Treat Wounds
// immunity uses today, but self-expiring instead of GM-removed by hand.
import { newEntryUid } from './uid';

export const ABILITY_IMMUNITY_EFFECT_ID = 'ability-immunity';

const UNIT_SECS = {
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
};

/**
 * Read an ability's declarative immunity config.
 * Shape: immunity: { duration: { value, unit }, scope?: 'any'|'per-caster' }.
 * @returns {{ durationSecs: number, scope: string }|null}
 */
export function immunityConfigFor(ability) {
  const imm = ability?.immunity;
  if (!imm || !imm.duration) return null;
  const { value, unit } = imm.duration;
  const unitSecs = UNIT_SECS[unit];
  const n = Number(value);
  if (!unitSecs || !Number.isFinite(n) || n <= 0) return null;
  return {
    durationSecs: n * unitSecs,
    scope: imm.scope === 'per-caster' ? 'per-caster' : 'any',
  };
}

/**
 * Build an immunity effect entry to stamp on a target.
 * @returns {object} effect entry with absolute game-seconds expiry
 */
export function makeImmunityEntry({ abilityKey, abilityName, casterId, nowSecs, durationSecs }) {
  return {
    id:           newEntryUid(),
    effectId:     ABILITY_IMMUNITY_EFFECT_ID,
    abilityKey,
    appliedBy:    casterId,
    source:       abilityName,
    expireAtSecs: nowSecs + durationSecs,
    ts:           Date.now(),
  };
}

/**
 * Is the target currently immune to this ability?
 * Matches by abilityKey; 'per-caster' scope additionally requires the same
 * caster. Entries already past their expiry are ignored (the sweep clears them
 * eventually, but this keeps the check correct in the gap before it runs).
 */
export function hasAbilityImmunity(targetEffects, { abilityKey, casterId, scope = 'any', nowSecs }) {
  return (targetEffects || []).some((e) => {
    if (e.effectId !== ABILITY_IMMUNITY_EFFECT_ID) return false;
    if (e.abilityKey !== abilityKey) return false;
    if (scope === 'per-caster' && e.appliedBy !== casterId) return false;
    if (typeof e.expireAtSecs === 'number' && nowSecs != null && e.expireAtSecs <= nowSecs) return false;
    return true;
  });
}
