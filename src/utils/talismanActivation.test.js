import { describe, it, expect } from 'vitest';
import {
  activationOf, computeAmount, activationSummary,
  saveBonusTalisman, maneuverDamageTalisman,
} from './talismanActivation';

const wolfFang = {
  name: 'Wolf Fang',
  talisman: { affixTo: 'weapon', activation: { cost: 'free', trigger: 'You successfully Trip a creature', effect: { kind: 'damage', amount: 'str-mod', damageType: 'bludgeoning', onManeuver: 'trip' } } },
};
const pin = {
  name: 'Sanitizing Pin',
  talisman: { affixTo: 'armor', activation: { cost: 'reaction', trigger: 'A save vs an affliction', effect: { kind: 'save-bonus', save: 'fortitude', bonus: 2, value: 'status', critFailToFail: true } } },
};
const plainTalisman = { name: 'Plain', talisman: { affixTo: 'weapon', activation: { cost: 'free', trigger: 'Some trigger' } } };
const str18 = { abilities: { strength: 18 } }; // +4

describe('talismanActivation (#254/#339)', () => {
  it('activationOf returns the block or null', () => {
    expect(activationOf(wolfFang).cost).toBe('free');
    expect(activationOf({ name: 'x' })).toBeNull();
  });

  describe('computeAmount', () => {
    it('resolves str-mod from the actor', () => {
      expect(computeAmount({ amount: 'str-mod' }, str18)).toBe(4);
    });
    it('passes a numeric amount through and defaults unknown to 0', () => {
      expect(computeAmount({ amount: 3 }, str18)).toBe(3);
      expect(computeAmount({ amount: 'mystery' }, str18)).toBe(0);
    });
  });

  describe('activationSummary', () => {
    it('summarizes a damage effect with the computed number', () => {
      expect(activationSummary(wolfFang, str18)).toBe('deal 4 bludgeoning');
    });
    it('summarizes a save-bonus effect with the crit-fail clause', () => {
      expect(activationSummary(pin, str18)).toBe('+2 status to Fortitude save; critical failure becomes failure');
    });
    it('falls back to the trigger for an effect-less / unknown activation', () => {
      expect(activationSummary(plainTalisman, str18)).toBe('Some trigger');
    });
  });

  it('saveBonusTalisman finds a matching affixed save-bonus talisman', () => {
    expect(saveBonusTalisman([wolfFang, pin], 'fortitude')).toBe(pin);
    expect(saveBonusTalisman([wolfFang, pin], 'reflex')).toBeNull();
    expect(saveBonusTalisman([wolfFang], 'fortitude')).toBeNull();
  });

  it('maneuverDamageTalisman finds a damage talisman for the maneuver', () => {
    expect(maneuverDamageTalisman([wolfFang, pin], 'trip')).toBe(wolfFang);
    expect(maneuverDamageTalisman([wolfFang, pin], 'grapple')).toBeNull();
  });
});
