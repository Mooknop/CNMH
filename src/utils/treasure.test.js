import { TREASURE_BASE, isTreasureEntry, resolveTreasure } from './treasure';

const catalogMap = new Map([
  ['treasure-item', {
    id: 'treasure-item',
    name: 'Treasure',
    weight: 0,
    image: 'img_treasure.jpg',
    imagePosition: { x: 30, y: 70 },
    description: 'Generic valuable.',
  }],
]);

describe('isTreasureEntry', () => {
  it('is true only for an entry with ref "treasure-item"', () => {
    expect(isTreasureEntry({ ref: 'treasure-item', name: 'Garnet Beads' })).toBe(true);
    expect(isTreasureEntry({ ref: 'longsword' })).toBe(false);
    expect(isTreasureEntry({ name: 'Garnet Beads' })).toBe(false);
    expect(isTreasureEntry(null)).toBe(false);
  });
});

describe('resolveTreasure', () => {
  it('folds per-instance name / worth / Bulk / quantity onto the base', () => {
    const r = resolveTreasure(
      { ref: 'treasure-item', name: 'Garnet Beads', price: 5, weight: 0.1, quantity: 10, uid: 'u9' },
      catalogMap,
    );
    expect(r.name).toBe('Garnet Beads');
    expect(r.price).toBe(5);
    expect(r.weight).toBe(0.1);
    expect(r.quantity).toBe(10);
    expect(r.uid).toBe('u9');
    // Inherits the shared base artwork.
    expect(r.image).toBe('img_treasure.jpg');
    expect(r.imagePosition).toEqual({ x: 30, y: 70 });
  });

  it('reads worth from `value` when `price` is absent (cache-valuable shape)', () => {
    const r = resolveTreasure({ ref: 'treasure-item', name: 'Silver Bowl', value: 25 }, catalogMap);
    expect(r.price).toBe(25);
    expect(r.quantity).toBe(1);
  });

  it("lets the entry's own image override the base art", () => {
    const r = resolveTreasure(
      { ref: 'treasure-item', name: 'Painted Icon', image: 'img_custom.jpg', imagePosition: { x: 1, y: 2 } },
      catalogMap,
    );
    expect(r.image).toBe('img_custom.jpg');
    expect(r.imagePosition).toEqual({ x: 1, y: 2 });
  });

  it('grants no mechanical block', () => {
    const r = resolveTreasure({ ref: 'treasure-item', name: 'Idol' }, catalogMap);
    expect(r.strikes).toBeUndefined();
    expect(r.runes).toBeUndefined();
    expect(r.container).toBeUndefined();
  });

  it('falls back to the code base and never crashes without a catalog', () => {
    const r = resolveTreasure({ ref: 'treasure-item', name: 'Loose Gem', price: 3 });
    expect(r.name).toBe('Loose Gem');
    expect(r.price).toBe(3);
    expect(r.weight).toBe(TREASURE_BASE.weight);
    expect(r.image).toBeUndefined();
  });
});
