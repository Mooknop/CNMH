import { renderHook, act } from '@testing-library/react';

// Same in-memory synced-state stub the sibling hook suites use — it exercises
// the real reducer-style writes useBystander makes without a session bus.
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

// No GameDateProvider here: useGameSeconds returns null, which the immunity
// rules read as "no clock in scope, nothing has expired" — the same convention
// hasAbilityImmunity uses. Expiry itself is covered in utils/bystander.test.js.
import { __store, __reset } from './useSyncedState';
import { useBystander } from './useBystander';

const KEY = 'cnmh_bystander_izzy';
const ORDER = [
  { entryId: 'e-izzy', kind: 'pc', charId: 'izzy', name: 'Izzy' },
  { entryId: 'e-g1', kind: 'enemy', name: 'Ghoul', creatureKey: 'creature:ghoul' },
  { entryId: 'e-b', kind: 'enemy', name: 'Bandit' },
];

beforeEach(() => __reset());

describe('useBystander', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useBystander('izzy'));
    expect(result.current.active).toBe(false);
    expect(result.current.revealed).toBe(false);
    expect(result.current.hiding).toBe(false);
  });

  it('declare writes the #226 payload the relay contract still expects', () => {
    const { result } = renderHook(() => useBystander('izzy'));
    act(() => result.current.declare('deception'));
    expect(__store[KEY]).toMatchObject({ active: true, mod: 'deception', revealed: false });
    expect(result.current.hiding).toBe(true);
  });

  it('suppresses reactions for a creature while hiding', () => {
    const { result } = renderHook(() => useBystander('izzy'));
    act(() => result.current.declare('deception'));
    expect(result.current.suppressedAgainst('creature:ghoul')).toBe(true);
  });

  it('markRevealed lifts suppression and stamps every enemy in the order', () => {
    const { result } = renderHook(() => useBystander('izzy'));
    act(() => result.current.declare('deception'));

    let observers;
    act(() => { observers = result.current.markRevealed(ORDER); });

    expect(observers.map((o) => o.name)).toEqual(['Ghoul', 'Bandit']);
    expect(result.current.revealed).toBe(true);
    expect(result.current.hiding).toBe(false);
    expect(result.current.suppressedAgainst('creature:ghoul')).toBe(false);
    expect(result.current.isImmune('creature:ghoul')).toBe(true);
    expect(result.current.isImmune('e-b')).toBe(true);
  });

  it('clear drops the declaration but keeps the immunity ledger', () => {
    const { result } = renderHook(() => useBystander('izzy'));
    act(() => result.current.declare('deception'));
    act(() => { result.current.markRevealed(ORDER); });
    act(() => result.current.clear());

    expect(__store[KEY]).toMatchObject({ active: false, mod: null, revealed: false });
    expect(result.current.isImmune('creature:ghoul')).toBe(true);
  });

  it('immuneIn names the creatures in THIS encounter that already saw the trick', () => {
    const { result } = renderHook(() => useBystander('izzy'));
    act(() => result.current.declare('deception'));
    act(() => { result.current.markRevealed([ORDER[0], ORDER[1]]); }); // only the ghoul watched
    act(() => result.current.clear());
    act(() => result.current.declare('deception')); // next fight

    expect(result.current.immuneIn(ORDER).map((o) => o.name)).toEqual(['Ghoul']);
    expect(result.current.suppressedAgainst('e-b')).toBe(true);
  });

  it('reads a pre-#465 payload without exploding', () => {
    __store[KEY] = { active: true, mod: 'deception', ts: 3 };
    const { result } = renderHook(() => useBystander('izzy'));
    expect(result.current.hiding).toBe(true);
    expect(result.current.immune).toEqual({});
  });
});
