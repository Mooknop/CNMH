import { renderHook, act } from '@testing-library/react';
import { useBestiaryNotes } from './useBestiaryNotes';

// Back the synced store with a plain object so we can exercise the functional
// updater path (setNote) the same way the real useSyncedState would.
let store;
vi.mock('./useSyncedState', () => ({
  useSyncedState: () => [
    store,
    (updater) => { store = typeof updater === 'function' ? updater(store) : updater; },
  ],
}));

beforeEach(() => { store = {}; });

describe('useBestiaryNotes', () => {
  test('noteFor returns the stored note, else empty string', () => {
    store = { goblin: 'stab the eyes' };
    const { result } = renderHook(() => useBestiaryNotes());
    expect(result.current.noteFor('goblin')).toBe('stab the eyes');
    expect(result.current.noteFor('ogre')).toBe('');
    expect(result.current.noteFor(null)).toBe('');
  });

  test('setNote writes a trimmed note keyed by creature', () => {
    const { result } = renderHook(() => useBestiaryNotes());
    act(() => result.current.setNote('ogre', '  zap = bigger  '));
    expect(store.ogre).toBe('zap = bigger');
  });

  test('setNote with empty text clears the note', () => {
    store = { ogre: 'old note' };
    const { result } = renderHook(() => useBestiaryNotes());
    act(() => result.current.setNote('ogre', '   '));
    expect(store.ogre).toBeUndefined();
  });

  test('setNote ignores a missing creatureKey', () => {
    const { result } = renderHook(() => useBestiaryNotes());
    act(() => result.current.setNote(null, 'orphan'));
    expect(store).toEqual({});
  });

  test('writing one note leaves the others intact', () => {
    store = { goblin: 'a' };
    const { result } = renderHook(() => useBestiaryNotes());
    act(() => result.current.setNote('ogre', 'b'));
    expect(store).toEqual({ goblin: 'a', ogre: 'b' });
  });
});
