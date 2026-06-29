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
const setGold = vi.fn((n) => { gold = typeof n === 'function' ? n(gold) : n; });
const setAcquired = vi.fn((n) => { acquired = typeof n === 'function' ? n(acquired) : n; });
const setRemoved = vi.fn((n) => { removed = typeof n === 'function' ? n(removed) : n; });
const setOrders = vi.fn((n) => { orders = typeof n === 'function' ? n(orders) : n; });
vi.mock('./useSyncedState', () => ({
  useSyncedState: (key) => {
    if (String(key).startsWith('cnmh_gold_')) return [gold, setGold];
    if (String(key).startsWith('cnmh_acquired_')) return [acquired, setAcquired];
    if (String(key).startsWith('cnmh_removed_')) return [removed, setRemoved];
    if (String(key).startsWith('cnmh_runework_')) return [orders, setOrders];
    if (String(key) === 'cnmh_campaign_global') return [campaign, vi.fn()];
    return [null, vi.fn()];
  },
}));

import { useShopCheckout } from './useShopCheckout';

const ware = (price, name = 'Antidote') => ({ item: { id: name, name, price, wareKey: name }, qty: 1 });
const handoff = (uid, runes) => ({ gear: { uid, name: 'Longsword', strikes: [{}] }, runes });
const flaming = { id: 'flaming', type: 'property', name: 'Flaming', price: 500 };
const potency = { id: 'weapon-potency-1', type: 'fundamental', fundamental: 'potency', target: 'weapon', tier: 1, name: '+1 Weapon Potency', price: 35 };

beforeEach(() => {
  gold = 1000; acquired = []; removed = []; orders = []; uidSeq = 0;
  campaign = { locationLoreId: 'sandpoint' };
  vi.clearAllMocks();
  session = { connected: true, foundryConnected: true };
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
});
