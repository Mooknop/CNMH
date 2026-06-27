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

  it('setShop merges meta fields onto a fresh entry (Set up as shop)', () => {
    const { result } = renderHook(() => useShops());
    act(() => result.current.setShop('s', { keeper: '', open: true, revealed: false, wares: [] }));
    expect(store.s).toEqual({ keeper: '', open: true, revealed: false, wares: [] });
  });

  it('setShop merges a partial patch without clobbering other fields or wares', () => {
    store = { s: { keeper: 'Vorl', open: true, revealed: false, wares: [{ ref: 'antidote' }] } };
    const { result } = renderHook(() => useShops());

    act(() => result.current.setShop('s', { revealed: true }));

    expect(store.s).toEqual({
      keeper: 'Vorl',
      open: true,
      revealed: true,
      wares: [{ ref: 'antidote' }],
    });
  });

  it('setShop replaces wares wholesale when the patch carries them', () => {
    store = { s: { keeper: 'Vorl', wares: [{ ref: 'old' }] } };
    const { result } = renderHook(() => useShops());

    act(() => result.current.setShop('s', { wares: [{ ref: 'new' }] }));

    expect(store.s).toEqual({ keeper: 'Vorl', wares: [{ ref: 'new' }] });
  });

  it('setShop preserves sibling shops', () => {
    store = { other: { wares: [{ ref: 'x' }] } };
    const { result } = renderHook(() => useShops());
    act(() => result.current.setShop('s', { keeper: 'Vorl' }));
    expect(store.other).toEqual({ wares: [{ ref: 'x' }] });
  });

  it('setShop is a no-op without a loreId', () => {
    const { result } = renderHook(() => useShops());
    act(() => result.current.setShop('', { keeper: 'Vorl' }));
    expect(mockSetShops).not.toHaveBeenCalled();
  });

  it('removeShop deletes the entry, preserving siblings', () => {
    store = { s: { wares: [{ ref: 'x' }] }, other: { wares: [{ ref: 'y' }] } };
    const { result } = renderHook(() => useShops());

    act(() => result.current.removeShop('s'));

    expect(store).toEqual({ other: { wares: [{ ref: 'y' }] } });
  });

  it('removeShop leaves the store unchanged for an absent entry', () => {
    store = { s: { wares: [] } };
    const { result } = renderHook(() => useShops());

    act(() => result.current.removeShop('nope'));
    expect(store).toEqual({ s: { wares: [] } });
  });

  it('removeShop is a no-op without a loreId', () => {
    const { result } = renderHook(() => useShops());
    act(() => result.current.removeShop(''));
    expect(mockSetShops).not.toHaveBeenCalled();
  });
});
