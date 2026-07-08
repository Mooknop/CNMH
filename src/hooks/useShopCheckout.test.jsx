import { renderHook } from '@testing-library/react';

let session = { connected: true, foundryConnected: true };
vi.mock('../contexts/SessionContext', () => ({ useSession: () => session }));
vi.mock('../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'a', name: 'Aria', gold: 1000 }] }),
}));
const mockAppendEvent = vi.fn();
vi.mock('./useSessionLog', () => ({ useSessionLog: () => ({ appendEvent: mockAppendEvent }) }));
vi.mock('../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: { day: 7, month: 1, year: 4725 }, time: { hour: 8, minute: 0, second: 0 } }),
}));
let uidSeq = 0;
vi.mock('../utils/uid', () => ({ newEntryUid: () => `u-${++uidSeq}` }));

let gold = 1000;
let acquired = [];
let removed = [];
let orders = [];
let campaign = { locationLoreId: 'sandpoint' };
let shops = {};
const setGold = vi.fn((n) => { gold = typeof n === 'function' ? n(gold) : n; });
const setAcquired = vi.fn((n) => { acquired = typeof n === 'function' ? n(acquired) : n; });
const setRemoved = vi.fn((n) => { removed = typeof n === 'function' ? n(removed) : n; });
const setOrders = vi.fn((n) => { orders = typeof n === 'function' ? n(orders) : n; });
const setShops = vi.fn((n) => { shops = typeof n === 'function' ? n(shops) : n; });
vi.mock('./useSyncedState', () => ({
  useSyncedState: (key) => {
    if (String(key).startsWith('cnmh_gold_')) return [gold, setGold];
    if (String(key).startsWith('cnmh_acquired_')) return [acquired, setAcquired];
    if (String(key).startsWith('cnmh_removed_')) return [removed, setRemoved];
    if (String(key).startsWith('cnmh_runework_')) return [orders, setOrders];
    if (String(key) === 'cnmh_campaign_global') return [campaign, vi.fn()];
    if (String(key) === 'cnmh_shops_global') return [shops, setShops];
    return [null, vi.fn()];
  },
}));

import { useShopCheckout } from './useShopCheckout';

const ware = (price, name = 'Antidote') => ({ item: { id: name, name, price, wareKey: name }, qty: 1 });
const handoff = (uid, runes) => ({ gear: { uid, name: 'Longsword', strikes: [{}] }, runes });
const flaming = { id: 'flaming', type: 'property', name: 'Flaming', price: 500 };
const potency = { id: 'weapon-potency-1', type: 'fundamental', fundamental: 'potency', target: 'weapon', tier: 1, name: '+1 Weapon Potency', price: 35 };

beforeEach(() => {
  gold = 1000; acquired = []; removed = []; orders = []; uidSeq = 0; shops = {};
  campaign = { locationLoreId: 'sandpoint' };
  vi.clearAllMocks();
  session = { connected: true, foundryConnected: true };
});

// A resolved Sale Shelf ware as it reaches checkout (carries a saleId + wareKey).
const saleWare = (over) => ({
  item: {
    sale: 'rune', saleId: 'w1', ref: 'longsword', name: '+1 Flaming Longsword',
    runes: { potency: 1, property: ['flaming'] }, price: 800, saleFullPrice: 1000, stock: 1, wareKey: 'sale:w1',
    ...over,
  },
  qty: 1,
});
const packWare = () => ({
  item: {
    sale: 'scrollpack', saleId: 'p1', name: 'Scroll Pack (Rank 1)',
    scrolls: [{ spellRef: 'heal' }, { spellRef: 'heal' }, { spellRef: 'bless' }, { spellRef: 'heal' }],
    price: 12, saleFullPrice: 16, stock: 1, wareKey: 'sale:p1',
  },
  qty: 1,
});

describe('useShopCheckout', () => {
  it('buys wares: credits acquired and debits gold once', () => {
    const { result } = renderHook(() => useShopCheckout('a'));
    const r = result.current.checkout({ purchases: [ware(3), ware(10, 'Spellbook')], shopTitle: 'Shop' });
    expect(r).toMatchObject({ total: 13, wareCount: 2, handoffCount: 0 });
    expect(acquired).toHaveLength(2);
    expect(setGold).toHaveBeenCalledTimes(1);
    expect(gold).toBe(987);
  });

  it('commits a rune handoff: records the order, masks authored gear, debits once', () => {
    const { result } = renderHook(() => useShopCheckout('a'));
    const r = result.current.checkout({ handoffs: [handoff('w1', [potency, flaming])], shopTitle: 'Smith' });
    expect(r).toMatchObject({ total: 535, handoffCount: 1 });
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ weaponUid: 'w1', price: 535 });
    expect(removed).toContain('w1');
    expect(gold).toBe(465);
  });

  it('combines wares + handoffs in ONE transaction — single gold + acquired write', () => {
    const { result } = renderHook(() => useShopCheckout('a'));
    const r = result.current.checkout({ purchases: [ware(3)], handoffs: [handoff('w1', [flaming])], shopTitle: 'Shop' });
    expect(r).toMatchObject({ total: 503, wareCount: 1, handoffCount: 1 });
    // the bug this hook fixes: each overlay written exactly once, no clobber.
    expect(setGold).toHaveBeenCalledTimes(1);
    expect(setAcquired).toHaveBeenCalledTimes(1);
    expect(gold).toBe(497); // 1000 - (3 + 500)
    expect(acquired).toHaveLength(1); // the ware copy
    expect(orders).toHaveLength(1);
    expect(removed).toContain('w1');
  });

  it('splices a handed-over ACQUIRED gear from acquired instead of masking it', () => {
    acquired = [{ uid: 'w1', name: 'Longsword', strikes: [{}] }];
    const { result } = renderHook(() => useShopCheckout('a'));
    result.current.checkout({ handoffs: [handoff('w1', [flaming])], shopTitle: 'Smith' });
    expect(acquired.some((e) => e.uid === 'w1')).toBe(false); // spliced
    expect(removed).not.toContain('w1');
  });

  it('rejects when the combined total exceeds gold (no writes)', () => {
    gold = 100;
    const { result } = renderHook(() => useShopCheckout('a'));
    expect(result.current.checkout({ purchases: [ware(3)], handoffs: [handoff('w1', [flaming])] })).toBeNull();
    expect(setGold).not.toHaveBeenCalled();
    expect(setAcquired).not.toHaveBeenCalled();
    expect(setOrders).not.toHaveBeenCalled();
  });

  it('rejects an empty checkout and freezes offline', () => {
    const { result } = renderHook(() => useShopCheckout('a'));
    expect(result.current.checkout({ purchases: [], handoffs: [] })).toBeNull();
    session = { connected: true, foundryConnected: false };
    const { result: r2 } = renderHook(() => useShopCheckout('a'));
    expect(r2.current.checkout({ purchases: [ware(3)] })).toBeNull();
  });

  describe('Sale Shelf (#1138)', () => {
    it('expands a bought scroll pack into four loose scroll entries', () => {
      shops = { forge: { saleShelf: [{ sale: 'scrollpack', saleId: 'p1' }] } };
      const { result } = renderHook(() => useShopCheckout('a'));
      const r = result.current.checkout({ purchases: [packWare()], shopTitle: 'Forge', loreId: 'forge' });
      expect(r).toMatchObject({ total: 12, wareCount: 4 });
      expect(acquired).toHaveLength(4);
      acquired.forEach((e) => expect(e.scroll).toBeTruthy());
      expect(gold).toBe(988);
    });

    it('lands a runed sale item as one ref+runes entry and strikes it from the shelf', () => {
      shops = { forge: { saleShelf: [{ sale: 'rune', saleId: 'w1' }, { sale: 'rune', saleId: 'w2' }] } };
      const { result } = renderHook(() => useShopCheckout('a'));
      const r = result.current.checkout({ purchases: [saleWare()], shopTitle: 'Forge', loreId: 'forge' });
      expect(r).toMatchObject({ total: 800, wareCount: 1 });
      expect(acquired[0]).toMatchObject({ ref: 'longsword', runes: { potency: 1, property: ['flaming'] } });
      expect(acquired[0]).not.toHaveProperty('sale');
      // Only the bought saleId leaves the shelf; the other deal stays.
      expect(setShops).toHaveBeenCalledTimes(1);
      expect(shops.forge.saleShelf).toEqual([{ sale: 'rune', saleId: 'w2' }]);
    });

    it('rejects (writes nothing) when a bought deal is already gone from the shelf', () => {
      shops = { forge: { saleShelf: [{ sale: 'rune', saleId: 'other' }] } }; // w1 already gone
      const { result } = renderHook(() => useShopCheckout('a'));
      const r = result.current.checkout({ purchases: [saleWare()], shopTitle: 'Forge', loreId: 'forge' });
      expect(r).toEqual({ rejected: 'stale-shelf' });
      expect(setGold).not.toHaveBeenCalled();
      expect(setAcquired).not.toHaveBeenCalled();
      expect(setShops).not.toHaveBeenCalled();
    });

    it('does not touch the shop store for a regular (non-sale) checkout', () => {
      const { result } = renderHook(() => useShopCheckout('a'));
      result.current.checkout({ purchases: [ware(3)], shopTitle: 'Shop', loreId: 'forge' });
      expect(setShops).not.toHaveBeenCalled();
    });
  });

  describe('stocked-ware decrement (#1139)', () => {
    // A resolved stocked ware as it reaches checkout: carries the wareKey +
    // browse-time stock snapshot (the guard re-checks the CURRENT store).
    const stocked = (qty = 1, over = {}) => ({
      item: { id: 'antidote', name: 'Antidote', price: 3, stock: 4, wareKey: 'antidote', ...over },
      qty,
    });

    it('decrements the bought quantity off the stored ware (floor stays above 0)', () => {
      shops = { forge: { wares: [{ ref: 'antidote', stock: 4 }, { ref: 'spellbook' }] } };
      const { result } = renderHook(() => useShopCheckout('a'));
      const r = result.current.checkout({ purchases: [stocked(3)], shopTitle: 'Forge', loreId: 'forge' });
      expect(r).toMatchObject({ total: 9, wareCount: 3 });
      expect(setShops).toHaveBeenCalledTimes(1);
      expect(shops.forge.wares).toEqual([{ ref: 'antidote', stock: 1 }, { ref: 'spellbook' }]);
    });

    it('buying the last copies leaves the ware at stock 0 (sold out, not deleted)', () => {
      shops = { forge: { wares: [{ ref: 'antidote', stock: 2 }] } };
      const { result } = renderHook(() => useShopCheckout('a'));
      result.current.checkout({ purchases: [stocked(2)], shopTitle: 'Forge', loreId: 'forge' });
      expect(shops.forge.wares).toEqual([{ ref: 'antidote', stock: 0 }]);
    });

    it('rejects (writes nothing) when a line exceeds the CURRENT stock', () => {
      shops = { forge: { wares: [{ ref: 'antidote', stock: 1 }] } }; // browse showed 4, someone bought 3
      const { result } = renderHook(() => useShopCheckout('a'));
      const r = result.current.checkout({ purchases: [stocked(2)], shopTitle: 'Forge', loreId: 'forge' });
      expect(r).toEqual({ rejected: 'stale-stock' });
      expect(setGold).not.toHaveBeenCalled();
      expect(setAcquired).not.toHaveBeenCalled();
      expect(setShops).not.toHaveBeenCalled();
    });

    it('an unlimited (stock-less) ware never guards nor writes the store', () => {
      shops = { forge: { wares: [{ ref: 'antidote' }] } };
      const { result } = renderHook(() => useShopCheckout('a'));
      const r = result.current.checkout({ purchases: [stocked(99, { stock: undefined })], shopTitle: 'Forge', loreId: 'forge' });
      expect(r).toMatchObject({ wareCount: 99 });
      expect(setShops).not.toHaveBeenCalled();
    });

    it('matches a variant line by its ref@level wareKey', () => {
      shops = { forge: { wares: [{ ref: 'tonic', level: 3, stock: 2 }, { ref: 'tonic', level: 1, stock: 5 }] } };
      const { result } = renderHook(() => useShopCheckout('a'));
      result.current.checkout({
        purchases: [{ item: { id: 'tonic', name: 'Lesser Tonic', price: 12, stock: 2, wareKey: 'tonic@3' }, qty: 2 }],
        shopTitle: 'Forge', loreId: 'forge',
      });
      expect(shops.forge.wares).toEqual([{ ref: 'tonic', level: 3, stock: 0 }, { ref: 'tonic', level: 1, stock: 5 }]);
    });

    it('composes a sale-shelf strike + a stock decrement into ONE store write', () => {
      shops = { forge: {
        wares: [{ ref: 'antidote', stock: 4 }],
        saleShelf: [{ sale: 'rune', saleId: 'w1' }],
      } };
      const { result } = renderHook(() => useShopCheckout('a'));
      const r = result.current.checkout({ purchases: [saleWare(), stocked(1)], shopTitle: 'Forge', loreId: 'forge' });
      expect(r).toMatchObject({ total: 803, wareCount: 2 });
      expect(setShops).toHaveBeenCalledTimes(1);
      expect(shops.forge.saleShelf).toEqual([]);
      expect(shops.forge.wares).toEqual([{ ref: 'antidote', stock: 3 }]);
    });

    it('a sale line (stock 1, sale wareKey) never trips the stocked-ware guard', () => {
      shops = { forge: { wares: [{ ref: 'antidote', stock: 4 }], saleShelf: [{ sale: 'rune', saleId: 'w1' }] } };
      const { result } = renderHook(() => useShopCheckout('a'));
      const r = result.current.checkout({ purchases: [saleWare()], shopTitle: 'Forge', loreId: 'forge' });
      expect(r).toMatchObject({ total: 800 });
    });
  });
});
