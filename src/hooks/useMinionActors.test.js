import { renderHook, act } from '@testing-library/react';

// Seed bridge-pushed values per synced key and capture writes. The hook reads
// cnmh_minionactors_global (bridge-owned) and writes cnmh_spawnminion_global.
const synced = vi.hoisted(() => ({ store: {}, writes: [] }));

vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) => {
      const initial = key in synced.store
        ? synced.store[key]
        : (typeof init === 'function' ? init() : init);
      const [v, setV] = ReactLib.useState(initial);
      const wrapped = (next) => {
        synced.writes.push({ key, value: typeof next === 'function' ? next(v) : next });
        setV(next);
      };
      return [v, wrapped];
    },
  };
});

import { useMinionActors } from './useMinionActors';

const ZEVIRA = {
  foundryActorId: 'actor-zev', name: 'Zevira', role: 'companion',
  ownerCharId: 'Ashka', onScene: false,
};

beforeEach(() => {
  synced.store = {};
  synced.writes = [];
});

describe('useMinionActors', () => {
  it('linkFor returns the link for a known owner/role and null otherwise', () => {
    synced.store['cnmh_minionactors_global'] = { 'Ashka-companion': ZEVIRA };
    const { result } = renderHook(() => useMinionActors());

    expect(result.current.linkFor('Ashka', 'companion')).toEqual(ZEVIRA);
    expect(result.current.linkFor('Ashka', 'familiar')).toBeNull();
    expect(result.current.linkFor('Pellias', 'companion')).toBeNull();
  });

  it('spawn writes a request to cnmh_spawnminion_global', () => {
    const { result } = renderHook(() => useMinionActors());
    act(() => result.current.spawn('Ashka', 'companion'));

    const write = synced.writes.find((w) => w.key === 'cnmh_spawnminion_global');
    expect(write).toBeTruthy();
    expect(write.value).toMatchObject({ ownerCharId: 'Ashka', role: 'companion' });
    expect(typeof write.value.ts).toBe('number');
  });
});
