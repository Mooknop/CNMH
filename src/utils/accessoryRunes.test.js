import {
  hasAccessoryRune,
  accessoryRuneOf,
  accessoryUsageTags,
  accessoryEligible,
  resolveAccessoryItem,
  accessoryDisplayName,
  withAccessoryActivations,
  runeOnBlock,
} from './accessoryRunes';

// Fixtures — minimal hosts + rune docs (#1033 S1).
const menacing = {
  id: 'menacing', type: 'property', target: 'accessory',
  name: 'Menacing', level: 3, price: 50, usage: ['clothing'],
  description: 'Sinister sigils shift across the garment.',
  modifiers: [{ stat: 'intimidation', kind: 'item', amount: 1 }],
};
const called = {
  id: 'called', type: 'property', target: 'accessory',
  name: 'Called', level: 3, price: 60, usage: ['light'],
  riders: [{ id: 'called-reminder', text: 'Activate to teleport the item to your hand.' }],
  actuated: { name: 'Call Item', frequency: 'once per hour', actionCount: 1, cost: 'none' },
};
const catching = {
  id: 'catching', type: 'property', target: 'accessory',
  name: 'Catching', level: 8, price: 425, usage: ['shield'],
};

const cloak = (extra = {}) => ({ uid: 'c1', name: 'Cloak', accessoryTags: ['cloak', 'clothing'], ...extra });

describe('hasAccessoryRune / accessoryRuneOf', () => {
  it('reads the slot whether it holds a string ref or an inlined doc', () => {
    expect(hasAccessoryRune(cloak())).toBe(false);
    expect(hasAccessoryRune(cloak({ runes: { accessory: 'menacing' } }))).toBe(true);
    expect(hasAccessoryRune(cloak({ runes: { accessory: menacing } }))).toBe(true);
  });
  it('accessoryRuneOf returns only an inlined DOC — a string ref reads as no doc', () => {
    expect(accessoryRuneOf(cloak({ runes: { accessory: menacing } }))).toBe(menacing);
    expect(accessoryRuneOf(cloak({ runes: { accessory: 'menacing' } }))).toBeNull();
    expect(accessoryRuneOf(cloak())).toBeNull();
    expect(accessoryRuneOf(null)).toBeNull();
  });
  it('tolerates a legacy array runes field', () => {
    expect(hasAccessoryRune({ runes: [] })).toBe(false);
  });
});

describe('accessoryUsageTags', () => {
  it('returns the authored accessoryTags', () => {
    expect(accessoryUsageTags(cloak())).toEqual(['cloak', 'clothing']);
    expect(accessoryUsageTags({ name: 'Rope' })).toEqual([]);
  });
  it('derives shield / container / light from the item structure', () => {
    expect(accessoryUsageTags({ name: 'Steel Shield', shield: { hardness: 5 } })).toContain('shield');
    expect(accessoryUsageTags({ name: 'Satchel', container: { capacity: 4, contents: [] } })).toContain('container');
    expect(accessoryUsageTags({ name: 'Whistle', weight: 0 })).toContain('light');
    expect(accessoryUsageTags({ name: 'Dagger', weight: 0.1 })).toContain('light');
  });
  it('missing or heavier weight never derives light', () => {
    expect(accessoryUsageTags({ name: 'Longsword', weight: 1 })).not.toContain('light');
    expect(accessoryUsageTags({ name: 'Mystery Trinket' })).not.toContain('light');
  });
});

describe('accessoryEligible', () => {
  it('accepts a usage-matching mundane host', () => {
    expect(accessoryEligible(cloak(), menacing)).toBe(true);
    expect(accessoryEligible({ name: 'Steel Shield', shield: {} }, catching)).toBe(true);
    expect(accessoryEligible({ name: 'Whistle', weight: 0 }, called)).toBe(true);
  });
  it('rejects a usage mismatch', () => {
    expect(accessoryEligible({ name: 'Steel Shield', shield: {} }, menacing)).toBe(false);
    expect(accessoryEligible(cloak(), catching)).toBe(false);
  });
  it('rejects non-accessory runes and malformed inputs', () => {
    expect(accessoryEligible(cloak(), { id: 'slick', type: 'property', armorRune: true })).toBe(false);
    expect(accessoryEligible(null, menacing)).toBe(false);
    expect(accessoryEligible(cloak(), null)).toBe(false);
  });
  it('rejects a host that is already invested magic (authored Invested trait)', () => {
    expect(accessoryEligible(cloak({ traits: ['Invested', 'Magical'] }), menacing)).toBe(false);
  });
  it('max one: rejects a host whose accessory slot is already taken (ref or doc)', () => {
    expect(accessoryEligible(cloak({ runes: { accessory: 'called' } }), menacing)).toBe(false);
    expect(accessoryEligible(cloak({ runes: { accessory: called } }), menacing)).toBe(false);
  });
  it('weapon/armor runes on the host do NOT disqualify it (dual-host)', () => {
    const explorers = {
      name: "Explorer's Clothing",
      armor: { category: 'unarmored', acBonus: 0 },
      accessoryTags: ['clothing'],
      runes: { potency: 1, property: [{ id: 'slick', name: 'Slick' }] },
    };
    expect(accessoryEligible(explorers, menacing)).toBe(true);
  });
});

describe('resolveAccessoryItem', () => {
  it('is identity-shaped for an un-inscribed host', () => {
    const out = resolveAccessoryItem(cloak({ price: 2, traits: ['Homemade'] }));
    expect(out).toEqual({
      name: 'Cloak', price: 2, modifiers: [], riders: [], actions: [],
      actuated: null, traits: ['Homemade'], rune: null,
    });
  });
  it('derives name prefix, summed price, and the rune payload', () => {
    const out = resolveAccessoryItem(cloak({ price: 2, runes: { accessory: menacing } }));
    expect(out.name).toBe('Menacing Cloak');
    expect(out.price).toBe(52);
    expect(out.modifiers).toEqual([{ stat: 'intimidation', kind: 'item', amount: 1 }]);
    expect(out.rune).toBe(menacing);
  });
  it('grants Magical + Invested display traits without duplicating authored ones', () => {
    const out = resolveAccessoryItem(cloak({ traits: ['magical'], runes: { accessory: menacing } }));
    expect(out.traits).toEqual(['magical', 'Invested']);
  });
  it('forwards riders and the actuated block', () => {
    const out = resolveAccessoryItem({ name: 'Whistle', weight: 0, runes: { accessory: called } });
    expect(out.riders).toEqual(called.riders);
    expect(out.actuated).toBe(called.actuated);
  });
  it('a still-string ref resolves as un-inscribed (no doc to read)', () => {
    const out = resolveAccessoryItem(cloak({ runes: { accessory: 'menacing' } }));
    expect(out.rune).toBeNull();
    expect(out.name).toBe('Cloak');
  });
});

describe('accessoryDisplayName', () => {
  it('prefixes the rune name onto the item name', () => {
    expect(accessoryDisplayName(cloak({ runes: { accessory: menacing } }))).toBe('Menacing Cloak');
    expect(accessoryDisplayName(cloak())).toBe('Cloak');
  });
  it('wraps a caller-derived inner name (dual-host armor)', () => {
    const item = { name: "Explorer's Clothing", runes: { accessory: menacing, potency: 1 } };
    expect(accessoryDisplayName(item, "+1 Explorer's Clothing")).toBe("Menacing +1 Explorer's Clothing");
  });
});

describe('withAccessoryActivations (#1033 S2)', () => {
  const dragonsBreath = {
    id: 'dragons-breath-1', name: "Dragon's Breath", type: 'property', target: 'accessory',
    freeActions: [{ name: "Dragon's Breath", trigger: 'Your next action is to Cast a Spell…', description: 'Widen the spell.' }],
  };

  it('merges the rune display activations onto the host lists', () => {
    const host = { name: 'Dueling Cape', accessoryTags: ['dueling-cape'], actions: [{ name: 'Flourish' }], runes: { accessory: dragonsBreath } };
    const out = withAccessoryActivations(host);
    expect(out.actions).toEqual([{ name: 'Flourish' }]); // untouched list
    expect(out.freeActions).toEqual(dragonsBreath.freeActions);
    expect(host.freeActions).toBeUndefined(); // never mutates the input
  });

  it('is identity for un-inscribed hosts and runes with no display activations', () => {
    const plain = { name: 'Cloak' };
    expect(withAccessoryActivations(plain)).toBe(plain);
    const runedNoActs = { name: 'Cloak', runes: { accessory: menacing } };
    expect(withAccessoryActivations(runedNoActs)).toBe(runedNoActs);
  });
});

describe('runeOnBlock (#1055 S2)', () => {
  it('wraps a legacy prose rider as summary-only', () => {
    expect(runeOnBlock({ onBlock: 'deal 4d4 force to the attacker' }))
      .toEqual({ summary: 'deal 4d4 force to the attacker' });
  });

  it('passes a structured rider through', () => {
    const ob = {
      summary: '4d4 force (DC 20 basic Reflex).',
      damage: { expression: '4d4', typeLabel: 'force' },
      save: 'reflex', dc: 20, basic: true,
    };
    expect(runeOnBlock({ onBlock: ob })).toBe(ob);
    const check = { summary: 'Disarm.', check: { skill: 'athletics', action: 'Disarm', bonus: 1 } };
    expect(runeOnBlock({ onBlock: check })).toBe(check);
  });

  it('returns null when absent, junk, or an empty object', () => {
    expect(runeOnBlock(null)).toBeNull();
    expect(runeOnBlock({})).toBeNull();
    expect(runeOnBlock({ onBlock: 42 })).toBeNull();
    expect(runeOnBlock({ onBlock: {} })).toBeNull();
  });
});
