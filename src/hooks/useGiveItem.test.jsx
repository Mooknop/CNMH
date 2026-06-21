import { renderHook } from '@testing-library/react';

// Session stub: recipient-side reads come from a flat state map; the recipient
// write + connectivity flags are spied.
let stateMap = {};
let session = {};
const mockGetState = vi.fn();
const mockSendUpdate = vi.fn();
vi.mock('../contexts/SessionContext', () => ({
  __esModule: true,
  useSession: () => session,
}));

// Deterministic uids so the gifted entry is assertable.
let uidSeq = 0;
vi.mock('../utils/uid', () => ({
  newEntryUid: () => `gift-${++uidSeq}`,
}));

// useSyncedState fronts the giver's own acquired + removed overlays.
let giverAcquired = [];
let giverRemoved = [];
const mockSetAcquired = vi.fn((next) => {
  giverAcquired = typeof next === 'function' ? next(giverAcquired) : next;
});
const mockSetRemoved = vi.fn((next) => {
  giverRemoved = typeof next === 'function' ? next(giverRemoved) : next;
});
vi.mock('./useSyncedState', () => ({
  useSyncedState: (key) => {
    if (String(key).startsWith('cnmh_acquired_')) return [giverAcquired, mockSetAcquired];
    if (String(key).startsWith('cnmh_removed_')) return [giverRemoved, mockSetRemoved];
    return [undefined, vi.fn()];
  },
}));

import { useGiveItem } from './useGiveItem';

beforeEach(() => {
  stateMap = {};
  giverAcquired = [];
  giverRemoved = [];
  uidSeq = 0;
  vi.clearAllMocks();
  mockGetState.mockImplementation((id, type) => stateMap[`${id}:${type}`]);
  session = {
    getState: mockGetState,
    sendUpdate: mockSendUpdate,
    connected: true,
    foundryConnected: true,
  };
});

const authored = { uid: 'auth1', name: 'Longsword', weight: 1, state: 'worn' };

describe('useGiveItem', () => {
  it('credits the recipient with a clean, freshly-uid\'d copy', () => {
    const { result } = renderHook(() => useGiveItem('a'));
    const ok = result.current.give('b', authored);
    expect(ok).toBe(true);
    expect(mockSendUpdate).toHaveBeenCalledWith('b', 'acquired', [
      { uid: 'gift-1', name: 'Longsword', weight: 1 }, // state stripped, fresh uid
    ]);
  });

  it('appends to the recipient existing acquired overlay', () => {
    stateMap = { 'b:acquired': [{ ref: 'dagger', uid: 'x' }] };
    const { result } = renderHook(() => useGiveItem('a'));
    result.current.give('b', authored);
    expect(mockSendUpdate).toHaveBeenCalledWith('b', 'acquired', [
      { ref: 'dagger', uid: 'x' },
      { uid: 'gift-1', name: 'Longsword', weight: 1 },
    ]);
  });

  it('masks an authored item via the removed overlay', () => {
    const { result } = renderHook(() => useGiveItem('a'));
    result.current.give('b', authored);
    expect(mockSetRemoved).toHaveBeenCalled();
    expect(giverRemoved).toEqual(['auth1']);
    expect(mockSetAcquired).not.toHaveBeenCalled();
  });

  it('splices an acquired item from the giver array instead of masking it', () => {
    giverAcquired = [{ ref: 'longsword', uid: 'acq1' }];
    const { result } = renderHook(() => useGiveItem('a'));
    result.current.give('b', { uid: 'acq1', name: 'Longsword', weight: 1, state: 'worn' });
    expect(mockSetAcquired).toHaveBeenCalledWith([]);
    expect(mockSetRemoved).not.toHaveBeenCalled();
  });

  it('credits the recipient BEFORE removing from the giver', () => {
    const { result } = renderHook(() => useGiveItem('a'));
    result.current.give('b', authored);
    const credit = mockSendUpdate.mock.invocationCallOrder[0];
    const remove = mockSetRemoved.mock.invocationCallOrder[0];
    expect(credit).toBeLessThan(remove);
  });

  it('rejects sending to yourself', () => {
    const { result } = renderHook(() => useGiveItem('a'));
    expect(result.current.give('a', authored)).toBe(false);
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('rejects an item with no uid', () => {
    const { result } = renderHook(() => useGiveItem('a'));
    expect(result.current.give('b', { name: 'Ghost' })).toBe(false);
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('rejects when there is no recipient', () => {
    const { result } = renderHook(() => useGiveItem('a'));
    expect(result.current.give('', authored)).toBe(false);
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('freezes the transfer in the offline sandbox (DO up, Foundry down)', () => {
    session = { ...session, connected: true, foundryConnected: false };
    const { result } = renderHook(() => useGiveItem('a'));
    expect(result.current.give('b', authored)).toBe(false);
    expect(mockSendUpdate).not.toHaveBeenCalled();
    expect(mockSetRemoved).not.toHaveBeenCalled();
  });

  it('allows the transfer when fully offline (pure local)', () => {
    session = { ...session, connected: false, foundryConnected: false };
    const { result } = renderHook(() => useGiveItem('a'));
    expect(result.current.give('b', authored)).toBe(true);
    expect(mockSendUpdate).toHaveBeenCalled();
  });
});
