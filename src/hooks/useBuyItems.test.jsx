import { renderHook } from '@testing-library/react';

// Session/content/log stubs. The buyer's acquired + gold overlays are fronted by
// useSyncedState; the log append is spied.
let session = {};
vi.mock('../contexts/SessionContext', () => ({
  __esModule: true,
  useSession: () => session,
}));

vi.mock('../contexts/ContentContext', () => ({
  __esModule: true,
  useContent: () => ({ characters: [{ id: 'a', name: 'Aria', gold: 100 }] }),
}));

const mockAppendEvent = vi.fn();
vi.mock('./useSessionLog', () => ({
  useSessionLog: () => ({ log: [], appendEvent: mockAppendEvent }),
}));

// Deterministic uids so credited entries are assertable.
let uidSeq = 0;
vi.mock('../utils/uid', () => ({
  newEntryUid: () => `buy-${++uidSeq}`,
}));

// useSyncedState fronts the buyer's own acquired list + gold balance.
let buyerAcquired = [];
let buyerGold = 100;
const mockSetAcquired = vi.fn((next) => {
  buyerAcquired = typeof next === 'function' ? next(buyerAcquired) : next;
});
const mockSetGold = vi.fn((next) => {
  buyerGold = typeof next === 'function' ? next(buyerGold) : next;
});
vi.mock('./useSyncedState', () => ({
  useSyncedState: (key, initial) => {
    if (String(key).startsWith('cnmh_acquired_')) return [buyerAcquired, mockSetAcquired];
    if (String(key).startsWith('cnmh_gold_')) return [buyerGold, mockSetGold];
    return [initial, vi.fn()];
  },
}));

import { useBuyItems } from './useBuyItems';

const sword = { id: 'longsword', name: 'Longsword', price: 10, stock: 5, weight: 1 };
const potion = { id: 'healing', name: 'Healing Potion', price: 4 };

beforeEach(() => {
  buyerAcquired = [];
  buyerGold = 100;
  uidSeq = 0;
  vi.clearAllMocks();
  session = { connected: true, foundryConnected: true };
});

describe('useBuyItems', () => {
  it('credits a fresh-uid\'d inline copy per unit and strips the stock cap', () => {
    const { result } = renderHook(() => useBuyItems('a'));
    const receipt = result.current.buy([{ item: sword, qty: 2 }], 'Smithy');
    expect(receipt).toEqual({ total: 20, count: 2 });
    expect(mockSetAcquired).toHaveBeenCalledWith([
      { id: 'longsword', name: 'Longsword', price: 10, weight: 1, uid: 'buy-1' },
      { id: 'longsword', name: 'Longsword', price: 10, weight: 1, uid: 'buy-2' },
    ]);
  });

  it('strips the shop-only wareKey and variants ladder from a bought variant', () => {
    const tonic = {
      id: 'tonic',
      name: 'Lesser Tonic',
      price: 12,
      wareKey: 'tonic@3',
      variants: [{ level: 1, name: 'Minor Tonic' }, { level: 3, name: 'Lesser Tonic' }],
    };
    const { result } = renderHook(() => useBuyItems('a'));
    result.current.buy([{ item: tonic, qty: 1 }], 'Apothecary');
    expect(mockSetAcquired).toHaveBeenCalledWith([
      { id: 'tonic', name: 'Lesser Tonic', price: 12, uid: 'buy-1' },
    ]);
  });

  it('debits the cart total from gold', () => {
    const { result } = renderHook(() => useBuyItems('a'));
    result.current.buy([{ item: sword, qty: 2 }, { item: potion, qty: 3 }]);
    expect(mockSetGold).toHaveBeenCalledWith(100 - (20 + 12));
  });

  it('appends to an existing acquired overlay rather than replacing it', () => {
    buyerAcquired = [{ ref: 'dagger', uid: 'x' }];
    const { result } = renderHook(() => useBuyItems('a'));
    result.current.buy([{ item: potion, qty: 1 }]);
    expect(mockSetAcquired).toHaveBeenCalledWith([
      { ref: 'dagger', uid: 'x' },
      { id: 'healing', name: 'Healing Potion', price: 4, uid: 'buy-1' },
    ]);
  });

  it('credits items BEFORE debiting gold', () => {
    const { result } = renderHook(() => useBuyItems('a'));
    result.current.buy([{ item: sword, qty: 1 }]);
    const credit = mockSetAcquired.mock.invocationCallOrder[0];
    const debit = mockSetGold.mock.invocationCallOrder[0];
    expect(credit).toBeLessThan(debit);
  });

  it('logs the purchase with shop name, lines, and total', () => {
    const { result } = renderHook(() => useBuyItems('a'));
    result.current.buy([{ item: sword, qty: 2 }], 'Smithy');
    expect(mockAppendEvent).toHaveBeenCalledWith({
      type: 'action',
      text: 'Aria bought 2× Longsword from Smithy for 20 gp',
    });
  });

  it('rejects when the total exceeds the balance (no writes)', () => {
    buyerGold = 15;
    const { result } = renderHook(() => useBuyItems('a'));
    expect(result.current.buy([{ item: sword, qty: 2 }])).toBeNull();
    expect(mockSetAcquired).not.toHaveBeenCalled();
    expect(mockSetGold).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it('allows spending the exact balance', () => {
    buyerGold = 20;
    const { result } = renderHook(() => useBuyItems('a'));
    expect(result.current.buy([{ item: sword, qty: 2 }])).toEqual({ total: 20, count: 2 });
  });

  it('rejects an empty cart', () => {
    const { result } = renderHook(() => useBuyItems('a'));
    expect(result.current.buy([])).toBeNull();
    expect(mockSetGold).not.toHaveBeenCalled();
  });

  it('drops lines with a non-positive or non-numeric qty', () => {
    const { result } = renderHook(() => useBuyItems('a'));
    expect(result.current.buy([{ item: sword, qty: 0 }, { item: potion, qty: -1 }])).toBeNull();
    expect(result.current.buy([{ item: potion, qty: 2.9 }])).toEqual({ total: 8, count: 2 });
  });

  it('rejects with no buyer', () => {
    const { result } = renderHook(() => useBuyItems(''));
    expect(result.current.buy([{ item: sword, qty: 1 }])).toBeNull();
    expect(mockSetGold).not.toHaveBeenCalled();
  });

  it('freezes the purchase in the offline sandbox (DO up, Foundry down)', () => {
    session = { connected: true, foundryConnected: false };
    const { result } = renderHook(() => useBuyItems('a'));
    expect(result.current.buy([{ item: sword, qty: 1 }])).toBeNull();
    expect(mockSetAcquired).not.toHaveBeenCalled();
    expect(mockSetGold).not.toHaveBeenCalled();
  });

  it('allows the purchase when fully offline (pure local)', () => {
    session = { connected: false, foundryConnected: false };
    const { result } = renderHook(() => useBuyItems('a'));
    expect(result.current.buy([{ item: sword, qty: 1 }])).toEqual({ total: 10, count: 1 });
  });

  it('falls back to a generic shop name in the log', () => {
    const { result } = renderHook(() => useBuyItems('a'));
    result.current.buy([{ item: potion, qty: 1 }]);
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Aria bought 1× Healing Potion from a shop for 4 gp' }),
    );
  });
});
