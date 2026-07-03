// Talisman activation (#254/#339 — slice 2 of the talisman flow).
//
// A talisman, once affixed, is *activated* in response to a trigger, which
// consumes it. Activation is metadata-driven so unique talismans only need data:
//
//   talisman.activation = {
//     cost: 'free'|'reaction'|<number>,
//     trigger: '<reminder text>',
//     effect:
//       { kind: 'damage',      amount: 'str-mod', damageType: 'bludgeoning', onManeuver: 'trip' }
//     | { kind: 'save-bonus',  save: 'fortitude', bonus: 2, value: 'status', critFailToFail: true }
//     | { kind: 'check-bonus', skill: 'thievery', bonus: 1, value: 'status', note: '<rider text>' }
//   }
//
// React-free; the consume/unaffix writes live in affix.js (deactivateTalisman).
import { getAbilityModifier } from './CharacterUtils';

const SAVE_LABELS = { fortitude: 'Fortitude', reflex: 'Reflex', will: 'Will' };

/** The activation block of a talisman, or null. */
export const activationOf = (item) => item?.talisman?.activation || null;

/**
 * Numeric value of an effect amount. 'str-mod' resolves the actor's Strength
 * modifier; a number passes through; anything else is 0.
 */
export const computeAmount = (effect, character) => {
  const amt = effect?.amount;
  if (typeof amt === 'number') return amt;
  if (amt === 'str-mod') return getAbilityModifier(character?.abilities?.strength ?? 10);
  return 0;
};

/** Human-readable summary of what activating the talisman does (with numbers). */
export const activationSummary = (item, character) => {
  const act = activationOf(item);
  const effect = act?.effect;
  if (effect?.kind === 'damage') {
    return `deal ${computeAmount(effect, character)} ${effect.damageType || ''}`.trim();
  }
  if (effect?.kind === 'save-bonus') {
    const save = SAVE_LABELS[effect.save] || effect.save || '';
    const sign = effect.bonus >= 0 ? `+${effect.bonus}` : `${effect.bonus}`;
    return `${sign} ${effect.value || ''} to ${save} save`.replace(/\s+/g, ' ').trim()
      + (effect.critFailToFail ? '; critical failure becomes failure' : '');
  }
  if (effect?.kind === 'check-bonus') {
    const skill = effect.skill
      ? effect.skill.charAt(0).toUpperCase() + effect.skill.slice(1)
      : '';
    const sign = effect.bonus >= 0 ? `+${effect.bonus}` : `${effect.bonus}`;
    return `${sign} ${effect.value || ''} to ${skill} checks`.replace(/\s+/g, ' ').trim()
      + (effect.note ? ` — ${effect.note}` : '');
  }
  return act?.trigger || 'Activate';
};

/** First affixed talisman whose effect adds a bonus to the given save. */
export const saveBonusTalisman = (affixedTalismans, save) =>
  (Array.isArray(affixedTalismans) ? affixedTalismans : []).find((t) => {
    const e = activationOf(t)?.effect;
    return e?.kind === 'save-bonus' && e.save === save;
  }) || null;

/** First affixed talisman whose effect adds a bonus to checks with a skill (#1093). */
export const checkBonusTalisman = (affixedTalismans, skill) =>
  (Array.isArray(affixedTalismans) ? affixedTalismans : []).find((t) => {
    const e = activationOf(t)?.effect;
    return e?.kind === 'check-bonus' && e.skill === skill;
  }) || null;

/** First affixed talisman whose effect deals damage triggered by a maneuver. */
export const maneuverDamageTalisman = (affixedTalismans, maneuverId) =>
  (Array.isArray(affixedTalismans) ? affixedTalismans : []).find((t) => {
    const e = activationOf(t)?.effect;
    return e?.kind === 'damage' && e.onManeuver === maneuverId;
  }) || null;
