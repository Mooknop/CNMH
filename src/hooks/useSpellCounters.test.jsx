import { renderHook, act } from '@testing-library/react';

// Store-backed mock so tests can seed an initial ledger and observe writes.
const store = {};
vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  const subs = new Set();
  const useSyncedState = (key, init) => {
    const [, force] = ReactLib.useReducer((x) => x + 1, 0);
    ReactLib.useEffect(() => {
      subs.add(force);
      return () => subs.delete(force);
    }, []);
    if (!(key in store)) store[key] = typeof init === 'function' ? init() : init;
    const set = (u) => {
      store[key] = typeof u === 'function' ? u(store[key]) : u;
      subs.forEach((f) => f());
    };
    return [store[key], set];
  };
  return { __esModule: true, useSyncedState };
});

import { useSpellCounters } from './useSpellCounters';

const seed = (charId, entries) => { store[`cnmh_spellcounters_${charId}`] = entries; };
const setup = (charId = 'Izzy') => renderHook(() => useSpellCounters(charId));

beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

describe('useSpellCounters', () => {
  it('starts empty', () => {
    const { result } = setup();
    expect(result.current.counters).toEqual([]);
  });

  it('adjust decrements an images counter', () => {
    seed('Izzy', [{ id: 'mi', kind: 'images', value: 3, min: 0, endAtMin: true }]);
    const { result } = setup();
    act(() => result.current.adjust('mi', -1));
    expect(result.current.counters[0].value).toBe(2);
  });

  it('removes an endAtMin counter when it reaches the floor (last image popped)', () => {
    seed('Izzy', [{ id: 'mi', kind: 'images', value: 1, min: 0, endAtMin: true }]);
    const { result } = setup();
    act(() => result.current.adjust('mi', -1));
    expect(result.current.counters).toEqual([]);
  });

  it('clamps at the floor and keeps non-ending counters', () => {
    seed('Izzy', [{ id: 'e', kind: 'emanation', value: 15, step: 10, min: 0, endAtMin: false }]);
    const { result } = setup();
    act(() => result.current.adjust('e', -100));
    expect(result.current.counters[0].value).toBe(0); // clamped, not removed
  });

  it('adjust grows an emanation by its step', () => {
    seed('Izzy', [{ id: 'e', kind: 'emanation', value: 15, step: 10, min: 0 }]);
    const { result } = setup();
    act(() => result.current.adjust('e', 10));
    expect(result.current.counters[0].value).toBe(25);
  });

  it('end() removes the matching counter', () => {
    seed('Izzy', [{ id: 'a' }, { id: 'b' }]);
    const { result } = setup();
    act(() => result.current.end('a'));
    expect(result.current.counters.map((c) => c.id)).toEqual(['b']);
  });
});
