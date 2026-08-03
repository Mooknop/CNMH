import { RUNESTONE_BASE, isRunestoneEntry, resolveRunestone } from './runestone';

const runeMap = new Map([
  ['flaming', { id: 'flaming', type: 'property', name: 'Flaming', level: 8, price: 500, traits: ['Fire', 'Magical'], description: 'Burns the target.' }],
  ['cheap', { id: 'cheap', name: 'Cheap', price: 10 }],
]);

describe('isRunestoneEntry', () => {
  it('is true only for an entry with ref "runestone"', () => {
    expect(isRunestoneEntry({ ref: 'runestone', runeRef: 'flaming' })).toBe(true);
    expect(isRunestoneEntry({ ref: 'runestone' })).toBe(true);
    expect(isRunestoneEntry({ ref: 'longsword' })).toBe(false);
    expect(isRunestoneEntry({ runeRef: 'flaming' })).toBe(false); // no ref
    expect(isRunestoneEntry(null)).toBe(false);
  });
});

describe('resolveRunestone', () => {
  it('folds the held rune name + value (stone price + rune price)', () => {
    const r = resolveRunestone({ ref: 'runestone', runeRef: 'flaming', uid: 'u1', quantity: 2 }, runeMap);
    expect(r.name).toBe('Flaming Runestone');
    expect(r.price).toBe(503); // 3 + 500
    expect(r.quantity).toBe(2);
    expect(r.uid).toBe('u1');
    expect(r.runestone).toEqual({ runeRef: 'flaming', rune: runeMap.get('flaming') });
  });

  it('merges (deduped) the rune traits onto the Consumable/Magical base', () => {
    const r = resolveRunestone({ ref: 'runestone', runeRef: 'flaming' }, runeMap);
    expect(r.traits).toEqual(['Consumable', 'Magical', 'Fire']); // Magical not duplicated
  });

  it('grants NO mechanical effect (no strikes/runes block)', () => {
    const r = resolveRunestone({ ref: 'runestone', runeRef: 'flaming' }, runeMap);
    expect(r.strikes).toBeUndefined();
    expect(r.runes).toBeUndefined();
  });

  it('resolves a blank stone (no runeRef) to the base runestone', () => {
    const r = resolveRunestone({ ref: 'runestone' }, runeMap);
    expect(r.name).toBe('Runestone');
    expect(r.price).toBe(RUNESTONE_BASE.price);
    expect(r.runestone).toEqual({ runeRef: null, rune: null });
  });

  it('shows an unknown-rune marker for a dangling runeRef (weightless-safe)', () => {
    const r = resolveRunestone({ ref: 'runestone', runeRef: 'ghost' }, runeMap);
    expect(r.name).toBe('Runestone (unknown rune: ghost)');
    expect(r.weight).toBe(RUNESTONE_BASE.weight);
    expect(r.runestone).toEqual({ runeRef: 'ghost', rune: null });
  });

  it('defaults quantity to 1 and derives a per-rune id', () => {
    const r = resolveRunestone({ ref: 'runestone', runeRef: 'cheap' }, runeMap);
    expect(r.quantity).toBe(1);
    expect(r.id).toBe('runestone-cheap');
    expect(r.price).toBe(13);
  });

  it('inherits the shared base artwork from the runestone catalog doc', () => {
    const catalogMap = new Map([
      ['runestone', { id: 'runestone', image: 'img_stone.jpg', imagePosition: { x: 40, y: 60 } }],
    ]);
    const r = resolveRunestone({ ref: 'runestone', runeRef: 'flaming' }, runeMap, catalogMap);
    expect(r.image).toBe('img_stone.jpg');
    expect(r.imagePosition).toEqual({ x: 40, y: 60 });
  });

  it('has no image when the base doc carries none, and never crashes without a catalog', () => {
    expect(resolveRunestone({ ref: 'runestone', runeRef: 'flaming' }, runeMap).image).toBeUndefined();
    const emptyBase = new Map([['runestone', { id: 'runestone' }]]);
    expect(resolveRunestone({ ref: 'runestone' }, runeMap, emptyBase).image).toBeUndefined();
  });
});

describe('resolveRunestone — fundamental descriptors (#832)', () => {
  // Fundamentals resolve from the fixed POTENCY/STRIKING tables (via
  // data/fundamentalRunes.js), never the property-rune catalog: name + price
  // (stone 3 gp + rune) + canonical PF2e item level, for all six tiers.
  it.each([
    [{ fundamental: 'potency', tier: 1 }, '+1 Weapon Potency Runestone', 3 + 35, 2],
    [{ fundamental: 'potency', tier: 2 }, '+2 Weapon Potency Runestone', 3 + 935, 10],
    [{ fundamental: 'potency', tier: 3 }, '+3 Weapon Potency Runestone', 3 + 8935, 16],
    [{ fundamental: 'striking', key: 'striking' }, 'Striking Runestone', 3 + 65, 4],
    [{ fundamental: 'striking', key: 'greater' }, 'Greater Striking Runestone', 3 + 1065, 12],
    [{ fundamental: 'striking', key: 'major' }, 'Major Striking Runestone', 3 + 31065, 19],
  ])('resolves %o with table name/price/level', (desc, name, price, level) => {
    const r = resolveRunestone({ ref: 'runestone', ...desc }, runeMap);
    expect(r.name).toBe(name);
    expect(r.price).toBe(price);
    expect(r.runestone.rune.level).toBe(level);
    expect(r.runestone.fundamental).toBe(desc.fundamental);
    if (desc.tier != null) expect(r.runestone.tier).toBe(desc.tier);
    if (desc.key != null) expect(r.runestone.key).toBe(desc.key);
  });

  it('carries the fundamental rune doc in the marker (no runeRef, no runeMap hit)', () => {
    const r = resolveRunestone({ ref: 'runestone', fundamental: 'striking', key: 'greater' });
    expect(r.runestone.runeRef).toBeNull();
    expect(r.runestone.rune).toMatchObject({
      type: 'fundamental', fundamental: 'striking', target: 'weapon', tierKey: 'greater',
    });
    expect(r.id).toBe('runestone-greater-striking');
  });

  it('grants NO mechanical effect (no strikes/runes block)', () => {
    const r = resolveRunestone({ ref: 'runestone', fundamental: 'potency', tier: 2 }, runeMap);
    expect(r.strikes).toBeUndefined();
    expect(r.runes).toBeUndefined();
  });

  it('shows an unknown marker for a bad tier (weightless-safe)', () => {
    const r = resolveRunestone({ ref: 'runestone', fundamental: 'potency', tier: 9 }, runeMap);
    expect(r.name).toBe('Runestone (unknown potency rune)');
    expect(r.weight).toBe(RUNESTONE_BASE.weight);
    expect(r.runestone.rune).toBeNull();
  });
});
