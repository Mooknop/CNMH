import { isShop, getShopsForLocation, resolveShopWares } from './shopUtils';

// Lore: Sandpoint (root) contains two shops + one plain location.
const entries = [
  { id: 'sandpoint', title: 'Sandpoint', category: 'Location' },
  { id: 'bottled-solutions', title: 'Bottled Solutions', category: 'Location', parent: 'sandpoint' },
  { id: 'curious-goblin', title: 'The Curious Goblin', category: 'Location', parent: 'sandpoint' },
  { id: 'town-hall', title: 'Town Hall', category: 'Location', parent: 'sandpoint' },
];

const shops = {
  'bottled-solutions': { wares: [{ ref: 'healing-potion' }, { ref: 'antidote', price: 8 }] },
  'curious-goblin': { wares: [{ ref: 'spellbook' }] },
  'empty-shop': { wares: [] },
};

const catalogMap = new Map([
  ['healing-potion', { id: 'healing-potion', name: 'Healing Potion', price: 12, weight: 0 }],
  ['antidote', { id: 'antidote', name: 'Antidote', price: 3, weight: 0 }],
  ['spellbook', { id: 'spellbook', name: 'Spellbook', price: 10, weight: 1 }],
]);

describe('isShop', () => {
  it('is true for a lore id with ≥1 ware', () => {
    expect(isShop('bottled-solutions', shops)).toBe(true);
  });

  it('is false for an entry with an empty wares list', () => {
    expect(isShop('empty-shop', shops)).toBe(false);
  });

  it('is false for an id absent from the store', () => {
    expect(isShop('town-hall', shops)).toBe(false);
  });

  it('is false for missing args', () => {
    expect(isShop(null, shops)).toBe(false);
    expect(isShop('bottled-solutions', null)).toBe(false);
  });
});

describe('getShopsForLocation', () => {
  it('returns the shop children of a location, title-sorted', () => {
    const result = getShopsForLocation('sandpoint', entries, shops);
    expect(result.map((e) => e.id)).toEqual(['bottled-solutions', 'curious-goblin']);
  });

  it('excludes non-shop children (Town Hall)', () => {
    const ids = getShopsForLocation('sandpoint', entries, shops).map((e) => e.id);
    expect(ids).not.toContain('town-hall');
  });

  it('returns [] when the location has no children', () => {
    expect(getShopsForLocation('bottled-solutions', entries, shops)).toEqual([]);
  });

  it('returns [] for missing args', () => {
    expect(getShopsForLocation(null, entries, shops)).toEqual([]);
    expect(getShopsForLocation('sandpoint', entries, null)).toEqual([]);
  });
});

describe('resolveShopWares', () => {
  it('resolves each ware ref to its catalog item', () => {
    const wares = resolveShopWares('curious-goblin', shops, catalogMap);
    expect(wares).toEqual([{ id: 'spellbook', name: 'Spellbook', price: 10, weight: 1 }]);
  });

  it('uses the catalog price when the ware sets no override', () => {
    const wares = resolveShopWares('bottled-solutions', shops, catalogMap);
    expect(wares[0]).toMatchObject({ id: 'healing-potion', price: 12 });
  });

  it('applies a ware price override', () => {
    const wares = resolveShopWares('bottled-solutions', shops, catalogMap);
    expect(wares[1]).toMatchObject({ id: 'antidote', price: 8 });
  });

  it('carries stock through when present', () => {
    const withStock = { s: { wares: [{ ref: 'antidote', stock: 4 }] } };
    expect(resolveShopWares('s', withStock, catalogMap)[0].stock).toBe(4);
  });

  it('drops wares whose ref is missing from the catalog', () => {
    const bad = { s: { wares: [{ ref: 'unknown-thing' }, { ref: 'antidote' }] } };
    const wares = resolveShopWares('s', bad, catalogMap);
    expect(wares.map((w) => w.id)).toEqual(['antidote']);
  });

  it('returns [] for an unknown shop or missing catalog', () => {
    expect(resolveShopWares('nope', shops, catalogMap)).toEqual([]);
    expect(resolveShopWares('curious-goblin', shops, null)).toEqual([]);
  });
});
