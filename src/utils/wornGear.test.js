import { wornResistanceFor, specialModifiers } from './wornGear';

// Invested by default in these fixtures unless a test overrides the predicate.
const yes = () => true;
const no = () => false;

const robe = (overrides = {}) => ({
  uid: 'robe',
  name: 'Energy Robe (Fire)',
  traits: ['Invested', 'Magical'],
  modifiers: [{ stat: 'resistance', amount: 5, vs: 'fire' }],
  ...overrides,
});

describe('wornResistanceFor (#922 S3)', () => {
  it('returns the resistance of a worn, invested item matching the type', () => {
    expect(wornResistanceFor([robe()], yes, 'fire')).toBe(5);
  });

  it('returns 0 for a non-matching damage type', () => {
    expect(wornResistanceFor([robe()], yes, 'cold')).toBe(0);
  });

  it('matches one token of a comma-separated vs list', () => {
    const stone = robe({ uid: 's', modifiers: [{ stat: 'resistance', amount: 3, vs: 'persistent-bleed,persistent-poison' }] });
    expect(wornResistanceFor([stone], yes, 'persistent-poison')).toBe(3);
  });

  it('does not contribute when an investable item is not invested', () => {
    expect(wornResistanceFor([robe()], no, 'fire')).toBe(0);
  });

  it('contributes a non-investable worn item without investment', () => {
    const buckler = robe({ uid: 'b', traits: ['Magical'] });
    expect(wornResistanceFor([buckler], no, 'fire')).toBe(5);
  });

  it('ignores items that are not worn (held/dropped/stowed)', () => {
    expect(wornResistanceFor([robe({ state: 'held1' })], yes, 'fire')).toBe(0);
    expect(wornResistanceFor([robe({ state: 'dropped' })], yes, 'fire')).toBe(0);
  });

  it('takes the highest matching resistance (no stacking)', () => {
    const items = [
      robe({ uid: 'a', modifiers: [{ stat: 'resistance', amount: 5, vs: 'fire' }] }),
      robe({ uid: 'b', modifiers: [{ stat: 'resistance', amount: 10, vs: 'fire' }] }),
    ];
    expect(wornResistanceFor(items, yes, 'fire')).toBe(10);
  });

  it('ignores weakness/immunity stats and malformed (no vs / no amount) entries', () => {
    const items = [
      robe({ uid: 'w', modifiers: [{ stat: 'weakness', amount: 5, vs: 'fire' }] }),
      robe({ uid: 'i', modifiers: [{ stat: 'immunity', vs: 'fire' }] }),
      robe({ uid: 'x', modifiers: [{ stat: 'resistance', amount: 5 }] }), // no vs
    ];
    expect(wornResistanceFor(items, yes, 'fire')).toBe(0);
  });

  it('is resilient to a non-array inventory and a falsy vsType', () => {
    expect(wornResistanceFor(undefined, yes, 'fire')).toBe(0);
    expect(wornResistanceFor([robe()], yes, '')).toBe(0);
  });

  it('specialModifiers keeps only well-formed special mods', () => {
    expect(specialModifiers([
      { stat: 'ac', kind: 'item', amount: 1 },
      { stat: 'resistance', amount: 5, vs: 'fire' },
      { stat: 'resistance', amount: 5 },
    ])).toEqual([{ stat: 'resistance', amount: 5, vs: 'fire' }]);
  });
});
