import { renderHook } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockInventory = [];
vi.mock('./useCharacter', () => ({
  useCharacter: (c) => (c ? { inventory: mockInventory } : null),
}));

let mockPlaying = false;
vi.mock('./usePlaying', () => ({
  usePlaying: () => ({ playing: mockPlaying }),
}));

let mockEffects = [];
const mockSetEffects = vi.fn();
vi.mock('./useSyncedState', () => ({
  useSyncedState: () => [mockEffects, mockSetEffects],
}));

let mockIsGm = true;
vi.mock('./useGmAuth', () => ({ useGmAuth: () => ({ isGm: mockIsGm }) }));

const mockAppendEvent = vi.fn();
vi.mock('./useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: mockAppendEvent }),
}));

import { useCodaPlayingSweep } from './useCodaPlayingSweep';

const izzy = { id: 'Izzy', name: 'Izzy' };
const bagpipes = { id: 'bagpipes-of-turmoil', name: 'Bagpipes of Turmoil', playingEffect: 'coda-bagpipes-playing' };
const grantedEntry = { id: 'p1', effectId: 'coda-bagpipes-playing', grantedBy: 'playing' };

beforeEach(() => {
  vi.clearAllMocks();
  mockInventory = [bagpipes];
  mockPlaying = false;
  mockEffects = [];
  mockIsGm = true;
});

describe('useCodaPlayingSweep', () => {
  it('grants the staff effect while playing, and logs', () => {
    mockPlaying = true;
    renderHook(() => useCodaPlayingSweep(izzy));
    expect(mockSetEffects).toHaveBeenCalledWith([
      expect.objectContaining({ effectId: 'coda-bagpipes-playing', grantedBy: 'playing' }),
    ]);
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'apply',
      text: "Izzy's instrument bonuses apply (playing)",
    }));
  });

  it('removes the granted effect when playing lapses, keeping cast effects', () => {
    const cast = { id: 'x1', effectId: 'heroism-1' };
    mockEffects = [cast, grantedEntry];
    renderHook(() => useCodaPlayingSweep(izzy));
    expect(mockSetEffects).toHaveBeenCalledWith([cast]);
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'expire' }));
  });

  it('no grant while playing without an instrument in inventory', () => {
    mockPlaying = true;
    mockInventory = [];
    renderHook(() => useCodaPlayingSweep(izzy));
    expect(mockSetEffects).not.toHaveBeenCalled();
  });

  it('idempotent: no write when the entries already match', () => {
    mockPlaying = true;
    mockEffects = [grantedEntry];
    renderHook(() => useCodaPlayingSweep(izzy));
    expect(mockSetEffects).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it('non-GM clients never write', () => {
    mockIsGm = false;
    mockPlaying = true;
    renderHook(() => useCodaPlayingSweep(izzy));
    expect(mockSetEffects).not.toHaveBeenCalled();
  });
});
