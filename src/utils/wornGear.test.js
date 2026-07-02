import { wornResistanceFor, wornWeaknessFor, wornImmuneTo, specialModifiers, itemModifiers } from './wornGear';

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

  // The structured `resistance: { amount, type }` field (#911), as merged from a
  // variant override, is bridged into a resistance modifier.
  describe('structured resistance field bridge (#911)', () => {
    it('synthesizes a resistance modifier from the field', () => {
      expect(itemModifiers({ resistance: { amount: 5, type: 'fire' } })).toEqual([
        { stat: 'resistance', amount: 5, vs: 'fire' },
      ]);
    });

    it('appends the resistance modifier after any authored modifiers', () => {
      expect(itemModifiers({
        modifiers: [{ stat: 'ac', kind: 'item', amount: 1 }],
        resistance: { amount: 5, type: 'cold' },
      })).toEqual([
        { stat: 'ac', kind: 'item', amount: 1 },
        { stat: 'resistance', amount: 5, vs: 'cold' },
      ]);
    });

    it('ignores a malformed resistance field (no amount / no type)', () => {
      expect(itemModifiers({ resistance: { type: 'fire' } })).toEqual([]);
      expect(itemModifiers({ resistance: { amount: 5 } })).toEqual([]);
    });

    it('a worn invested item resists via the field end-to-end', () => {
      const robe = { uid: 'r', traits: ['Invested'], resistance: { amount: 5, type: 'fire' } };
      expect(wornResistanceFor([robe], () => true, 'fire')).toBe(5);
      expect(wornResistanceFor([robe], () => true, 'cold')).toBe(0);
    });
  });

  // Weakness mirrors resistance — same gating, different stat (#918).
  describe('wornWeaknessFor (#918)', () => {
    const vuln = (overrides = {}) => robe({
      uid: 'v', name: 'Cursed Mantle',
      modifiers: [{ stat: 'weakness', amount: 5, vs: 'fire' }],
      ...overrides,
    });

    it('returns a worn invested weakness matching the type', () => {
      expect(wornWeaknessFor([vuln()], yes, 'fire')).toBe(5);
      expect(wornWeaknessFor([vuln()], yes, 'cold')).toBe(0);
    });

    it('takes the highest matching weakness and gates on investment', () => {
      const items = [
        vuln({ uid: 'a', modifiers: [{ stat: 'weakness', amount: 5, vs: 'fire' }] }),
        vuln({ uid: 'b', modifiers: [{ stat: 'weakness', amount: 10, vs: 'fire' }] }),
      ];
      expect(wornWeaknessFor(items, yes, 'fire')).toBe(10);
      expect(wornWeaknessFor([vuln()], no, 'fire')).toBe(0); // investable, not invested
    });

    it('reads weakness only — not resistance', () => {
      expect(wornWeaknessFor([robe()], yes, 'fire')).toBe(0); // robe is a resistance item
      expect(wornResistanceFor([vuln()], yes, 'fire')).toBe(0);
    });
  });

  // Immunity is absolute — a boolean, not a highest-of (#919).
  describe('wornImmuneTo (#919)', () => {
    const ward = (overrides = {}) => robe({
      uid: 'wd', name: 'Poison Ward',
      modifiers: [{ stat: 'immunity', vs: 'poison,persistent-poison' }],
      ...overrides,
    });

    it('is true for a worn invested immunity matching a vs token', () => {
      expect(wornImmuneTo([ward()], yes, 'poison')).toBe(true);
      expect(wornImmuneTo([ward()], yes, 'persistent-poison')).toBe(true);
      expect(wornImmuneTo([ward()], yes, 'fire')).toBe(false);
    });

    it('gates on investment and worn placement', () => {
      expect(wornImmuneTo([ward()], no, 'poison')).toBe(false);
      expect(wornImmuneTo([ward({ state: 'held1' })], yes, 'poison')).toBe(false);
    });

    it('reads immunity only — resistance/weakness are not immunity', () => {
      expect(wornImmuneTo([robe()], yes, 'fire')).toBe(false);
    });

    it('is resilient to a non-array inventory and a falsy vsType', () => {
      expect(wornImmuneTo(undefined, yes, 'poison')).toBe(false);
      expect(wornImmuneTo([ward()], yes, '')).toBe(false);
    });
  });

  it('specialModifiers keeps only well-formed special mods', () => {
    expect(specialModifiers([
      { stat: 'ac', kind: 'item', amount: 1 },
      { stat: 'resistance', amount: 5, vs: 'fire' },
      { stat: 'resistance', amount: 5 },
    ])).toEqual([{ stat: 'resistance', amount: 5, vs: 'fire' }]);
  });
});

// ── Accessory-rune modifiers (#1033 S1) ──────────────────────────────────────
describe('itemModifiers — accessory runes (#1033)', () => {
  const menacing = {
    id: 'menacing', name: 'Menacing', type: 'property', target: 'accessory',
    modifiers: [{ stat: 'intimidation', kind: 'item', amount: 1 }],
  };

  it('merges an inscribed rune doc\'s modifiers with the item\'s authored ones', () => {
    const mods = itemModifiers({
      name: 'Cloak of the Bat',
      modifiers: [{ stat: 'stealth', kind: 'item', amount: 1 }],
      runes: { accessory: menacing },
    });
    expect(mods).toEqual([
      { stat: 'stealth', kind: 'item', amount: 1 },
      { stat: 'intimidation', kind: 'item', amount: 1 },
    ]);
  });

  it('an accessory-only runes block does NOT swallow authored modifiers via the armor resolver', () => {
    const mods = itemModifiers({
      name: 'Cloak',
      modifiers: [{ stat: 'stealth', kind: 'item', amount: 2 }],
      runes: { accessory: 'menacing' }, // unresolved string ref: slot taken, no doc
    });
    expect(mods).toEqual([{ stat: 'stealth', kind: 'item', amount: 2 }]);
  });

  it('dual-host: armor-rune delta and accessory modifiers are additive', () => {
    const mods = itemModifiers({
      name: "Explorer's Clothing",
      armor: { category: 'unarmored', acBonus: 0 },
      runes: {
        potency: 1,
        property: [{ id: 'slick', name: 'Slick', modifiers: [{ stat: 'acrobatics', kind: 'item', amount: 1 }] }],
        accessory: menacing,
      },
    });
    expect(mods).toEqual([
      { stat: 'ac', kind: 'item', amount: 1 },
      { stat: 'acrobatics', kind: 'item', amount: 1 },
      { stat: 'intimidation', kind: 'item', amount: 1 },
    ]);
  });
});
