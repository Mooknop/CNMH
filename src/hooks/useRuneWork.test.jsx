import { renderHook } from '@testing-library/react';
import { createWorkOrder, createHandoffOrder } from '../utils/runeWorkOrder';
import { toGameSeconds } from '../utils/gameTime';

let session = { connected: true, foundryConnected: true };
vi.mock('../contexts/SessionContext', () => ({ useSession: () => session }));
vi.mock('../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'a', name: 'Aria', gold: 1000 }] }),
}));
const mockAppendEvent = vi.fn();
vi.mock('./useSessionLog', () => ({ useSessionLog: () => ({ appendEvent: mockAppendEvent }) }));

// Fixed "now": 7 Calistril 4725, 08:00.
const NOW = { day: 7, month: 1, year: 4725, hour: 8, minute: 0, second: 0 };
vi.mock('../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: NOW.day, month: NOW.month, year: NOW.year },
    time: { hour: NOW.hour, minute: NOW.minute, second: NOW.second },
  }),
}));

let uidSeq = 0;
vi.mock('../utils/uid', () => ({ newEntryUid: () => `u-${++uidSeq}` }));

// Keyed synced-state fronts: runework / gold / acquired / removed / campaign.
let orders = [];
let gold = 1000;
let acquired = [];
let removed = [];
let campaign = { locationLoreId: 'sandpoint' };
const setOrders = vi.fn((n) => { orders = typeof n === 'function' ? n(orders) : n; });
const setGold = vi.fn((n) => { gold = typeof n === 'function' ? n(gold) : n; });
const setAcquired = vi.fn((n) => { acquired = typeof n === 'function' ? n(acquired) : n; });
const setRemoved = vi.fn((n) => { removed = typeof n === 'function' ? n(removed) : n; });
vi.mock('./useSyncedState', () => ({
  useSyncedState: (key) => {
    if (String(key).startsWith('cnmh_runework_')) return [orders, setOrders];
    if (String(key).startsWith('cnmh_gold_')) return [gold, setGold];
    if (String(key).startsWith('cnmh_acquired_')) return [acquired, setAcquired];
    if (String(key).startsWith('cnmh_removed_')) return [removed, setRemoved];
    if (String(key) === 'cnmh_campaign_global') return [campaign, vi.fn()];
    return [null, vi.fn()];
  },
}));

import { useRuneWork } from './useRuneWork';

const weapon = { uid: 'w1', name: 'Longsword', strikes: { damage: '1d8' } };
const rune = { id: 'flaming', name: 'Flaming', price: 500 };

beforeEach(() => {
  orders = []; gold = 1000; acquired = []; removed = []; campaign = { locationLoreId: 'sandpoint' };
  uidSeq = 0;
  vi.clearAllMocks();
  session = { connected: true, foundryConnected: true };
});

describe('commitHandoff (#857 S7a)', () => {
  const potency = { id: 'weapon-potency-1', type: 'fundamental', fundamental: 'potency', target: 'weapon', tier: 1, name: '+1 Weapon Potency', price: 35 };
  const flaming = { id: 'flaming', type: 'property', name: 'Flaming', price: 500 };

  it('freezes in the offline sandbox', () => {
    session = { connected: true, foundryConnected: false };
    const { result } = renderHook(() => useRuneWork('a'));
    expect(result.current.commitHandoff([{ gear: weapon, runes: [flaming] }], 'The Etcher')).toBeNull();
  });

  it('records one order per gear, pulls each, and debits the combined total once', () => {
    const { result } = renderHook(() => useRuneWork('a'));
    const out = result.current.commitHandoff([{ gear: weapon, runes: [potency, flaming] }], 'The Etcher');
    expect(out).toHaveLength(1);
    expect(setOrders).toHaveBeenCalledWith([
      expect.objectContaining({ weaponUid: 'w1', runeName: '+1 Weapon Potency, Flaming', price: 535 }),
    ]);
    expect(removed).toContain('w1');
    expect(setGold).toHaveBeenCalledTimes(1);
    expect(setGold).toHaveBeenCalledWith(465); // 1000 - 535
  });

  it('rejects when the combined rune total exceeds gold (no writes)', () => {
    gold = 100;
    const { result } = renderHook(() => useRuneWork('a'));
    expect(result.current.commitHandoff([{ gear: weapon, runes: [potency, flaming] }], 'The Etcher')).toBeNull();
    expect(setOrders).not.toHaveBeenCalled();
    expect(setGold).not.toHaveBeenCalled();
  });

  it('ignores empty payloads', () => {
    const { result } = renderHook(() => useRuneWork('a'));
    expect(result.current.commitHandoff([], 'The Etcher')).toBeNull();
    expect(result.current.commitHandoff([{ gear: weapon, runes: [] }], 'The Etcher')).toBeNull();
  });
});

describe('collect', () => {
  // An order placed 2 days ago in Sandpoint — ready now (24h elapsed, in town).
  const past = { ...NOW, day: NOW.day - 2 };
  const readyOrder = () => ({ ...createWorkOrder({ weapon, rune, locationId: 'sandpoint', now: past, price: 500 }), id: 'ord-ready' });

  it('credits the runed weapon and clears the order when ready', () => {
    orders = [readyOrder()];
    const { result } = renderHook(() => useRuneWork('a'));
    expect(result.current.collect('ord-ready')).toBe(true);
    expect(setAcquired).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Longsword', runes: { property: ['flaming'] } }),
    ]);
    expect(setOrders).toHaveBeenCalledWith([]); // order removed
  });

  it('refuses to collect when not yet in the shop’s town', () => {
    campaign = { locationLoreId: 'magnimar' };
    orders = [readyOrder()];
    const { result } = renderHook(() => useRuneWork('a'));
    expect(result.current.collect('ord-ready')).toBe(false);
    expect(setAcquired).not.toHaveBeenCalled();
    expect(setOrders).not.toHaveBeenCalled();
  });

  it('refuses to collect before the 24h turnaround', () => {
    // Placed "now" in Sandpoint → not ready until tomorrow.
    orders = [{ ...createWorkOrder({ weapon, rune, locationId: 'sandpoint', now: NOW, price: 500 }), id: 'ord-fresh' }];
    const { result } = renderHook(() => useRuneWork('a'));
    expect(result.current.collect('ord-fresh')).toBe(false);
  });

  it('verifies the ready order’s time math', () => {
    const o = readyOrder();
    expect(toGameSeconds(NOW)).toBeGreaterThanOrEqual(o.readyAtSeconds);
  });

  it('applies a whole multi-rune handoff order on collect (#857 S7a)', () => {
    const runes = [
      { id: 'weapon-potency-1', type: 'fundamental', fundamental: 'potency', target: 'weapon', tier: 1, name: '+1 Weapon Potency', price: 35 },
      { id: 'flaming', type: 'property', name: 'Flaming', price: 500 },
    ];
    orders = [{ ...createHandoffOrder({ gear: weapon, runes, locationId: 'sandpoint', now: past }), id: 'ord-multi' }];
    const { result } = renderHook(() => useRuneWork('a'));
    expect(result.current.collect('ord-multi')).toBe(true);
    // potency applied first opens the slot the property rune lands in.
    expect(setAcquired).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Longsword', runes: { potency: 1, property: ['flaming'] } }),
    ]);
  });
});
