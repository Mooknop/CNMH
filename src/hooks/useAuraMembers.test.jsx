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
import { useAuraMembers } from './useAuraMembers';

beforeEach(() => __reset());

// Fixture matching the README "Relay keys" `auramembers` row contract exactly:
// { inside: [{ entryId?, tokenId, name, disposition, hidden }], ts }
const payload = () => ({
  inside: [
    { entryId: 'e-ashka', tokenId: 't-ashka', name: 'Ashka', disposition: 1, hidden: false },
    // Hidden ally — sent to the bridge/GM picture but must NOT surface on a
    // player-facing list (README: "hidden entries ARE sent" / #1749 OQ-5).
    { entryId: 'e-scout', tokenId: 't-scout', name: 'Hidden Scout', disposition: 1, hidden: true },
    // Hostile inside the aura (e.g. it walked in) — not an ally either way.
    { tokenId: 't-goblin', name: 'Goblin', disposition: -1, hidden: false },
  ],
  ts: 12345,
});

describe('useAuraMembers', () => {
  it('reads as unknown when the relay key is absent — not a lying zero', () => {
    const { result } = renderHook(() => useAuraMembers('Pellias'));
    expect(result.current.known).toBe(false);
    expect(result.current.inside).toEqual([]);
    expect(result.current.visibleAllies).toEqual([]);
    expect(result.current.visibleCount).toBe(0);
  });

  it('falsy charId falls back to the none key', () => {
    renderHook(() => useAuraMembers(null));
    expect('cnmh_auramembers_none' in __store).toBe(true);
  });

  it('filters to friendly + non-hidden for visibleAllies, keeps the raw list intact', () => {
    __store['cnmh_auramembers_Pellias'] = payload();
    const { result } = renderHook(() => useAuraMembers('Pellias'));

    expect(result.current.known).toBe(true);
    expect(result.current.insideCount).toBe(3);
    expect(result.current.inside).toHaveLength(3);

    // Only the friendly, non-hidden ally survives the player-facing filter.
    expect(result.current.visibleAllies).toEqual([
      { entryId: 'e-ashka', tokenId: 't-ashka', name: 'Ashka', disposition: 1, hidden: false },
    ]);
    expect(result.current.visibleCount).toBe(1);
  });

  it('an empty inside list (teardown push) is known and empty, not unknown', () => {
    __store['cnmh_auramembers_Pellias'] = { inside: [], ts: 999 };
    const { result } = renderHook(() => useAuraMembers('Pellias'));
    expect(result.current.known).toBe(true);
    expect(result.current.visibleCount).toBe(0);
  });

  it('updates when the relay pushes a fresh membership snapshot', () => {
    const { result, rerender } = renderHook(() => useAuraMembers('Pellias'));
    expect(result.current.known).toBe(false);

    act(() => {
      __store['cnmh_auramembers_Pellias'] = payload();
    });
    rerender();
    expect(result.current.known).toBe(true);
    expect(result.current.visibleCount).toBe(1);
  });
});
