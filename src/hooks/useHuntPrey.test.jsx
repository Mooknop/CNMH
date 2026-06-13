import { renderHook, act } from '@testing-library/react';

vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  const store = {};
  const subs = new Set();
  const useSyncedState = (key, init) => {
    const [, force] = ReactLib.useReducer((x) => x + 1, 0);
    ReactLib.useEffect(() => { subs.add(force); return () => subs.delete(force); }, []);
    if (!(key in store)) store[key] = typeof init === 'function' ? init() : init;
    const set = (u) => {
      store[key] = typeof u === 'function' ? u(store[key]) : u;
      subs.forEach((f) => f());
    };
    return [store[key], set];
  };
  return {
    __esModule: true,
    useSyncedState,
    __store: store,
    __reset: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});

import { __store, __reset } from './useSyncedState';
import { useHuntPrey } from './useHuntPrey';

beforeEach(() => __reset());

describe('useHuntPrey', () => {
  it('starts with no prey', () => {
    const { result } = renderHook(() => useHuntPrey('AshkaBGosh'));
    expect(result.current.prey).toBeNull();
  });

  it('designate writes { targetKey, targetName, ts } to cnmh_huntprey_<charId>', () => {
    const { result } = renderHook(() => useHuntPrey('AshkaBGosh'));
    act(() => result.current.designate({ targetKey: 'gob', targetName: 'Goblin' }));
    expect(result.current.prey).toMatchObject({ targetKey: 'gob', targetName: 'Goblin' });
    expect(typeof __store['cnmh_huntprey_AshkaBGosh'].ts).toBe('number');
  });

  it('designate overwrites the previous prey (single target)', () => {
    const { result } = renderHook(() => useHuntPrey('AshkaBGosh'));
    act(() => result.current.designate({ targetKey: 'gob', targetName: 'Goblin' }));
    act(() => result.current.designate({ targetKey: 'orc', targetName: 'Orc' }));
    expect(result.current.prey.targetKey).toBe('orc');
  });

  it('clear resets prey to null (matches the daily-prep clear)', () => {
    const { result } = renderHook(() => useHuntPrey('AshkaBGosh'));
    act(() => result.current.designate({ targetKey: 'gob', targetName: 'Goblin' }));
    act(() => result.current.clear());
    expect(result.current.prey).toBeNull();
    expect(__store['cnmh_huntprey_AshkaBGosh']).toBeNull();
  });
});
