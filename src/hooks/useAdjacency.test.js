import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAdjacency } from './useAdjacency';

const mockSynced = vi.fn();
vi.mock('./useSyncedState', () => ({ useSyncedState: (...a) => mockSynced(...a) }));

const mockEncounter = vi.fn();
vi.mock('./useEncounter', () => ({ useEncounter: () => mockEncounter() }));

const order = [
  { entryId: 'e-pellias', kind: 'pc', charId: 'Pellias' },
  { entryId: 'e-ashka', kind: 'pc', charId: 'Ashka' },
  { entryId: 'e-goblin', kind: 'enemy' },
];

beforeEach(() => {
  mockEncounter.mockReturnValue({ encounter: { order } });
  mockSynced.mockReturnValue([{}]);
});

describe('useAdjacency', () => {
  it('inReach is true with no relay data (dormant without a connected bridge)', () => {
    const { result } = renderHook(() => useAdjacency('Pellias'));
    expect(result.current.hasData).toBe(false);
    expect(result.current.inReach('e-ashka')).toBe(true);
  });

  it('reflects the relay map for the viewer entry', () => {
    mockSynced.mockReturnValue([{ 'e-pellias': ['e-ashka'] }]);
    const { result } = renderHook(() => useAdjacency('Pellias'));
    expect(result.current.hasData).toBe(true);
    expect(result.current.viewerEntryId).toBe('e-pellias');
    expect(result.current.inReach('e-ashka')).toBe(true);   // adjacent
    expect(result.current.inReach('e-goblin')).toBe(false); // not adjacent
  });

  it('inReach is true when the viewer has no order entry (no token on the map)', () => {
    mockSynced.mockReturnValue([{ 'e-someone': ['e-ashka'] }]);
    const { result } = renderHook(() => useAdjacency('Nobody'));
    expect(result.current.viewerEntryId).toBeNull();
    expect(result.current.inReach('e-ashka')).toBe(true);
  });
});
