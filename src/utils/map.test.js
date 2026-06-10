import { hasTrait, isAttackAbility, isAgile, mapStepFor, mapPenaltyFor } from './map';

describe('map (Multiple Attack Penalty helpers)', () => {
  describe('hasTrait', () => {
    it('matches traits case-insensitively', () => {
      expect(hasTrait({ traits: ['Attack', 'Unarmed'] }, 'attack')).toBe(true);
      expect(hasTrait({ traits: ['agile'] }, 'Agile')).toBe(true);
    });

    it('returns false for missing traits or malformed abilities', () => {
      expect(hasTrait({ traits: ['Fire'] }, 'Attack')).toBe(false);
      expect(hasTrait({}, 'Attack')).toBe(false);
      expect(hasTrait(null, 'Attack')).toBe(false);
    });
  });

  describe('isAttackAbility / isAgile', () => {
    it('detects the Attack trait', () => {
      expect(isAttackAbility({ traits: ['Attack'] })).toBe(true);
      expect(isAttackAbility({ traits: ['Move'] })).toBe(false);
    });

    it('detects the Agile trait', () => {
      expect(isAgile({ traits: ['Attack', 'Agile'] })).toBe(true);
      expect(isAgile({ traits: ['Attack'] })).toBe(false);
    });
  });

  describe('mapStepFor', () => {
    it('clamps attacks made to the 0–2 step range', () => {
      expect(mapStepFor(0)).toBe(0);
      expect(mapStepFor(1)).toBe(1);
      expect(mapStepFor(2)).toBe(2);
      expect(mapStepFor(5)).toBe(2);
      expect(mapStepFor(undefined)).toBe(0);
    });
  });

  describe('mapPenaltyFor', () => {
    const strike = { traits: ['Attack'] };
    const agileStrike = { traits: ['Attack', 'Agile'] };

    it('returns −5/−10 for non-agile attacks', () => {
      expect(mapPenaltyFor(strike, 0)).toBe(0);
      expect(mapPenaltyFor(strike, 1)).toBe(-5);
      expect(mapPenaltyFor(strike, 2)).toBe(-10);
    });

    it('returns −4/−8 for agile attacks', () => {
      expect(mapPenaltyFor(agileStrike, 1)).toBe(-4);
      expect(mapPenaltyFor(agileStrike, 2)).toBe(-8);
    });

    it('clamps the step', () => {
      expect(mapPenaltyFor(strike, 7)).toBe(-10);
      expect(mapPenaltyFor(strike, -1)).toBe(0);
    });
  });
});
