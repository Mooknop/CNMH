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
import { useAura } from './useAura';

beforeEach(() => __reset());

describe('useAura', () => {
  it('starts inactive', () => {
    const { result } = renderHook(() => useAura('Pellias'));
    expect(result.current.active).toBe(false);
  });

  it('activate writes { active: true, ts } to cnmh_aura_<charId>', () => {
    const { result } = renderHook(() => useAura('Pellias'));
    act(() => result.current.activate());
    expect(result.current.active).toBe(true);
    expect(__store['cnmh_aura_Pellias']).toMatchObject({ active: true });
    expect(typeof __store['cnmh_aura_Pellias'].ts).toBe('number');
  });

  it('deactivate writes the idle shape back', () => {
    const { result } = renderHook(() => useAura('Pellias'));
    act(() => result.current.activate());
    act(() => result.current.deactivate());
    expect(result.current.active).toBe(false);
    expect(__store['cnmh_aura_Pellias']).toMatchObject({ active: false });
  });

  it('falsy charId falls back to the none key', () => {
    renderHook(() => useAura(null));
    expect('cnmh_aura_none' in __store).toBe(true);
  });
});
