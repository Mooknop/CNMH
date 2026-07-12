import { describe, it, expect } from 'vitest';
import { deriveShieldBash, shieldBashStrikes, SHIELD_THROW_RANGE } from './shieldStrikes';

const character = {
  name: 'Pellias',
  level: 5,
  abilities: { strength: 14, dexterity: 18 },
  proficiencies: { weapons: { martial: { proficiency: 4 } } },
};

const shield = (uid, state, extra = {}) => ({
  uid,
  name: 'Steel Shield',
  weight: 1,
  shield: { hardness: 5, health: 20, breakThreshold: 10 },
  state,
  ...extra,
});
const throwingRune = { id: 'throwing', type: 'property', name: 'Throwing' };
const throwingShield = (uid, state, weight = 1) =>
  shield(uid, state, { weight, runes: { reinforcing: 'moderate', property: [throwingRune] } });

describe('shieldStrikes — Shield Bash baseline', () => {
  it('a held shield contributes a martial melee Shield Bash (1d4 B + Str)', () => {
    const char = { ...character, inventory: [shield('s1', 'held1')] };
    const strikes = shieldBashStrikes(char, {});
    expect(strikes).toHaveLength(1);
    expect(strikes[0]).toMatchObject({
      name: 'Shield Bash',
      type: 'melee',
      damageType: 'bludgeoning',
      source: 'Steel Shield',
      shieldBash: true,
      hostUid: 's1',
      active: true,
    });
    expect(strikes[0].damage).toBe('1d4+2'); // Str 14 → +2
  });

  it('contributes nothing for a shield that is not held', () => {
    expect(shieldBashStrikes({ ...character, inventory: [shield('s1', 'worn')] }, {})).toEqual([]);
    expect(shieldBashStrikes({ ...character, inventory: [shield('s1', 'dropped')] }, {})).toEqual([]);
  });

  it('skips a legacy shield that authors its own inline strikes block', () => {
    const spiked = shield('s1', 'held1', {
      strikes: [{ type: 'melee', damage: '1d6', damageType: 'piercing', traits: [] }],
    });
    expect(shieldBashStrikes({ ...character, inventory: [spiked] }, {})).toEqual([]);
  });

  it('a bound attachment replaces the bash (melee suppressed)', () => {
    const char = { ...character, inventory: [shield('s1', 'held1')] };
    expect(shieldBashStrikes(char, { spk: 's1' })).toEqual([]);
  });

  it('a finesse shield (base trait or Feather rune) bashes with Finesse', () => {
    const targe = shield('s1', 'held1', { name: 'Targe', traits: ['Finesse'] });
    const feather = shield('s2', 'held1', {
      runes: { reinforcing: 'minor', property: [{ id: 'feather', type: 'property', name: 'Feather' }] },
    });
    const char = { ...character, inventory: [targe, feather] };
    const [t, f] = shieldBashStrikes(char, {});
    expect(t.traits).toContain('Finesse');
    expect(f.traits).toContain('Finesse');
    // Plain shield: no spurious trait.
    const [plain] = shieldBashStrikes({ ...character, inventory: [shield('s3', 'held1')] }, {});
    expect(plain.traits).not.toContain('Finesse');
  });
});

describe('shieldStrikes — Shield Throw (Throwing rune)', () => {
  it('the Throwing rune adds a ranged Shield Throw tagged thrown + returning', () => {
    const char = { ...character, inventory: [throwingShield('s1', 'held1')] };
    const strikes = shieldBashStrikes(char, {});
    expect(strikes).toHaveLength(2);
    const toss = strikes.find((s) => s.type === 'ranged');
    expect(toss).toMatchObject({
      name: 'Shield Throw',
      damageType: 'bludgeoning',
      thrown: true,
      returning: true, // the Throwing rune includes returning effects
      weaponUid: 's1',
      shieldBash: true,
      hostUid: 's1',
    });
    expect(toss.damage).toBe('1d4+2'); // thrown adds Str to damage
  });

  it('the Throwing Shield augmentation adds a ranged Shield Throw (#1411 D)', () => {
    const augShield = shield('s1', 'held1', { augmentation: { id: 'throwing-shield', name: 'Throwing Shield' } });
    const strikes = shieldBashStrikes({ ...character, inventory: [augShield] }, {});
    expect(strikes).toHaveLength(2);
    const toss = strikes.find((s) => s.type === 'ranged');
    expect(toss).toMatchObject({ name: 'Shield Throw', thrown: true, returning: false, hostUid: 's1' });
    // A worn (not wielded) shield derives no strikes at all.
    expect(shieldBashStrikes({ ...character, inventory: [shield('s2', 'worn', { augmentation: { id: 'throwing-shield' } })] }, {})).toEqual([]);
  });

  it('range increment follows the shield size category (Bulk)', () => {
    const at = (weight) => {
      const char = { ...character, inventory: [throwingShield('s1', 'held1', weight)] };
      return shieldBashStrikes(char, {}).find((s) => s.type === 'ranged').range;
    };
    expect(at(0)).toBe(SHIELD_THROW_RANGE.light);   // 25ft
    expect(at(1)).toBe(SHIELD_THROW_RANGE.medium);  // 20ft
    expect(at(2)).toBe(SHIELD_THROW_RANGE.heavy);   // 15ft
  });

  it('a base-trait Thrown shield without a returning-effect rune is NOT returning', () => {
    const tossable = shield('s1', 'held1', { traits: ['Thrown'] });
    const char = { ...character, inventory: [tossable] };
    const toss = shieldBashStrikes(char, {}).find((s) => s.type === 'ranged');
    expect(toss).toMatchObject({ thrown: true, returning: false, weaponUid: 's1' });
  });

  it('the throw survives when an attachment replaces the bash', () => {
    const char = { ...character, inventory: [throwingShield('s1', 'held1')] };
    const strikes = shieldBashStrikes(char, { spk: 's1' });
    expect(strikes).toHaveLength(1);
    expect(strikes[0].type).toBe('ranged');
  });
});

describe('shieldStrikes — deriveShieldBash shape', () => {
  it('derives a resolver-ready pseudo-weapon carrying the shield uid', () => {
    const derived = deriveShieldBash(throwingShield('s1', 'held1', 0));
    expect(derived.uid).toBe('s1');
    expect(derived.noHandRequired).toBe(true);
    expect(derived.strikes.map((s) => s.type)).toEqual(['melee', 'ranged']);
    expect(derived.strikes[1].range).toBe('25ft');
  });
});
