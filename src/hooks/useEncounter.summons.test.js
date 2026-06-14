import { renderHook, act } from '@testing-library/react';

// Shared-store mock so we can seed cnmh_summons_global and observe the merge,
// and inspect the raw cnmh_encounter_global that writers actually persist.
vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  const store = {};
  return {
    __esModule: true,
    useSyncedState: (key, init) => {
      if (!(key in store)) store[key] = typeof init === 'function' ? init() : init;
      const [, force] = ReactLib.useReducer((x) => x + 1, 0);
      const set = (u) => { store[key] = typeof u === 'function' ? u(store[key]) : u; force(); };
      return [store[key], set];
    },
    __store: store,
    __reset: () => Object.keys(store).forEach((k) => delete store[k]),
  };
});
vi.mock('../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: vi.fn(), getState: vi.fn(() => []) }),
}));
vi.mock('../contexts/ContentContext', () => ({ useContent: () => ({ effects: [] }) }));

import { useEncounter } from './useEncounter';
import { __store, __reset } from './useSyncedState';

beforeEach(() => __reset());

const summon = {
  entryId: 'sum-1', kind: 'summon', name: 'Skeletal Champion',
  casterId: 'Izzy', sustainId: 's1', bestiary: { hp: { current: 20, max: 20 } },
};

describe('useEncounter — summon merge (#261)', () => {
  it('appends cnmh_summons_global into the read view but not the persisted order', () => {
    __store['cnmh_summons_global'] = [summon];
    const { result } = renderHook(() => useEncounter());
    act(() => result.current.startEncounter([{ id: 'Izzy', name: 'Izzy' }]));

    // Read view shows PC + summon …
    const order = result.current.encounter.order;
    expect(order.some((e) => e.kind === 'pc' && e.charId === 'Izzy')).toBe(true);
    expect(order.some((e) => e.entryId === 'sum-1' && e.kind === 'summon')).toBe(true);

    // … but the persisted encounter the bridge/turn-math touch stays summon-free.
    expect(__store['cnmh_encounter_global'].order.some((e) => e.kind === 'summon')).toBe(false);
  });

  it('endEncounter clears the summons key', () => {
    __store['cnmh_summons_global'] = [summon];
    const { result } = renderHook(() => useEncounter());
    act(() => result.current.endEncounter());
    expect(__store['cnmh_summons_global']).toEqual([]);
    expect(result.current.encounter.order).toEqual([]);
  });
});
