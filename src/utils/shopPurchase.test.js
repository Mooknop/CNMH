import { expandWare, reuid, lineQty } from './shopPurchase';

let seq = 0;
vi.mock('./uid', () => ({ newEntryUid: () => `u-${++seq}` }));

beforeEach(() => { seq = 0; });

describe('expandWare', () => {
  it('expands a scroll pack into four loose scroll entries (minimal + fresh uids)', () => {
    const pack = {
      sale: 'scrollpack',
      saleId: 'p1',
      name: 'Scroll Pack (Rank 1)',
      scrolls: [{ spellRef: 'heal' }, { spellRef: 'heal' }, { spellRef: 'bless', rank: 1 }, { spellRef: 'heal' }],
      price: 12,
      saleFullPrice: 16,
      stock: 1,
      wareKey: 'sale:p1',
    };
    const out = expandWare(pack);
    expect(out).toHaveLength(4);
    // Each is a bare re-resolvable scroll entry — no sale/ware fields leak in.
    out.forEach((e) => {
      expect(e.uid).toMatch(/^u-/);
      expect(e.scroll).toBeTruthy();
      expect(e).not.toHaveProperty('sale');
      expect(e).not.toHaveProperty('saleFullPrice');
      expect(e).not.toHaveProperty('price');
    });
    expect(out[0].scroll).toEqual({ spellRef: 'heal' });
    expect(out[2].scroll).toEqual({ spellRef: 'bless', rank: 1 });
    // All uids distinct.
    expect(new Set(out.map((e) => e.uid)).size).toBe(4);
  });

  it('expands a rune sale item into one ref entry keeping the runes ids + level, dropping sale fields', () => {
    const runeItem = {
      sale: 'rune',
      saleId: 'r1',
      id: 'sale-r1',
      ref: 'power-ring',
      level: 5,
      name: 'Power Ring (Iron)',
      runes: { property: ['spellstoring'] },
      price: 2260,
      saleFullPrice: 2825,
      stock: 1,
      wareKey: 'sale:r1',
      powerRing: true,
    };
    const out = expandWare(runeItem);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ ref: 'power-ring', runes: { property: ['spellstoring'] }, uid: 'u-1', level: 5 });
    // sale/ware/display fields stripped — inventory re-derives them.
    ['sale', 'saleId', 'saleFullPrice', 'stock', 'wareKey', 'name', 'price'].forEach((k) =>
      expect(out[0]).not.toHaveProperty(k)
    );
  });

  it('omits level for a runed weapon (no grade variant)', () => {
    const weapon = { sale: 'rune', saleId: 'w1', ref: 'longsword', runes: { potency: 1, property: ['flaming'] } };
    expect(expandWare(weapon)).toEqual([
      { ref: 'longsword', runes: { potency: 1, property: ['flaming'] }, uid: 'u-1' },
    ]);
  });

  it('falls back to a single reuid copy for an ordinary ware', () => {
    const antidote = { id: 'antidote', name: 'Antidote', price: 3, stock: 5, wareKey: 'antidote' };
    const out = expandWare(antidote);
    expect(out).toHaveLength(1);
    // reuid strips stock/wareKey and mints a uid.
    expect(out[0]).toEqual({ id: 'antidote', name: 'Antidote', price: 3, uid: 'u-1' });
  });

  it('returns [] for a nullish ware', () => {
    expect(expandWare(null)).toEqual([]);
    expect(expandWare(undefined)).toEqual([]);
  });
});

describe('lineQty', () => {
  it('floors a positive qty and rejects unusable lines', () => {
    expect(lineQty({ item: {}, qty: 2.9 })).toBe(2);
    expect(lineQty({ item: {}, qty: 0 })).toBe(0);
    expect(lineQty({ qty: 3 })).toBe(0); // no item
    expect(lineQty(null)).toBe(0);
  });
});

describe('reuid', () => {
  it('mints a fresh uid and strips loadout-only fields', () => {
    const copy = reuid({ id: 'x', name: 'X', state: 'worn', hand: 1, stock: 2, wareKey: 'x' });
    expect(copy).toEqual({ id: 'x', name: 'X', uid: 'u-1' });
  });
});
