import { findBladeByrnie, deriveBladeDagger, bladeStrikes } from './bladeByrnie';

const byrnie = (overrides = {}) => ({
  uid: 'bb1',
  name: 'Blade Byrnie',
  state: 'worn',
  bladeByrnie: {},
  ...overrides,
});

describe('findBladeByrnie', () => {
  it('finds an equipped flagged armor', () => {
    const armor = byrnie();
    expect(findBladeByrnie([{ name: 'Rope' }, armor])).toBe(armor);
  });

  it('skips a stowed/dropped Blade Byrnie', () => {
    expect(findBladeByrnie([byrnie({ state: 'dropped' })])).toBeNull();
  });

  it('returns null when no Blade Byrnie is present', () => {
    expect(findBladeByrnie([{ name: 'Chain Shirt', state: 'worn' }])).toBeNull();
    expect(findBladeByrnie([])).toBeNull();
    expect(findBladeByrnie(undefined)).toBeNull();
  });
});

describe('deriveBladeDagger (rune scaling)', () => {
  it('defaults to a +1 striking dagger', () => {
    const d = deriveBladeDagger(byrnie());
    expect(d.runes).toEqual({ potency: 1, striking: 'striking' });
    expect(d.noHandRequired).toBe(true);
    expect(d.strikes[0]).toMatchObject({ type: 'melee', damage: '1d4', actionCount: 1 });
  });

  it('scales weapon potency from the armor potency', () => {
    expect(deriveBladeDagger(byrnie({ runes: { potency: 2 } })).runes.potency).toBe(2);
    expect(deriveBladeDagger(byrnie({ runes: { potency: 3 } })).runes.potency).toBe(3);
  });

  it('a greater Blade Byrnie yields greater striking daggers', () => {
    expect(deriveBladeDagger(byrnie({ bladeByrnie: { striking: 'greater' } })).runes.striking).toBe('greater');
  });
});

describe('bladeStrikes', () => {
  it('returns [] when no Blade Byrnie is equipped', () => {
    expect(bladeStrikes({ inventory: [{ name: 'Chain Shirt', state: 'worn' }] })).toEqual([]);
    expect(bladeStrikes({})).toEqual([]);
  });

  it('resolves a tagged, scaled dagger strike when equipped', () => {
    // A minimal character the strike resolver can read.
    const character = {
      level: 1,
      abilityModifiers: { strength: 4, dexterity: 2 },
      proficiencies: { weapons: { simple: { proficiency: 1 } } },
      inventory: [byrnie()],
    };
    const out = bladeStrikes(character);
    expect(out).toHaveLength(1);
    expect(out[0].bladeByrnie).toBe(true);
    // Striking scales the native 1d4 to 2d4; +1 potency tags the breakdown.
    expect(out[0].damage).toContain('2d4');
    expect(out[0].runeBreakdown).toMatchObject({ potencyBonus: 1 });
  });
});
