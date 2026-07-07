import { describe, it, expect } from 'vitest';
import {
  isSpellgun,
  spellgunMeta,
  spellgunDefense,
  spellgunRangeIncrementFt,
  spellgunVariants,
  spellgunAttackOptions,
  spellgunOutcome,
} from './spellgun';
import { items } from '../data';

const howl = () => items.find((i) => i.id === 'howl-of-winter');
const bola = () => items.find((i) => i.id === 'verdant-bola');

describe('spellgun spine', () => {
  describe('isSpellgun / spellgunMeta', () => {
    it('detects the block and the trait', () => {
      expect(isSpellgun(howl())).toBe(true);
      expect(isSpellgun({ traits: ['Spellgun'] })).toBe(true);
      expect(isSpellgun({ name: 'Longsword', traits: ['Sword'] })).toBe(false);
      expect(isSpellgun(null)).toBe(false);
    });

    it('normalises the block (defaults against/actionCount)', () => {
      expect(spellgunMeta({ spellgun: { rangeIncrement: 30 } }))
        .toEqual({ against: 'ac', actionCount: 2, rangeIncrement: 30 });
      expect(spellgunMeta({ name: 'x' })).toBeNull();
    });
  });

  describe('spellgunDefense', () => {
    it('maps against → resolver defense', () => {
      expect(spellgunDefense(howl())).toBe('ac');
      expect(spellgunDefense(bola())).toBe('reflex');
    });
  });

  describe('spellgunRangeIncrementFt', () => {
    it('reads the increment, else null', () => {
      expect(spellgunRangeIncrementFt(howl())).toBe(30);
      expect(spellgunRangeIncrementFt(bola())).toBe(20);
      expect(spellgunRangeIncrementFt({ spellgun: {} })).toBeNull();
    });
  });

  describe('spellgunVariants', () => {
    it('sorts graded variants ascending by level; flat → []', () => {
      const v = spellgunVariants(howl());
      expect(v.map((x) => x.level)).toEqual([3, 7, 11, 15]);
      expect(v.map((x) => x.dice)).toEqual(['2d6', '7d6', '12d6', '16d6']);
      expect(spellgunVariants(bola())).toEqual([]);
    });

    it('does not mutate the source order', () => {
      const item = { variants: [{ level: 5 }, { level: 1 }] };
      spellgunVariants(item);
      expect(item.variants.map((x) => x.level)).toEqual([5, 1]);
    });
  });

  describe('spellgunAttackOptions', () => {
    const character = {
      level: 8,
      abilities: { dexterity: 18, charisma: 20 },
      spellcasting: { ability: 'charisma', proficiency: 4 },
      proficiencies: { weapons: { martial: { proficiency: 4 }, simple: { proficiency: 2 } } },
    };

    it('offers spell and firearm options with derived bonuses (firearm = simple firearms, RAW)', () => {
      const opts = spellgunAttackOptions(character);
      expect(opts.map((o) => o.id)).toEqual(['spell', 'firearm']);
      // spell: Cha +5, legendary rank 4 (+8) + level 8 → 5 + 8 + 8 = 21
      expect(opts.find((o) => o.id === 'spell').bonus).toBe(5 + 8 + 8);
      // firearm: Dex +4, SIMPLE rank 2 (expert, +4) + level 8 → 4 + 4 + 8 = 16
      expect(opts.find((o) => o.id === 'firearm').bonus).toBe(4 + 4 + 8);
    });

    it('firearm option is 0-proficiency (Dex only) when untrained in simple weapons', () => {
      const noSimple = { ...character, proficiencies: { weapons: { martial: { proficiency: 4 } } } };
      // firearm: Dex +4, simple rank 0 → 4 + 0 = 4 (martial does NOT apply — RAW simple firearms)
      expect(spellgunAttackOptions(noSimple).find((o) => o.id === 'firearm').bonus).toBe(4);
    });

    it('returns [] for a missing character', () => {
      expect(spellgunAttackOptions(null)).toEqual([]);
    });
  });

  describe('spellgunOutcome — damage spellgun (vs AC)', () => {
    it('crit → double damage', () => {
      expect(spellgunOutcome('ac', 'criticalSuccess')).toEqual({
        hit: true, crit: true, damageMultiplier: 2, condition: null,
      });
    });
    it('success → full damage', () => {
      expect(spellgunOutcome('ac', 'success')).toEqual({
        hit: true, crit: false, damageMultiplier: 1, condition: null,
      });
    });
    it('failure / crit fail → miss', () => {
      for (const d of ['failure', 'criticalFailure']) {
        expect(spellgunOutcome('ac', d)).toEqual({
          hit: false, crit: false, damageMultiplier: 0, condition: null,
        });
      }
    });
  });

  describe('spellgunOutcome — control spellgun (vs Reflex DC)', () => {
    it('crit → restrained, no damage', () => {
      expect(spellgunOutcome('reflex-dc', 'criticalSuccess')).toEqual({
        hit: true, crit: true, damageMultiplier: 0, condition: 'restrained',
      });
    });
    it('success → grabbed', () => {
      expect(spellgunOutcome('reflex-dc', 'success')).toEqual({
        hit: true, crit: false, damageMultiplier: 0, condition: 'grabbed',
      });
    });
    it('failure → miss (no condition)', () => {
      expect(spellgunOutcome('reflex-dc', 'failure').condition).toBeNull();
    });
  });

  describe('seed content data-shape', () => {
    it('Howl of Winter — 4 graded variants, AC, cold, 30 ft', () => {
      const it = howl();
      expect(it).toBeTruthy();
      expect(isSpellgun(it)).toBe(true);
      expect(spellgunDefense(it)).toBe('ac');
      expect(it.spellgun.damageType).toBe('cold');
      expect(spellgunRangeIncrementFt(it)).toBe(30);
      const v = spellgunVariants(it);
      expect(v).toHaveLength(4);
      expect(v.map((x) => x.price)).toEqual([12, 70, 275, 1250]);
      v.forEach((x) => {
        expect(x.name).toMatch(/^Howl of Winter \(/);
        expect(x.dice).toMatch(/^\d+d6$/);
        expect(typeof x.penalty).toBe('string');
      });
    });

    it('Verdant Bola — flat, Reflex DC, 20 ft, Plant', () => {
      const it = bola();
      expect(it).toBeTruthy();
      expect(isSpellgun(it)).toBe(true);
      expect(spellgunDefense(it)).toBe('reflex');
      expect(it.spellgun.damageType).toBeUndefined();
      expect(spellgunRangeIncrementFt(it)).toBe(20);
      expect(it.traits).toContain('Plant');
      expect(spellgunVariants(it)).toHaveLength(0);
    });

    it('both homebrew guns carry the Spellgun + 3rd Party traits and a 2-action activation', () => {
      for (const it of [howl(), bola()]) {
        expect(it.traits).toEqual(expect.arrayContaining(['Attack', 'Consumable', 'Spellgun', '3rd Party']));
        expect(it.spellgun.actionCount).toBe(2);
        expect(it.actions[0].actionCount).toBe(2);
      }
    });

    // Official Treasure Vault (Remastered) spellguns imported alongside the pack.
    const OFFICIAL = [
      { id: 'torrent-spellgun', damageType: 'bludgeoning', grades: 4, first: 3, last: 15 },
      { id: 'sparking-spellgun', damageType: 'fire', grades: 3, first: 5, last: 13 },
      { id: 'moonlit-spellgun', damageType: 'fire', grades: 5, first: 2, last: 17 },
    ];

    it.each(OFFICIAL)('official $id — spellgun vs AC, graded, no 3rd Party trait', ({ id, damageType, grades, first, last }) => {
      const it = items.find((x) => x.id === id);
      expect(it).toBeTruthy();
      expect(isSpellgun(it)).toBe(true);
      expect(spellgunDefense(it)).toBe('ac');
      expect(it.spellgun.damageType).toBe(damageType);
      expect(spellgunRangeIncrementFt(it)).toBe(30);
      expect(it.traits).not.toContain('3rd Party');
      const v = spellgunVariants(it);
      expect(v).toHaveLength(grades);
      expect(v[0].level).toBe(first);
      expect(v[v.length - 1].level).toBe(last);
      v.forEach((x) => expect(x.dice).toMatch(/^\d+d\d+$/));
    });

    it('Sparking carries persistent-damage dice; Moonlit carries night dice', () => {
      const spark = spellgunVariants(items.find((x) => x.id === 'sparking-spellgun'));
      expect(spark.map((x) => x.persistent)).toEqual(['1d4', '3d4', '5d4']);
      const moon = spellgunVariants(items.find((x) => x.id === 'moonlit-spellgun'));
      moon.forEach((x) => expect(x.diceNight).toMatch(/^\d+d8$/));
    });

    it('every spellgun in the catalog resolves through the spine', () => {
      const guns = items.filter(isSpellgun);
      // 2 homebrew + 3 official families
      expect(guns).toHaveLength(5);
      guns.forEach((it) => {
        expect(['ac', 'reflex']).toContain(spellgunDefense(it));
        expect(spellgunRangeIncrementFt(it)).toBeGreaterThan(0);
        expect(it.actions?.[0]?.actionCount).toBe(2);
      });
    });
  });
});
