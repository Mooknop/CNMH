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

const OPENED = 100;
const setGlobal = (g) => { syncedValues['cnmh_take10_global'] = g; };
const activate = () => setGlobal({ active: true, openedAt: OPENED, startedBy: 'a' });
const setAlloc = (id, v) => {
  syncedValues[`cnmh_take10alloc_${id}`] = v;
  stateMap[`${id}:take10alloc`] = v;
};
const beat = (activities = [], ready = false) => ({ beatAt: OPENED, ready, activities });

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
    expect(result.current.minutes).toBe(10);
  });

  it('floors the block length at 10 minutes with no allocations', () => {
    activate();
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }, { id: 'b' }]),
    });
    expect(result.current.minutes).toBe(10);
    expect(result.current.readyCount).toBe(0);
  });

  it('derives the block length as the party-max total allocation', () => {
    activate();
    setAlloc('a', beat([{ id: 'treat-wounds', label: 'Treat Wounds', minutes: 10 }]));
    setAlloc('b', beat([{ id: 'learn-a-spell', label: 'Learn a Spell', minutes: 60 }]));
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }, { id: 'b' }]),
    });
    expect(result.current.minutes).toBe(60);
    expect(result.current.myMinutes).toBe(10);
  });

  it('is all-ready only when every PC is ready for the live beat', () => {
    activate();
    setAlloc('a', beat([], true));
    setAlloc('b', beat([], true));
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }, { id: 'b' }]),
    });
    expect(result.current.readyCount).toBe(2);
    expect(result.current.allReady).toBe(true);
    expect(result.current.ready).toBe(true);
  });

  it('ignores a stale-beat alloc for readiness and budget', () => {
    activate();
    setAlloc('a', beat([], true));
    setAlloc('b', { beatAt: 1, ready: true, activities: [{ minutes: 30 }] }); // stale
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }, { id: 'b' }]),
    });
    expect(result.current.readyCount).toBe(1);
    expect(result.current.allReady).toBe(false);
    expect(result.current.minutes).toBe(10); // stale 30 not counted
  });

  it('subscribes to each party PC alloc key', () => {
    renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }, { id: 'b' }]),
    });
    expect(mockSubscribe).toHaveBeenCalledWith('a', 'take10alloc', expect.any(Function));
    expect(mockSubscribe).toHaveBeenCalledWith('b', 'take10alloc', expect.any(Function));
  });

  it('recomputes when a subscribed alloc changes', () => {
    activate();
    setAlloc('a', beat([], true));
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }, { id: 'b' }]),
    });
    expect(result.current.allReady).toBe(false);
    act(() => {
      setAlloc('b', beat([], true));
      subscribers.forEach((s) => s.cb());
    });
    expect(result.current.allReady).toBe(true);
  });

  it('start() opens a beat with a fresh stamp', () => {
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }]),
    });
    act(() => result.current.start());
    const g = syncedValues['cnmh_take10_global'];
    expect(g.active).toBe(true);
    expect(g.startedBy).toBe('a');
    expect(typeof g.openedAt).toBe('number');
  });

  it('clear() closes the beat without wiping the stamp', () => {
    activate();
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }]),
    });
    act(() => result.current.clear());
    expect(syncedValues['cnmh_take10_global'].active).toBe(false);
    expect(syncedValues['cnmh_take10_global'].openedAt).toBe(OPENED);
  });

  it('setReady stamps the live beat', () => {
    activate();
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }]),
    });
    act(() => result.current.setReady(true));
    expect(syncedValues['cnmh_take10alloc_a']).toEqual({
      beatAt: OPENED, ready: true, activities: [],
    });
  });

  it('addActivity appends to the beat-stamped stack', () => {
    activate();
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }]),
    });
    act(() => result.current.addActivity({ id: 'refocus', label: 'Refocus', minutes: 10 }));
    act(() => result.current.addActivity({ id: 'refocus', label: 'Refocus', minutes: 10 }));
    expect(syncedValues['cnmh_take10alloc_a'].activities).toHaveLength(2);
  });

  it('addActivity drops a stale prior-beat stack', () => {
    activate();
    setAlloc('a', { beatAt: 1, ready: true, activities: [{ id: 'old', label: 'Old', minutes: 30 }] });
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }]),
    });
    act(() => result.current.addActivity({ id: 'refocus', label: 'Refocus', minutes: 10 }));
    const a = syncedValues['cnmh_take10alloc_a'];
    expect(a.beatAt).toBe(OPENED);
    expect(a.ready).toBe(false);
    expect(a.activities).toEqual([{ id: 'refocus', label: 'Refocus', minutes: 10 }]);
  });

  it('removeActivity removes by index', () => {
    activate();
    setAlloc('a', beat([
      { id: 'x', label: 'X', minutes: 10 },
      { id: 'y', label: 'Y', minutes: 10 },
    ]));
    const { result } = renderHook(() => useTake10('a'), {
      wrapper: makeWrapper([{ id: 'a' }]),
    });
    act(() => result.current.removeActivity(0));
    expect(syncedValues['cnmh_take10alloc_a'].activities).toEqual([
      { id: 'y', label: 'Y', minutes: 10 },
    ]);
  });
});
