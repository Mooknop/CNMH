import { describe, it, expect } from 'vitest';
import {
  activationOf, computeAmount, activationSummary,
  saveBonusTalisman, maneuverDamageTalisman, checkBonusTalisman,
  hasOutcomeShift, shiftCheckOutcome,
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
const sneakyKey = {
  name: 'Sneaky Key',
  talisman: { affixTo: 'armor', activation: { cost: 1, trigger: 'You attempt to Pick a Lock', effect: { kind: 'check-bonus', skill: 'thievery', bonus: 1, value: 'status', note: 'to Pick a Lock for 1 minute' } } },
};
const mesmerizingOpal = {
  name: 'Mesmerizing Opal',
  talisman: { affixTo: 'armor', activation: { cost: 1, trigger: 'You attempt to Feint', effect: { kind: 'check-bonus', skill: 'deception', successToCrit: true, critFailToFail: true, note: 'to Feint' } } },
};
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
    it('summarizes a check-bonus effect with its rider note (#1093)', () => {
      expect(activationSummary(sneakyKey, str18)).toBe('+1 status to Thievery checks — to Pick a Lock for 1 minute');
    });
    it('summarizes a bonus-less outcome-shift check effect (#1085)', () => {
      expect(activationSummary(mesmerizingOpal, str18))
        .toBe('shift the Deception check outcome one step in your favour — to Feint');
    });
  });

  describe('check outcome shift (#1085)', () => {
    const eff = mesmerizingOpal.talisman.activation.effect;
    it('hasOutcomeShift detects the shift flags', () => {
      expect(hasOutcomeShift(eff)).toBe(true);
      expect(hasOutcomeShift(sneakyKey.talisman.activation.effect)).toBe(false);
      expect(hasOutcomeShift(null)).toBe(false);
    });
    it('upgrades a success to a critical success', () => {
      expect(shiftCheckOutcome('success', eff)).toBe('criticalSuccess');
    });
    it('softens a critical failure to a failure', () => {
      expect(shiftCheckOutcome('criticalFailure', eff)).toBe('failure');
    });
    it('leaves an already-critical success and a plain failure untouched', () => {
      expect(shiftCheckOutcome('criticalSuccess', eff)).toBe('criticalSuccess');
      expect(shiftCheckOutcome('failure', eff)).toBe('failure');
    });
    it('is a no-op without shift flags', () => {
      expect(shiftCheckOutcome('success', sneakyKey.talisman.activation.effect)).toBe('success');
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

  it('checkBonusTalisman finds a matching affixed check-bonus talisman (#1093)', () => {
    expect(checkBonusTalisman([wolfFang, pin, sneakyKey], 'thievery')).toBe(sneakyKey);
    expect(checkBonusTalisman([wolfFang, pin, sneakyKey], 'stealth')).toBeNull();
    expect(checkBonusTalisman(undefined, 'thievery')).toBeNull();
  });
});
