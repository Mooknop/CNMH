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
import { useOmen } from './useOmen';

beforeEach(() => __reset());

describe('useOmen', () => {
  it('starts with no suit', () => {
    const { result } = renderHook(() => useOmen('JadeInferno'));
    expect(result.current.suit).toBeNull();
  });

  it('setSuit writes { suit, ts } to cnmh_omen_<charId>', () => {
    const { result } = renderHook(() => useOmen('JadeInferno'));
    act(() => result.current.setSuit('Hammers'));
    expect(result.current.suit).toBe('Hammers');
    expect(__store['cnmh_omen_JadeInferno']).toMatchObject({ suit: 'Hammers' });
    expect(typeof __store['cnmh_omen_JadeInferno'].ts).toBe('number');
  });

  it('clear writes the idle shape back', () => {
    const { result } = renderHook(() => useOmen('JadeInferno'));
    act(() => result.current.setSuit('Stars'));
    act(() => result.current.clear());
    expect(result.current.suit).toBeNull();
    expect(__store['cnmh_omen_JadeInferno']).toMatchObject({ suit: null });
  });

  it('setSuit with a falsy value clears', () => {
    const { result } = renderHook(() => useOmen('JadeInferno'));
    act(() => result.current.setSuit('Keys'));
    act(() => result.current.setSuit(null));
    expect(result.current.suit).toBeNull();
  });

  it('falsy charId falls back to the none key', () => {
    renderHook(() => useOmen(null));
    expect('cnmh_omen_none' in __store).toBe(true);
  });
});
