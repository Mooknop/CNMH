// useFocusTarget (#411, #429, #1502) — a per-viewer pointer to the combatant
// a player is currently focused on. Had no dedicated test file before #1749's
// hidden-picker sweep; this covers the selected-entry hygiene the sweep
// added — a focused entry that TURNS hidden mid-encounter resolves to null,
// the same way one that leaves the order entirely already did.
import { renderHook, act } from '@testing-library/react';
import { useFocusTarget } from './useFocusTarget';

let mockEncounter = { order: [] };
vi.mock('./useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounter }),
}));

// Minimal in-memory synced-state stub: enough for setFocusId/focusId to round-trip.
vi.mock('./useSyncedState', () => {
  const store = {};
  return {
    useSyncedState: (key, init) => {
      if (!(key in store)) store[key] = init;
      const set = (updater) => {
        store[key] = typeof updater === 'function' ? updater(store[key]) : updater;
      };
      return [store[key], set];
    },
    __reset: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});

import { __reset } from './useSyncedState';

beforeEach(() => { __reset(); });

const order = [
  { entryId: 'e-pc', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin' },
  { entryId: 'e-ash', kind: 'pc', charId: 'Ashka', name: 'Ashka' },
];

beforeEach(() => {
  mockEncounter = { order };
});

describe('useFocusTarget', () => {
  it('resolves the focused entry once toggled', () => {
    const { result, rerender } = renderHook(() => useFocusTarget('Pellias'));
    act(() => result.current.toggleFocus('e-gob'));
    rerender();
    expect(result.current.focusEnemy?.name).toBe('Goblin');
  });

  it('a focus that leaves the order self-clears to null (pre-existing behavior)', () => {
    const { result, rerender } = renderHook(() => useFocusTarget('Pellias'));
    act(() => result.current.toggleFocus('e-gob'));
    mockEncounter = { order: order.filter((e) => e.entryId !== 'e-gob') };
    rerender();
    expect(result.current.focusEntry).toBeNull();
    expect(result.current.focusEnemy).toBeNull();
  });

  // #1749 ruling addendum — selected-entry hygiene.
  it('a focus that TURNS hidden mid-encounter resolves to null, mirroring useTargeting', () => {
    const { result, rerender } = renderHook(() => useFocusTarget('Pellias'));
    act(() => result.current.toggleFocus('e-gob'));
    rerender();
    expect(result.current.focusEnemy?.name).toBe('Goblin');

    mockEncounter = { order: order.map((e) => (e.entryId === 'e-gob' ? { ...e, hidden: true } : e)) };
    rerender();
    expect(result.current.focusEntry).toBeNull();
    expect(result.current.focusEnemy).toBeNull();
  });

  it('an entry with no hidden field at all (older bridge) resolves normally', () => {
    const { result, rerender } = renderHook(() => useFocusTarget('Pellias'));
    act(() => result.current.toggleFocus('e-gob'));
    rerender();
    expect(result.current.focusEnemy?.name).toBe('Goblin');
  });

  it('clearFocus empties the selection', () => {
    const { result, rerender } = renderHook(() => useFocusTarget('Pellias'));
    act(() => result.current.toggleFocus('e-gob'));
    rerender();
    act(() => result.current.clearFocus());
    rerender();
    expect(result.current.focusEntry).toBeNull();
  });
});
