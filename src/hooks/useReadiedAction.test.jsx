import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReadiedAction } from './useReadiedAction';

let store;
const setter = vi.fn((next) => {
  store = typeof next === 'function' ? next(store) : next;
});
vi.mock('./useSyncedState', () => ({
  useSyncedState: () => [store, setter],
}));

beforeEach(() => {
  store = null;
  setter.mockClear();
});

describe('useReadiedAction', () => {
  it('declares a normalized readied action', () => {
    const { result } = renderHook(() => useReadiedAction('p1'));
    act(() => result.current.declare({ actionName: ' Strike ', trigger: 'in reach', round: 2 }));
    expect(setter).toHaveBeenCalledWith(
      expect.objectContaining({ actionName: 'Strike', trigger: 'in reach', round: 2 })
    );
  });

  it('declares null when the action name is blank', () => {
    const { result } = renderHook(() => useReadiedAction('p1'));
    act(() => result.current.declare({ actionName: '  ' }));
    expect(setter).toHaveBeenCalledWith(null);
  });

  it('clears the readied action', () => {
    store = { actionName: 'Strike' };
    const { result } = renderHook(() => useReadiedAction('p1'));
    act(() => result.current.clear());
    expect(setter).toHaveBeenCalledWith(null);
  });

  it('returns the current readied action (null when none)', () => {
    const { result, rerender } = renderHook(() => useReadiedAction('p1'));
    expect(result.current.readied).toBeNull();
    store = { actionName: 'Strike' };
    rerender();
    expect(result.current.readied).toMatchObject({ actionName: 'Strike' });
  });
});
