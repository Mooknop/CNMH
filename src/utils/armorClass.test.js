import { describe, it, expect } from 'vitest';
import { BASE_AC, findWornArmor, deriveArmorClass } from './armorClass';

const armor = (over = {}) => ({ category: 'light', acBonus: 2, dexCap: 3, ...over });

describe('armorClass', () => {
  describe('findWornArmor', () => {
    it('returns null when nothing worn is armor', () => {
      expect(findWornArmor([])).toBeNull();
      expect(findWornArmor([{ name: 'Torch', state: 'worn' }])).toBeNull();
      expect(findWornArmor(null)).toBeNull();
    });

    it('picks the worn armor entry', () => {
      const a = { name: 'Full Plate', state: 'worn', armor: armor({ category: 'heavy', acBonus: 6 }) };
      expect(findWornArmor([{ name: 'Dagger', state: 'held1' }, a])).toBe(a);
    });

    it('ignores armor that is stowed, dropped, or held', () => {
      const stowed = { name: 'Spare', state: 'stowed', armor: armor() };
      const dropped = { name: 'Dropped', state: 'dropped', armor: armor() };
      const held = { name: 'Carried', state: 'held2', armor: armor() };
      expect(findWornArmor([stowed, dropped, held])).toBeNull();
    });

    it('treats a missing state as worn (the default placement)', () => {
      const a = { name: 'Leather', armor: armor() };
      expect(findWornArmor([a])).toBe(a);
    });

    it('best base AC bonus wins when more than one armor is worn', () => {
      const light = { name: 'Leather', state: 'worn', armor: armor({ acBonus: 1 }) };
      const heavy = { name: 'Plate', state: 'worn', armor: armor({ category: 'heavy', acBonus: 6 }) };
      expect(findWornArmor([light, heavy])).toBe(heavy);
    });
  });

  describe('deriveArmorClass', () => {
    it('unarmored: 10 + proficiency + uncapped Dex', () => {
      expect(deriveArmorClass({ armor: null, dexMod: 4, proficiencyBonus: 3 })).toBe(BASE_AC + 3 + 4);
    });

    it('armored: 10 + proficiency + capped Dex + item bonus', () => {
      // Dex +4 but cap 1 → contributes only +1.
      const dt = deriveArmorClass({
        armor: { category: 'heavy', acBonus: 5, dexCap: 1 },
        dexMod: 4,
        proficiencyBonus: 5,
      });
      expect(dt).toBe(10 + 5 + 1 + 5); // 21
    });

    it('Dex below the cap is not raised to it', () => {
      const ac = deriveArmorClass({
        armor: { category: 'light', acBonus: 2, dexCap: 3 },
        dexMod: 1,
        proficiencyBonus: 3,
      });
      expect(ac).toBe(10 + 3 + 1 + 2); // 16
    });

    it('absent dexCap means uncapped', () => {
      const ac = deriveArmorClass({
        armor: { category: 'light', acBonus: 1 },
        dexMod: 5,
        proficiencyBonus: 0,
      });
      expect(ac).toBe(10 + 0 + 5 + 1);
    });

    it('returns null (fallback) for worn armor missing the AC1 schema', () => {
      expect(deriveArmorClass({ armor: { group: 'plate' }, dexMod: 0, proficiencyBonus: 3 })).toBeNull();
      expect(deriveArmorClass({ armor: { category: 'heavy' }, dexMod: 0, proficiencyBonus: 3 })).toBeNull(); // no acBonus
      expect(deriveArmorClass({ armor: { acBonus: 6 }, dexMod: 0, proficiencyBonus: 3 })).toBeNull(); // no category
    });

    it('acBonus of 0 (explorer-style) still derives, not fallback', () => {
      expect(deriveArmorClass({ armor: { category: 'unarmored', acBonus: 0 }, dexMod: 2, proficiencyBonus: 3 })).toBe(15);
    });

    describe('effectDexCap (#507, Drakeheart Mutagen)', () => {
      it('lowers the effective cap when the effect cap is below the armor cap', () => {
        // Dex +4, light armor cap 4, effect cap 2 → lowest (2) wins, so +2.
        const ac = deriveArmorClass({
          armor: { category: 'light', acBonus: 1, dexCap: 4 },
          dexMod: 4,
          proficiencyBonus: 3,
          effectDexCap: 2,
        });
        expect(ac).toBe(10 + 3 + 2 + 1); // 16
      });

      it('keeps the armor cap when it is already lower (lowest wins)', () => {
        // Dex +4, heavy armor cap 0, effect cap 2 → lowest (0) wins, no Dex.
        const ac = deriveArmorClass({
          armor: { category: 'heavy', acBonus: 6, dexCap: 0 },
          dexMod: 4,
          proficiencyBonus: 5,
          effectDexCap: 2,
        });
        expect(ac).toBe(10 + 5 + 0 + 6); // 21
      });

      it('never raises the contribution above the actual Dex modifier', () => {
        // Dex +1, cap min(4, 2) = 2 → min(1, 2) = 1.
        const ac = deriveArmorClass({
          armor: { category: 'light', acBonus: 2, dexCap: 4 },
          dexMod: 1,
          proficiencyBonus: 3,
          effectDexCap: 2,
        });
        expect(ac).toBe(10 + 3 + 1 + 2); // 16
      });

      it('caps an otherwise-uncapped (unarmored) Dex contribution', () => {
        // Unarmored = no armor cap, but the effect cap of 2 still clamps Dex +5.
        const ac = deriveArmorClass({ armor: null, dexMod: 5, proficiencyBonus: 3, effectDexCap: 2 });
        expect(ac).toBe(BASE_AC + 3 + 2); // 15
      });

      it('defaults to Infinity (no cap) — derivation unchanged without an effect', () => {
        const ac = deriveArmorClass({
          armor: { category: 'light', acBonus: 2, dexCap: 4 },
          dexMod: 3,
          proficiencyBonus: 3,
        });
        expect(ac).toBe(10 + 3 + 3 + 2); // 18
      });
    });
  });
});
