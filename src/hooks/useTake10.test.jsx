import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { CharacterContext } from '../contexts/CharacterContext';

// Keyed useSyncedState mock — the hook reads two keys (global + own alloc), so
// a single-value stub won't do. Module-level store reset per test.
let syncedValues = {};
vi.mock('./useSyncedState', () => ({
  __esModule: true,
  useSyncedState: (key, initial) => {
    if (!(key in syncedValues)) syncedValues[key] = initial;
    const setter = (updater) => {
      syncedValues[key] =
        typeof updater === 'function' ? updater(syncedValues[key]) : updater;
    };
    return [syncedValues[key], setter];
  },
}));

let stateMap = {};
let subscribers = [];
const mockGetState = vi.fn();
const mockSubscribe = vi.fn();

vi.mock('../contexts/SessionContext', () => ({
  __esModule: true,
  useSession: () => ({ getState: mockGetState, subscribe: mockSubscribe }),
}));

import { useTake10 } from './useTake10';

const makeWrapper = (characters) =>
  function Wrapper({ children }) {
    return (
      <CharacterContext.Provider value={{ characters }}>
        {children}
      </CharacterContext.Provider>
    );
  };

const setGlobal = (g) => { syncedValues['cnmh_take10_global'] = g; };
const setAlloc = (id, v) => {
  syncedValues[`cnmh_take10alloc_${id}`] = v;
  stateMap[`${id}:take10alloc`] = v;
};

beforeEach(() => {
  syncedValues = {};
  stateMap = {};
  subscribers = [];
  mockGetState.mockImplementation((id, type) => stateMap[`${id}:${type}`]);
  mockSubscribe.mockImplementation((id, type, cb) => {
    subscribers.push({ id, type, cb });
    return () => { subscribers = subscribers.filter((s) => s.cb !== cb); };
  });
});

describe('useTake10', () => {
  it('is inactive by default', () => {
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }, { id: 'b' }]),
    });
    expect(result.current.active).toBe(false);
    expect(result.current.allReady).toBe(false);
    expect(result.current.readyCount).toBe(0);
  });

  it('is not all-ready while no one has stamped the current beat', () => {
    setGlobal({ active: true, minutes: 10, openedAt: 100, startedBy: 'a' });
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }, { id: 'b' }]),
    });
    expect(result.current.active).toBe(true);
    expect(result.current.allReady).toBe(false);
    expect(result.current.readyCount).toBe(0);
  });

  it('is all-ready when every PC stamps the current openedAt', () => {
    setGlobal({ active: true, minutes: 10, openedAt: 100, startedBy: 'a' });
    setAlloc('a', { readyAt: 100 });
    setAlloc('b', { readyAt: 100 });
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }, { id: 'b' }]),
    });
    expect(result.current.readyCount).toBe(2);
    expect(result.current.allReady).toBe(true);
    expect(result.current.ready).toBe(true);
  });

  it('ignores a stale ready stamp from a prior beat', () => {
    setGlobal({ active: true, minutes: 10, openedAt: 200, startedBy: 'a' });
    setAlloc('a', { readyAt: 200 });
    setAlloc('b', { readyAt: 100 }); // stale
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }, { id: 'b' }]),
    });
    expect(result.current.readyCount).toBe(1);
    expect(result.current.allReady).toBe(false);
  });

  it('subscribes to each party PC alloc key', () => {
    renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }, { id: 'b' }]),
    });
    expect(mockSubscribe).toHaveBeenCalledWith('a', 'take10alloc', expect.any(Function));
    expect(mockSubscribe).toHaveBeenCalledWith('b', 'take10alloc', expect.any(Function));
  });

  it('recomputes readiness when a subscribed alloc changes', () => {
    setGlobal({ active: true, minutes: 10, openedAt: 100, startedBy: 'a' });
    setAlloc('a', { readyAt: 100 });
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }, { id: 'b' }]),
    });
    expect(result.current.allReady).toBe(false);

    act(() => {
      setAlloc('b', { readyAt: 100 });
      subscribers.forEach((s) => s.cb());
    });
    expect(result.current.allReady).toBe(true);
  });

  it('start() opens a beat with a fresh stamp and the given minutes', () => {
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }]),
    });
    act(() => result.current.start(10));
    const g = syncedValues['cnmh_take10_global'];
    expect(g.active).toBe(true);
    expect(g.minutes).toBe(10);
    expect(g.startedBy).toBe('a');
    expect(typeof g.openedAt).toBe('number');
  });

  it('clear() closes the beat without wiping the stamp', () => {
    setGlobal({ active: true, minutes: 10, openedAt: 100, startedBy: 'a' });
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }]),
    });
    act(() => result.current.clear());
    expect(syncedValues['cnmh_take10_global'].active).toBe(false);
    expect(syncedValues['cnmh_take10_global'].openedAt).toBe(100);
  });

  it('setReady stamps and unstamps the current beat', () => {
    setGlobal({ active: true, minutes: 10, openedAt: 100, startedBy: 'a' });
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }]),
    });
    act(() => result.current.setReady(true));
    expect(syncedValues['cnmh_take10alloc_a'].readyAt).toBe(100);
    act(() => result.current.setReady(false));
    expect(syncedValues['cnmh_take10alloc_a'].readyAt).toBe(null);
  });
});
