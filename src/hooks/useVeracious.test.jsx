import { renderHook, act } from '@testing-library/react';

vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  const store = {};
  const subs = new Set();
  const useSyncedState = (key, init) => {
    const [, force] = ReactLib.useReducer((x) => x + 1, 0);
    ReactLib.useEffect(() => { subs.add(force); return () => subs.delete(force); }, []);
    if (!(key in store)) store[key] = typeof init === 'function' ? init() : init;
    const set = (u) => { store[key] = typeof u === 'function' ? u(store[key]) : u; subs.forEach((f) => f()); };
    return [store[key], set];
  };
  return { __esModule: true, useSyncedState, __reset: () => { for (const k of Object.keys(store)) delete store[k]; } };
});

// Controllable invested set.
let investedUids = new Set();
vi.mock('./useInvested', () => ({
  useInvested: () => ({ isInvested: (uid) => investedUids.has(uid) }),
}));

// Controllable rune catalog — imbued ids hydrate against this.
let mockRunes = [];
vi.mock('../contexts/ContentContext', () => ({
  useContent: () => ({ runes: mockRunes }),
}));

import { __reset } from './useSyncedState';
import { useVeracious } from './useVeracious';

const ring = (uid, itemBonus, property) => ({
  uid, name: 'Power Ring', powerRing: true, itemBonus,
  runes: property ? { property } : undefined,
  traits: ['Invested', 'Magical'],
});

beforeEach(() => { __reset(); investedUids = new Set(); mockRunes = []; });

describe('useVeracious (#967 R7)', () => {
  it('finds the invested power ring and its item bonus', () => {
    investedUids = new Set(['pr1']);
    const { result } = renderHook(() => useVeracious('P', [ring('pr1', 2)]));
    expect(result.current.ring.uid).toBe('pr1');
    expect(result.current.itemBonus).toBe(2);
    expect(result.current.armed).toBe(false);
  });

  it('grants no ring/bonus when the power ring is not invested', () => {
    const { result } = renderHook(() => useVeracious('P', [ring('pr1', 2)]));
    expect(result.current.ring).toBeNull();
    expect(result.current.itemBonus).toBe(0);
  });

  it('arm/disarm toggles armed — but only counts while a ring is invested', () => {
    investedUids = new Set(['pr1']);
    const { result } = renderHook(() => useVeracious('P', [ring('pr1', 1)]));
    act(() => result.current.arm());
    expect(result.current.armed).toBe(true);
    act(() => result.current.disarm());
    expect(result.current.armed).toBe(false);
  });

  it('a stale armed flag does not count without an invested ring', () => {
    // Arm with a ring invested, then re-render with nothing invested.
    investedUids = new Set(['pr1']);
    const { result, rerender } = renderHook(({ inv }) => useVeracious('P', inv), {
      initialProps: { inv: [ring('pr1', 2)] },
    });
    act(() => result.current.arm());
    expect(result.current.armed).toBe(true);
    investedUids = new Set();
    rerender({ inv: [ring('pr1', 2)] });
    expect(result.current.armed).toBe(false);
  });

  it('lists imbued rune names from ids or hydrated docs', () => {
    investedUids = new Set(['pr1']);
    const { result } = renderHook(() =>
      useVeracious('P', [ring('pr1', 2, ['ring-energy', { id: 'ring-calling', name: 'Calling' }])]));
    expect(result.current.imbuedRunes).toEqual(['ring-energy', 'Calling']);
  });

  it('hydrates imbued ids against the rune catalog for names', () => {
    investedUids = new Set(['pr1']);
    mockRunes = [{ id: 'ring-energy', name: 'Energy', target: 'ring' }];
    const { result } = renderHook(() => useVeracious('P', [ring('pr1', 2, ['ring-energy'])]));
    expect(result.current.imbuedRunes).toEqual(['Energy']);
  });

  it('surfaces imbued-rune rider text from the catalog (#974)', () => {
    investedUids = new Set(['pr1']);
    mockRunes = [
      {
        id: 'ring-immobilizing', name: 'Immobilizing', target: 'ring',
        riders: [{ id: 'r1', text: 'On a critical spell attack, the target is immobilized (Escape DC 30).' }],
      },
      { id: 'ring-energy', name: 'Energy', target: 'ring' }, // no riders
    ];
    const { result } = renderHook(() =>
      useVeracious('P', [ring('pr1', 2, ['ring-immobilizing', 'ring-energy'])]));
    expect(result.current.imbuedRiders).toEqual([
      { rune: 'Immobilizing', text: 'On a critical spell attack, the target is immobilized (Escape DC 30).' },
    ]);
  });

  it('yields no riders without a ring or without rider-bearing runes', () => {
    const { result } = renderHook(() => useVeracious('P', [ring('pr1', 2, ['ring-energy'])]));
    expect(result.current.imbuedRiders).toEqual([]); // ring not invested
  });
});
