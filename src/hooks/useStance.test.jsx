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
import { useStance } from './useStance';

beforeEach(() => __reset());

describe('useStance', () => {
  it('starts with no active stance', () => {
    const { result } = renderHook(() => useStance('Blu-Kakke'));
    expect(result.current.active).toBe(false);
    expect(result.current.stanceName).toBeNull();
  });

  it('enter writes { active: true, name, ts } to cnmh_stance_<charId>', () => {
    const { result } = renderHook(() => useStance('Blu-Kakke'));
    act(() => result.current.enter('Dragon Stance'));
    expect(result.current.active).toBe(true);
    expect(result.current.stanceName).toBe('Dragon Stance');
    expect(__store['cnmh_stance_Blu-Kakke']).toMatchObject({ active: true, name: 'Dragon Stance' });
    expect(typeof __store['cnmh_stance_Blu-Kakke'].ts).toBe('number');
  });

  it('leave writes the idle shape back', () => {
    const { result } = renderHook(() => useStance('Blu-Kakke'));
    act(() => result.current.enter('Dragon Stance'));
    act(() => result.current.leave());
    expect(result.current.active).toBe(false);
    expect(result.current.stanceName).toBeNull();
    expect(__store['cnmh_stance_Blu-Kakke']).toMatchObject({ active: false, name: null });
  });

  it('entering a second stance overwrites the first (single stance)', () => {
    const { result } = renderHook(() => useStance('Blu-Kakke'));
    act(() => result.current.enter('Dragon Stance'));
    act(() => result.current.enter('Tiger Stance'));
    expect(result.current.stanceName).toBe('Tiger Stance');
  });

  it('falsy charId falls back to the none key', () => {
    renderHook(() => useStance(null));
    expect('cnmh_stance_none' in __store).toBe(true);
  });
});
