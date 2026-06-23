import { renderHook, act } from '@testing-library/react';

// useSyncedState fronts the single global wares store.
let store = {};
const mockSetShops = vi.fn((next) => {
  store = typeof next === 'function' ? next(store) : next;
});
vi.mock('./useSyncedState', () => ({
  useSyncedState: () => [store, mockSetShops],
}));

import { useShops } from './useShops';

beforeEach(() => {
  store = {};
  vi.clearAllMocks();
});

describe('useShops', () => {
  it('exposes the current store', () => {
    store = { 'bottled-solutions': { wares: [{ ref: 'antidote' }] } };
    const { result } = renderHook(() => useShops());
    expect(result.current.shops).toBe(store);
  });

  it('setWares writes a shop wares list, preserving other shops', () => {
    store = { 'curious-goblin': { wares: [{ ref: 'spellbook' }] } };
    const { result } = renderHook(() => useShops());

    act(() => result.current.setWares('bottled-solutions', [{ ref: 'antidote', price: 8 }]));

    expect(store).toEqual({
      'curious-goblin': { wares: [{ ref: 'spellbook' }] },
      'bottled-solutions': { wares: [{ ref: 'antidote', price: 8 }] },
    });
  });

  it('setWares replaces an existing shop wares list', () => {
    store = { 's': { wares: [{ ref: 'old' }] } };
    const { result } = renderHook(() => useShops());

    act(() => result.current.setWares('s', [{ ref: 'new' }]));

    expect(store.s.wares).toEqual([{ ref: 'new' }]);
  });

  it('setWares coerces a non-array to an empty list', () => {
    const { result } = renderHook(() => useShops());
    act(() => result.current.setWares('s', null));
    expect(store.s.wares).toEqual([]);
  });

  it('setWares is a no-op without a loreId', () => {
    const { result } = renderHook(() => useShops());
    act(() => result.current.setWares('', [{ ref: 'x' }]));
    expect(mockSetShops).not.toHaveBeenCalled();
  });
});
