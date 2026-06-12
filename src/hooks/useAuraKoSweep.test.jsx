import { renderHook } from '@testing-library/react';

// Shared store mock so the sweep's hp read and useAura's aura read/write hit
// the same place (useShield.test.jsx pattern).
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

let mockIsGm = true;
vi.mock('./useGmAuth', () => ({ useGmAuth: () => ({ isGm: mockIsGm }) }));

const mockAppendEvent = vi.fn();
vi.mock('./useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: mockAppendEvent }),
}));

import { __store, __reset } from './useSyncedState';
import { useAuraKoSweep } from './useAuraKoSweep';

const pellias = { id: 'Pellias', name: 'Pellias' };

beforeEach(() => {
  vi.clearAllMocks();
  __reset();
  mockIsGm = true;
});

describe('useAuraKoSweep', () => {
  it('deactivates the aura and logs when an active kineticist hits 0 HP', () => {
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    __store['cnmh_hp_Pellias'] = { current: 0, max: 58 };
    renderHook(() => useAuraKoSweep(pellias));
    expect(__store['cnmh_aura_Pellias']).toMatchObject({ active: false });
    expect(mockAppendEvent).toHaveBeenCalledTimes(1);
    expect(mockAppendEvent).toHaveBeenCalledWith({
      type: 'expire',
      text: 'Pellias was knocked out — kinetic aura deactivates',
    });
  });

  it('non-GM clients never write', () => {
    mockIsGm = false;
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    __store['cnmh_hp_Pellias'] = { current: 0, max: 58 };
    renderHook(() => useAuraKoSweep(pellias));
    expect(__store['cnmh_aura_Pellias']).toMatchObject({ active: true });
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it('no-op while HP is above 0', () => {
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    __store['cnmh_hp_Pellias'] = { current: 12, max: 58 };
    renderHook(() => useAuraKoSweep(pellias));
    expect(__store['cnmh_aura_Pellias']).toMatchObject({ active: true });
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it('no-op when the aura is already down (no duplicate log)', () => {
    __store['cnmh_aura_Pellias'] = { active: false, ts: 1 };
    __store['cnmh_hp_Pellias'] = { current: 0, max: 58 };
    renderHook(() => useAuraKoSweep(pellias));
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it('no-op when hp state is missing or non-numeric (bridge shapes vary)', () => {
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    __store['cnmh_hp_Pellias'] = null;
    renderHook(() => useAuraKoSweep(pellias));
    expect(__store['cnmh_aura_Pellias']).toMatchObject({ active: true });

    __reset();
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    __store['cnmh_hp_Pellias'] = { current: 'unconscious' };
    renderHook(() => useAuraKoSweep(pellias));
    expect(__store['cnmh_aura_Pellias']).toMatchObject({ active: true });
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });
});
