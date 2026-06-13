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

import { useSustains } from './useSustains';

const seed = (charId, entries) => { store[`cnmh_sustains_${charId}`] = entries; };
const setup = (charId = 'Izzy') => renderHook(() => useSustains(charId));

beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

describe('useSustains', () => {
  it('starts empty', () => {
    const { result } = setup();
    expect(result.current.sustains).toEqual([]);
  });

  it('exposes the seeded ledger', () => {
    seed('Izzy', [{ id: 'a', spellName: 'Bless', lastSustainedRound: 1 }]);
    const { result } = setup();
    expect(result.current.sustains).toHaveLength(1);
  });

  it('sustain() stamps lastSustainedRound on the matching entry only', () => {
    seed('Izzy', [
      { id: 'a', spellName: 'Bless', lastSustainedRound: 1 },
      { id: 'b', spellName: 'Mirror Image', lastSustainedRound: 1 },
    ]);
    const { result } = setup();
    act(() => result.current.sustain('a', 2));
    expect(result.current.sustains.find((s) => s.id === 'a').lastSustainedRound).toBe(2);
    expect(result.current.sustains.find((s) => s.id === 'b').lastSustainedRound).toBe(1);
  });

  it('end() removes the matching entry', () => {
    seed('Izzy', [
      { id: 'a', spellName: 'Bless' },
      { id: 'b', spellName: 'Mirror Image' },
    ]);
    const { result } = setup();
    act(() => result.current.end('a'));
    expect(result.current.sustains.map((s) => s.id)).toEqual(['b']);
  });
});
