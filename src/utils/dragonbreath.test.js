import { describe, it, expect } from 'vitest';
import {
  DRAGONBREATH_TIERS,
  isDragonbreath,
  dragonbreathMeta,
  impliedFundamentals,
  dragonbreathRunes,
  dragonKind,
  dragonbreathName,
  dragonbreathDisplayName,
  dragonbreathStrikeDamageType,
  dragonbreathBreath,
  nextDragonbreathTier,
  dragonbreathUpgradePrice,
  BREATH_EMANATION_FT,
} from './dragonbreath';
import { resolveWeapon, propertySlotCapacity } from './weaponRunes';

const entry = (dragonbreath, property) => ({
  name: 'Longsword',
  dragonbreath,
  ...(property ? { runes: { property } } : {}),
});

describe('dragonbreath spine', () => {
  describe('dragonbreathMeta / isDragonbreath', () => {
    it('normalizes a valid template block', () => {
      expect(dragonbreathMeta(entry({ tier: 'greater', dragonType: 'Mirage' }))).toEqual({
        tier: 'greater',
        dragonType: 'Mirage',
      });
      expect(isDragonbreath(entry({ tier: 'base', dragonType: 'Red' }))).toBe(true);
    });

    it('defaults a missing tier to base and lowercases it', () => {
      expect(dragonbreathMeta({ dragonbreath: { dragonType: 'Red' } }).tier).toBe('base');
      expect(dragonbreathMeta({ dragonbreath: { tier: 'GREATER' } }).tier).toBe('greater');
    });

    it('is null for a non-template entry or an unknown tier', () => {
      expect(dragonbreathMeta({ name: 'Longsword' })).toBeNull();
      expect(dragonbreathMeta({ dragonbreath: { tier: 'legendary' } })).toBeNull();
      expect(isDragonbreath({})).toBe(false);
    });
  });

  describe('impliedFundamentals', () => {
    it('locks each tier to its potency + striking grade', () => {
      expect(impliedFundamentals('base')).toEqual({ potency: 1, striking: 'striking' });
      expect(impliedFundamentals('greater')).toEqual({ potency: 2, striking: 'greater' });
      expect(impliedFundamentals('major')).toEqual({ potency: 3, striking: 'major' });
      expect(impliedFundamentals('nope')).toBeNull();
    });
  });

  describe('dragonbreathRunes', () => {
    it('injects the tier fundamentals and carries property runes through', () => {
      const runes = dragonbreathRunes(entry({ tier: 'greater', dragonType: 'Mirage' }, [{ name: 'Vitalizing' }]));
      expect(runes).toEqual({ potency: 2, striking: 'greater', property: [{ name: 'Vitalizing' }] });
    });

    it('locks fundamentals to the tier, ignoring stray potency/striking on the entry', () => {
      const e = { name: 'Longsword', dragonbreath: { tier: 'base', dragonType: 'Red' }, runes: { potency: 3, striking: 'major', property: [] } };
      expect(dragonbreathRunes(e)).toEqual({ potency: 1, striking: 'striking', property: [] });
    });

    it('resolves through weaponRunes so Strike dice scale by tier', () => {
      const base = { name: 'Longsword', damage: '1d8' };
      expect(resolveWeapon(base, dragonbreathRunes(entry({ tier: 'base', dragonType: 'Red' }))).damage).toBe('2d8');
      expect(resolveWeapon(base, dragonbreathRunes(entry({ tier: 'greater', dragonType: 'Red' }))).damage).toBe('3d8');
      expect(resolveWeapon(base, dragonbreathRunes(entry({ tier: 'major', dragonType: 'Red' }))).damage).toBe('4d8');
      expect(resolveWeapon(base, dragonbreathRunes(entry({ tier: 'greater', dragonType: 'Red' }))).potencyBonus).toBe(2);
      // property-slot capacity == potency tier
      expect(propertySlotCapacity(dragonbreathRunes(entry({ tier: 'major', dragonType: 'Red' })))).toBe(3);
      expect(propertySlotCapacity(dragonbreathRunes(entry({ tier: 'base', dragonType: 'Red' })))).toBe(1);
    });

    it('is null for a non-template entry', () => {
      expect(dragonbreathRunes({ name: 'Longsword' })).toBeNull();
    });
  });

  describe('dragonKind', () => {
    it('reads creature and planar dragon damage types, case-insensitively', () => {
      expect(dragonKind('Red').damageTypes).toEqual(['fire']);
      expect(dragonKind('umbral').damageTypes).toEqual(['void']);
      expect(dragonKind('Mirage').damageTypes).toEqual(['force', 'mental']);
      expect(dragonKind('adamantine').damageTypes).toEqual(['bludgeoning', 'fire']);
    });

    it('is null for an unauthored or empty kind', () => {
      expect(dragonKind('Rainbow')).toBeNull();
      expect(dragonKind('')).toBeNull();
    });
  });

  describe('dragonbreathName', () => {
    it('omits the tier word at base tier', () => {
      expect(dragonbreathName({ tier: 'base', dragonType: 'Mirage', base: 'Longsword' }))
        .toBe('Mirage Dragonbreath Longsword');
    });

    it('inserts the tier word and prepends property runes in order', () => {
      expect(dragonbreathName({ tier: 'greater', dragonType: 'Mirage', properties: ['Vitalizing'], base: 'Longsword' }))
        .toBe('Vitalizing Greater Mirage Dragonbreath Longsword');
      expect(dragonbreathName({ tier: 'major', dragonType: 'red', properties: ['Keen', 'Flaming'], base: 'Greataxe' }))
        .toBe('Keen Flaming Major Red Dragonbreath Greataxe');
    });

    it('derives the name from an entry + base weapon name', () => {
      const e = entry({ tier: 'greater', dragonType: 'Mirage' }, [{ name: 'Vitalizing' }]);
      expect(dragonbreathDisplayName(e, 'Longsword')).toBe('Vitalizing Greater Mirage Dragonbreath Longsword');
    });

    it('falls back to the base name for a non-template entry', () => {
      expect(dragonbreathDisplayName({ name: 'Longsword' }, 'Longsword')).toBe('Longsword');
    });
  });

  describe('dragonbreathStrikeDamageType', () => {
    it('confers a single-option kind damage type automatically', () => {
      expect(dragonbreathStrikeDamageType(entry({ tier: 'base', dragonType: 'Red' }))).toBe('fire');
      expect(dragonbreathStrikeDamageType(entry({ tier: 'major', dragonType: 'umbral' }))).toBe('void');
    });

    it('leaves a multi-option kind unset unless an explicit choice is recorded', () => {
      expect(dragonbreathStrikeDamageType(entry({ tier: 'base', dragonType: 'Mirage' }))).toBeNull();
      expect(dragonbreathStrikeDamageType({ dragonbreath: { tier: 'base', dragonType: 'Mirage', damageType: 'mental' } })).toBe('mental');
    });

    it('is null for a non-template entry or unauthored kind', () => {
      expect(dragonbreathStrikeDamageType({ name: 'Longsword' })).toBeNull();
      expect(dragonbreathStrikeDamageType(entry({ tier: 'base', dragonType: 'Rainbow' }))).toBeNull();
    });
  });

  describe('dragonbreathBreath', () => {
    it('derives dice/DC/cone by tier plus a 5-ft emanation and kind damage', () => {
      expect(dragonbreathBreath(entry({ tier: 'base', dragonType: 'Red' }))).toEqual({
        dice: '4d6', dc: 23, coneFt: 15, emanationFt: BREATH_EMANATION_FT,
        frequency: 'once per minute', damageTypes: ['fire'], save: 'Reflex',
      });
      expect(dragonbreathBreath(entry({ tier: 'greater', dragonType: 'Mirage' }))).toMatchObject({
        dice: '6d6', dc: 27, coneFt: 30, damageTypes: ['force', 'mental'],
      });
      expect(dragonbreathBreath(entry({ tier: 'major', dragonType: 'Red' }))).toMatchObject({
        dice: '8d6', dc: 35, coneFt: 60,
      });
    });

    it('carries an empty damageTypes for an unauthored dragon kind', () => {
      expect(dragonbreathBreath(entry({ tier: 'base', dragonType: 'Rainbow' })).damageTypes).toEqual([]);
    });

    it('is null for a non-template entry', () => {
      expect(dragonbreathBreath({ name: 'Longsword' })).toBeNull();
    });
  });

  describe('tier upgrades', () => {
    it('walks base → greater → major and stops at the top', () => {
      expect(nextDragonbreathTier('base')).toBe('greater');
      expect(nextDragonbreathTier('greater')).toBe('major');
      expect(nextDragonbreathTier('major')).toBeNull();
    });

    it('prices an upgrade as the difference of tier prices', () => {
      expect(dragonbreathUpgradePrice('base', 'greater')).toBe(2450);
      expect(dragonbreathUpgradePrice('greater', 'major')).toBe(67700);
      expect(dragonbreathUpgradePrice('base', 'major')).toBe(DRAGONBREATH_TIERS.major.price - DRAGONBREATH_TIERS.base.price);
    });

    it('is null for a non-upgrade (same or lower tier) or unknown tier', () => {
      expect(dragonbreathUpgradePrice('greater', 'base')).toBeNull();
      expect(dragonbreathUpgradePrice('major', 'major')).toBeNull();
      expect(dragonbreathUpgradePrice('base', 'legendary')).toBeNull();
    });
  });
});
