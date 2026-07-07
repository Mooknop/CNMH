import { renderHook } from '@testing-library/react';

// Shared store mock so the trigger's hp/effects reads and writes hit the same
// place (useAuraKoSweep.test.jsx pattern).
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

vi.mock('../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: 1, month: 1, year: 4725 },
    time: { hour: 8, minute: 0, second: 0 },
  }),
}));

import { __store, __reset } from './useSyncedState';
import { useWhetstoneHpTrigger } from './useWhetstoneHpTrigger';

const izzy = { id: 'Izzy', name: 'Izzy', level: 8 };

const coinEntry = (over = {}) => ({
  id: 'fx-coin',
  name: 'Valorous Coin (Rapier)',
  expireAtSecs: 999999,
  whetstone: {
    itemId: 'valorous-coin',
    itemName: 'Valorous Coin',
    weaponUid: 'w1',
    weaponName: 'Rapier',
    duration: 'hour',
    effect: {
      hpTrigger: {
        belowFraction: 0.25,
        tempHpPerLevel: 1,
        effectId: 'valorous-coin',
        note: 'when the minute ends: Fatigued until healed to max HP',
      },
    },
    ...over,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  __reset();
  mockIsGm = true;
});

describe('useWhetstoneHpTrigger (#1216 — Valorous Coin)', () => {
  it('fires below 1/4 HP: temp HP, fired flag + collapsed duration, buff entry, log', () => {
    __store['cnmh_hp_Izzy'] = { current: 10, max: 48, temp: 0 };
    __store['cnmh_effects_Izzy'] = [coinEntry()];
    renderHook(() => useWhetstoneHpTrigger(izzy));

    expect(__store['cnmh_hp_Izzy'].temp).toBe(8); // level × 1
    const fx = __store['cnmh_effects_Izzy'];
    expect(fx).toHaveLength(2);
    const coin = fx.find((e) => e.id === 'fx-coin');
    expect(coin.whetstone.fired).toBe(true);
    expect(coin.expireAtSecs).not.toBe(999999); // remaining duration collapses to the minute
    const buff = fx.find((e) => e.effectId === 'valorous-coin');
    expect(buff).toMatchObject({ appliedBy: 'Izzy', source: 'Valorous Coin' });
    expect(typeof buff.expireAtSecs).toBe('number');
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Valorous Coin triggers — Izzy drops below ¼ HP: 8 temp HP'),
    }));
  });

  it('uses round-ticked expiry for the buff during an active encounter', () => {
    __store['cnmh_encounter_global'] = {
      active: true, round: 2,
      order: [{ entryId: 'e-izzy', kind: 'pc', charId: 'Izzy' }],
    };
    __store['cnmh_hp_Izzy'] = { current: 5, max: 48, temp: 0 };
    __store['cnmh_effects_Izzy'] = [coinEntry()];
    renderHook(() => useWhetstoneHpTrigger(izzy));

    const buff = __store['cnmh_effects_Izzy'].find((e) => e.effectId === 'valorous-coin');
    expect(buff.expireAt).toEqual({ round: 12, entryId: 'e-izzy', boundary: 'turn-end' });
    expect(buff.expireAtSecs).toBeUndefined();
  });

  it('does not fire at or above the threshold', () => {
    __store['cnmh_hp_Izzy'] = { current: 12, max: 48, temp: 0 }; // exactly 1/4
    __store['cnmh_effects_Izzy'] = [coinEntry()];
    renderHook(() => useWhetstoneHpTrigger(izzy));
    expect(__store['cnmh_effects_Izzy']).toHaveLength(1);
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it('does not re-fire once the fired flag is set', () => {
    __store['cnmh_hp_Izzy'] = { current: 5, max: 48, temp: 8 };
    __store['cnmh_effects_Izzy'] = [coinEntry({ fired: true })];
    renderHook(() => useWhetstoneHpTrigger(izzy));
    expect(__store['cnmh_effects_Izzy']).toHaveLength(1);
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it('non-GM clients never write', () => {
    mockIsGm = false;
    __store['cnmh_hp_Izzy'] = { current: 5, max: 48, temp: 0 };
    __store['cnmh_effects_Izzy'] = [coinEntry()];
    renderHook(() => useWhetstoneHpTrigger(izzy));
    expect(__store['cnmh_hp_Izzy'].temp).toBe(0);
    expect(__store['cnmh_effects_Izzy']).toHaveLength(1);
  });

  it('keeps a higher existing temp-HP pool', () => {
    __store['cnmh_hp_Izzy'] = { current: 5, max: 48, temp: 12 };
    __store['cnmh_effects_Izzy'] = [coinEntry()];
    renderHook(() => useWhetstoneHpTrigger(izzy));
    expect(__store['cnmh_hp_Izzy'].temp).toBe(12);
  });
});
