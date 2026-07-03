import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('./useSyncedState', () => ({ useSyncedState: vi.fn() }));
import { useSyncedState } from './useSyncedState';
import { useCurrentRoom } from './useCurrentRoom';

const rooms = [
  { id: 'a1', code: 'A1', name: 'Entrance' },
  { id: 'a3', code: 'A3', name: 'Shrine' },
];

describe('useCurrentRoom', () => {
  let value;
  const setter = vi.fn();
  beforeEach(() => {
    value = null;
    useSyncedState.mockImplementation(() => [value, setter]);
  });

  it('resolves the pinned id to its room doc', () => {
    value = 'a3';
    const { result } = renderHook(() => useCurrentRoom(rooms));
    expect(result.current.pinnedId).toBe('a3');
    expect(result.current.room.name).toBe('Shrine');
  });

  it('treats a dangling pin (id no longer present) as unpinned', () => {
    value = 'gone';
    const { result } = renderHook(() => useCurrentRoom(rooms));
    expect(result.current.pinnedId).toBe(null);
    expect(result.current.room).toBe(null);
  });

  it('pinRoom writes the id and clearRoom writes null', () => {
    const { result } = renderHook(() => useCurrentRoom(rooms));
    act(() => result.current.pinRoom('a1'));
    expect(setter).toHaveBeenCalledWith('a1');
    act(() => result.current.clearRoom());
    expect(setter).toHaveBeenCalledWith(null);
  });

  it('normalizes an empty pin to null', () => {
    const { result } = renderHook(() => useCurrentRoom(rooms));
    act(() => result.current.pinRoom(''));
    expect(setter).toHaveBeenCalledWith(null);
  });
});
