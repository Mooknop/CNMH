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

// A multi-level item: variants carry their own name/price (#797 shape).
const potionLadder = {
  id: 'tonic',
  name: 'Tonic',
  weight: 0.1,
  variants: [
    { level: 1, label: 'Minor', name: 'Minor Tonic', price: 4 },
    { level: 3, label: 'Lesser', name: 'Lesser Tonic', price: 12 },
  ],
};

const catalogMap = new Map([
  ['healing-potion', { id: 'healing-potion', name: 'Healing Potion', price: 12, weight: 0 }],
  ['antidote', { id: 'antidote', name: 'Antidote', price: 3, weight: 0 }],
  ['spellbook', { id: 'spellbook', name: 'Spellbook', price: 10, weight: 1 }],
  ['tonic', potionLadder],
]);

const runeMap = new Map([
  ['flaming', { id: 'flaming', name: 'Flaming', level: 8, price: 500, traits: ['Fire', 'Magical'] }],
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
  it('resolves each ware ref to its catalog item, stamping a wareKey', () => {
    const wares = resolveShopWares('curious-goblin', shops, catalogMap);
    expect(wares).toEqual([
      { id: 'spellbook', name: 'Spellbook', price: 10, weight: 1, wareKey: 'spellbook' },
    ]);
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

  it('applies a pinned variant: merges name/price, drops the ladder, keys by ref@level', () => {
    const s = { s: { wares: [{ ref: 'tonic', level: 3 }] } };
    const [w] = resolveShopWares('s', s, catalogMap);
    expect(w).toMatchObject({ id: 'tonic', name: 'Lesser Tonic', price: 12, wareKey: 'tonic@3' });
    expect(w.variants).toBeUndefined();
  });

  it('stocks two variants of one item as distinct, non-colliding wares', () => {
    const s = { s: { wares: [{ ref: 'tonic', level: 1 }, { ref: 'tonic', level: 3 }] } };
    const wares = resolveShopWares('s', s, catalogMap);
    expect(wares.map((w) => w.wareKey)).toEqual(['tonic@1', 'tonic@3']);
    expect(wares.map((w) => w.name)).toEqual(['Minor Tonic', 'Lesser Tonic']);
    expect(wares.map((w) => w.price)).toEqual([4, 12]);
  });

  it('lets a ware price override the variant price', () => {
    const s = { s: { wares: [{ ref: 'tonic', level: 1, price: 2 }] } };
    expect(resolveShopWares('s', s, catalogMap)[0]).toMatchObject({ price: 2, name: 'Minor Tonic' });
  });

  it('leaves the base item intact for a level with no matching variant', () => {
    const s = { s: { wares: [{ ref: 'tonic', level: 99 }] } };
    const [w] = resolveShopWares('s', s, catalogMap);
    expect(w).toMatchObject({ id: 'tonic', name: 'Tonic', wareKey: 'tonic' });
    expect(Array.isArray(w.variants)).toBe(true);
  });

  it('coerces an unresolvable price (priceless base, no variant) to 0', () => {
    const map = new Map([['p', { id: 'p', name: 'P', variants: [{ level: 1, price: 5 }] }]]);
    const s = { s: { wares: [{ ref: 'p' }] } }; // no level → no variant → no price
    expect(resolveShopWares('s', s, map)[0].price).toBe(0);
  });

  it('resolves a runestone ware from the rune catalog (value = stone + rune) (#801)', () => {
    const s = { s: { wares: [{ ref: 'runestone', runeRef: 'flaming' }] } };
    const [w] = resolveShopWares('s', s, catalogMap, runeMap);
    expect(w).toMatchObject({ name: 'Flaming Runestone', price: 503, wareKey: 'runestone@flaming' });
    expect(w.runestone.rune.id).toBe('flaming');
    expect(w.strikes).toBeUndefined();
  });

  it('honors a price override and stock on a runestone ware', () => {
    const s = { s: { wares: [{ ref: 'runestone', runeRef: 'flaming', price: 400, stock: 2 }] } };
    expect(resolveShopWares('s', s, catalogMap, runeMap)[0]).toMatchObject({ price: 400, stock: 2 });
  });

  it('stocks two different rune runestones as distinct, non-colliding wares', () => {
    const map = new Map([
      ['flaming', { id: 'flaming', name: 'Flaming', price: 500 }],
      ['frost', { id: 'frost', name: 'Frost', price: 500 }],
    ]);
    const s = { s: { wares: [{ ref: 'runestone', runeRef: 'flaming' }, { ref: 'runestone', runeRef: 'frost' }] } };
    const wares = resolveShopWares('s', s, catalogMap, map);
    expect(wares.map((w) => w.wareKey)).toEqual(['runestone@flaming', 'runestone@frost']);
  });
});
