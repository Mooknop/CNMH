// src/utils/spellshapeTransform.js
// Spellshape mechanical transforms (#1001 S1/S2). A chained spellshape may carry
// a `chain.transform` block (how it changes the chained spell) and/or a
// `chain.selfEffect` block (a caster effect it applies on confirm). Pure helpers;
// ChainedSpellSection / UseAbilityModal apply them.
//
// The first transform is an action-cost delta — Quickened Casting reduces the
// chained spell's action cost by 1 (minimum 1). Crucially this changes only the
// action cost paid; the spell's damage/effect tier (keyed off the chosen action
// count) is untouched, matching PF2e: you get the full spell for fewer actions.
//
// transform shape (extensible; unknown keys are ignored here):
//   { actionDelta?: number, minActions?: number, rankDelta?: number, widenArea?: boolean }
//
// `widenArea` (Dragon's Breath, #1055 S4) is the Widen Spell feat's effect — a
// larger area on the chained spell. The app doesn't model area geometry, so this
// is a DISPLAY transform: it computes the widened area string for the cast card.
//
// selfEffect shape (Energy Ablation — resistance to a chosen energy type = the
// chained spell's rank, until the end of your next turn):
//   { effectId?, name?, stat='resistance', amount: 'castRank'|number,
//     choose?: { key, label, options: string[] }, vs?, duration? }
import { buildEffectEntry } from './applyAbility';

/**
 * Apply a spellshape's action-cost delta to the chained spell's action cost.
 * No-op unless `actionCost` is numeric and the transform carries an actionDelta.
 *
 * @param {number|string} actionCost - the chained spell's action cost (numeric;
 *   'reaction'/'free'/non-numeric pass through unchanged)
 * @param {{ actionDelta?: number, minActions?: number }|null} [transform]
 * @returns {number|string} the adjusted action cost
 */
export function applyChainTransform(actionCost, transform) {
  if (typeof actionCost !== 'number') return actionCost;
  if (!transform || typeof transform.actionDelta !== 'number') return actionCost;
  const min = typeof transform.minActions === 'number' ? transform.minActions : 1;
  return Math.max(min, actionCost + transform.actionDelta);
}

/**
 * A short human note describing a transform's effect on cost, or null when it
 * doesn't change the cost. Used for the chained-cast cost hint.
 *
 * @param {number|string} actionCost - the pre-transform (raw) action cost
 * @param {{ actionDelta?: number, minActions?: number }|null} [transform]
 * @returns {string|null}
 */
export function chainTransformCostNote(actionCost, transform) {
  const adjusted = applyChainTransform(actionCost, transform);
  if (adjusted === actionCost) return null;
  const delta = adjusted - actionCost;
  const sign = delta > 0 ? '+' : '−';
  return `Spellshape: ${sign}${Math.abs(delta)} action${Math.abs(delta) === 1 ? '' : 's'} (now ${adjusted})`;
}

/**
 * The rank a chained spell's NUMERIC effects (damage, healing, area, bonuses)
 * are computed at — Heighten treats the spell as `rankDelta` ranks higher for
 * numeric purposes only (`chain.transform.rankDelta`). The rank actually cast
 * (slot spent, counteract/incapacitation) stays the real cast rank. No-op
 * without a numeric rankDelta; never below 0.
 *
 * @param {number} castRank
 * @param {{ rankDelta?: number }|null} [transform]
 * @returns {number}
 */
export function effectiveNumericRank(castRank, transform) {
  const delta = transform && typeof transform.rankDelta === 'number' ? transform.rankDelta : 0;
  return Math.max(0, (Number(castRank) || 0) + delta);
}

/**
 * A note describing a numeric-rank boost, or null when it doesn't change.
 * @param {number} castRank
 * @param {{ rankDelta?: number }|null} [transform]
 * @returns {string|null}
 */
export function chainRankNote(castRank, transform) {
  const eff = effectiveNumericRank(castRank, transform);
  if (eff === (Number(castRank) || 0)) return null;
  const delta = transform.rankDelta;
  return `Spellshape: numeric effects at rank ${eff} (${delta > 0 ? '+' : '−'}${Math.abs(delta)} rank${Math.abs(delta) === 1 ? '' : 's'}, cast/counteract stays rank ${castRank})`;
}

/**
 * The area a spell covers after Widen Spell (#1055 S4). Parses a leading
 * "<n>-foot <shape>" area string and increases the size per PF2e Remaster Widen
 * Spell: bursts/emanations grow +5 ft; cones/lines grow +5 ft when 15 ft or
 * smaller, +10 ft when 20 ft or larger. Returns the rewritten area string, or
 * null when the area can't be parsed (non-standard shapes pass through).
 *
 * @param {string} area - the spell's area (e.g. "15-foot cone")
 * @returns {string|null}
 */
export function widenedArea(area) {
  if (typeof area !== 'string') return null;
  const m = area.match(/(\d+)(\s*-?\s*foot\s+)(cone|line|burst|emanation|radius)/i);
  if (!m) return null;
  const size = parseInt(m[1], 10);
  const shape = m[3].toLowerCase();
  const inc = shape === 'cone' || shape === 'line' ? (size <= 15 ? 5 : 10) : 5;
  return area.replace(m[1] + m[2], `${size + inc}${m[2]}`);
}

/**
 * A note describing a Widen Spell transform's effect on the chained spell's
 * area, or null when the transform doesn't widen. Used for the chained-cast
 * area hint.
 *
 * @param {string} area - the chained spell's area
 * @param {{ widenArea?: boolean }|null} [transform]
 * @returns {string|null}
 */
export function widenAreaNote(area, transform) {
  if (!transform || transform.widenArea !== true) return null;
  const widened = widenedArea(area);
  return widened
    ? `Widen Spell: area ${area} → ${widened}.`
    : 'Widen Spell: the spell affects a larger area.';
}

/**
 * The descriptor a `selfEffect` applies against — the player's choice, else the
 * first offered option, else a fixed `vs`. Null when nothing resolves.
 */
export function selfEffectDescriptor(selfEffect, choice) {
  if (!selfEffect) return null;
  return choice || selfEffect.choose?.options?.[0] || selfEffect.vs || null;
}

/**
 * Build a caster self-effect entry for a spellshape's `chain.selfEffect`, with
 * INLINE parametrized modifiers so a static catalog effect isn't needed — the
 * amount comes from the chained spell's cast rank (`amount: 'castRank'`) and the
 * descriptor from the player's choice. Written to the caster's `cnmh_effects` on
 * confirm; EffectUtils reads the inline modifiers. Returns null when there's no
 * effect to apply (missing config, no descriptor, or a non-positive amount).
 *
 * @returns {Object|null} a stored effects entry ({ id, effectId?, name?, source,
 *   appliedBy, modifiers:[{stat, vs, amount}], expireAt?/expireAtSecs?, ts })
 */
export function buildChainSelfEffect({
  selfEffect, castRank, choice, caster, abilityName, casterEntryId, encounter, nowSecs,
}) {
  if (!selfEffect) return null;
  const amount = selfEffect.amount === 'castRank'
    ? (Number(castRank) || 0)
    : (Number(selfEffect.amount) || 0);
  const vs = selfEffectDescriptor(selfEffect, choice);
  if (!vs || amount <= 0) return null;

  // Reuse the shared duration precedence (minutes → encounter boundary → daily).
  const base = buildEffectEntry({
    eff: { effectId: selfEffect.effectId || undefined, duration: selfEffect.duration || null },
    caster: caster || {},
    abilityName: abilityName || '',
    encounter,
    casterEntryId,
    targetEntryId: casterEntryId,
    nowSecs,
  });

  return {
    ...base,
    modifiers: [{ stat: selfEffect.stat || 'resistance', vs, amount }],
    ...(selfEffect.name ? { name: `${selfEffect.name} (${vs})` } : {}),
  };
}
