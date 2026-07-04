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
