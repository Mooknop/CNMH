import { renderHook, act } from '@testing-library/react';

// useSyncedState fronts the single global support map.
let store = {};
const mockSet = vi.fn((next) => {
  store = typeof next === 'function' ? next(store) : next;
});
vi.mock('./useSyncedState', () => ({
  useSyncedState: () => [store, mockSet],
}));

import { useLocationSupport } from './useLocationSupport';

beforeEach(() => {
  store = {};
  vi.clearAllMocks();
});

describe('useLocationSupport', () => {
  it('exposes the current support map', () => {
    store = { 'the-rusty-dragon': { earnedAt: 'x' } };
    const { result } = renderHook(() => useLocationSupport());
    expect(result.current.supported).toBe(store);
  });

  it('coerces a null store to an empty map', () => {
    store = null;
    const { result } = renderHook(() => useLocationSupport());
    expect(result.current.supported).toEqual({});
  });

  it('isSupported reflects presence', () => {
    store = { 'red-dog-smithy': { earnedAt: null } };
    const { result } = renderHook(() => useLocationSupport());
    expect(result.current.isSupported('red-dog-smithy')).toBe(true);
    expect(result.current.isSupported('the-hagfish')).toBe(false);
    expect(result.current.isSupported('')).toBe(false);
  });

  it('setSupport(on) adds an entry with the earnedAt stamp', () => {
    const { result } = renderHook(() => useLocationSupport());
    act(() => result.current.setSupport('the-hagfish', true, 'day-7'));
    expect(store).toEqual({ 'the-hagfish': { earnedAt: 'day-7' } });
  });

  it('setSupport(on) preserves siblings', () => {
    store = { a: { earnedAt: '1' } };
    const { result } = renderHook(() => useLocationSupport());
    act(() => result.current.setSupport('b', true));
    expect(store).toEqual({ a: { earnedAt: '1' }, b: { earnedAt: null } });
  });

  it('re-granting keeps the original stamp', () => {
    store = { a: { earnedAt: 'first' } };
    const { result } = renderHook(() => useLocationSupport());
    act(() => result.current.setSupport('a', true, 'second'));
    expect(store.a.earnedAt).toBe('first');
  });

  it('setSupport(off) removes the entry, preserving siblings', () => {
    store = { a: { earnedAt: '1' }, b: { earnedAt: '2' } };
    const { result } = renderHook(() => useLocationSupport());
    act(() => result.current.setSupport('a', false));
    expect(store).toEqual({ b: { earnedAt: '2' } });
  });

  it('setSupport(off) on an absent entry is a no-op reference', () => {
    store = { a: { earnedAt: '1' } };
    const { result } = renderHook(() => useLocationSupport());
    act(() => result.current.setSupport('nope', false));
    expect(store).toEqual({ a: { earnedAt: '1' } });
  });

  it('setSupport is a no-op without an id', () => {
    const { result } = renderHook(() => useLocationSupport());
    act(() => result.current.setSupport('', true));
    expect(mockSet).not.toHaveBeenCalled();
  });
});
