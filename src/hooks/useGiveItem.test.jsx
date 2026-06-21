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

// useSyncedState fronts the giver's own acquired + removed + consumed overlays.
let giverAcquired = [];
let giverRemoved = [];
let giverConsumed = {};
const mockSetAcquired = vi.fn((next) => {
  giverAcquired = typeof next === 'function' ? next(giverAcquired) : next;
});
const mockSetRemoved = vi.fn((next) => {
  giverRemoved = typeof next === 'function' ? next(giverRemoved) : next;
});
const mockSetConsumed = vi.fn((next) => {
  giverConsumed = typeof next === 'function' ? next(giverConsumed) : next;
});
vi.mock('./useSyncedState', () => ({
  useSyncedState: (key) => {
    if (String(key).startsWith('cnmh_acquired_')) return [giverAcquired, mockSetAcquired];
    if (String(key).startsWith('cnmh_removed_')) return [giverRemoved, mockSetRemoved];
    if (String(key).startsWith('cnmh_consumed_')) return [giverConsumed, mockSetConsumed];
    return [undefined, vi.fn()];
  },
}));

import { useGiveItem } from './useGiveItem';

beforeEach(() => {
  stateMap = {};
  giverAcquired = [];
  giverRemoved = [];
  giverConsumed = {};
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

describe('useGiveItem — containers (#657)', () => {
  const pack = {
    uid: 'pack',
    name: 'Backpack',
    weight: 0.1,
    state: 'worn',
    container: { capacity: 4, contents: [{ uid: 'rope', name: 'Rope', weight: 1, state: 'stowed' }] },
  };

  it('deep-copies the container with fresh uids throughout', () => {
    const { result } = renderHook(() => useGiveItem('a'));
    result.current.give('b', pack);
    const [, , gift] = mockSendUpdate.mock.calls[0]; // (recipientId, 'acquired', list)
    const copy = gift[0];
    expect(copy.uid).toBe('gift-1');
    expect(copy.container.contents[0].uid).toBe('gift-2');
    expect(copy.container.contents[0].state).toBeUndefined(); // live field stripped
  });

  it('masks every authored uid in the subtree from the giver', () => {
    const { result } = renderHook(() => useGiveItem('a'));
    result.current.give('b', pack);
    expect(giverRemoved).toEqual(['pack', 'rope']);
  });

  it('splices an acquired content while masking the authored container', () => {
    giverAcquired = [{ ref: 'rope', uid: 'rope' }];
    const { result } = renderHook(() => useGiveItem('a'));
    result.current.give('b', pack);
    expect(mockSetAcquired).toHaveBeenCalledWith([]); // the acquired rope is spliced
    expect(giverRemoved).toEqual(['pack']); // only the authored container is masked
  });
});

describe('useGiveItem — consumable stack-splitting (#657)', () => {
  const potion = { uid: 'pot', name: 'Healing Potion', weight: 0.1, quantity: 3, state: 'worn', consumable: { kind: 'healing' } };

  it('credits the recipient with a quantity-count copy', () => {
    const { result } = renderHook(() => useGiveItem('a'));
    const ok = result.current.giveConsumable('b', potion, 2);
    expect(ok).toBe(true);
    const [, , gift] = mockSendUpdate.mock.calls[0];
    expect(gift[0]).toMatchObject({ name: 'Healing Potion', quantity: 2, uid: 'gift-1' });
  });

  it('depletes count from the giver name-keyed consumed overlay', () => {
    const { result } = renderHook(() => useGiveItem('a'));
    result.current.giveConsumable('b', potion, 2);
    expect(giverConsumed).toEqual({ 'Healing Potion': 2 });
  });

  it('adds to any existing consumed count for that name', () => {
    giverConsumed = { 'Healing Potion': 1 };
    const { result } = renderHook(() => useGiveItem('a'));
    result.current.giveConsumable('b', potion, 1);
    expect(giverConsumed).toEqual({ 'Healing Potion': 2 });
  });

  it('credits the recipient BEFORE depleting the giver', () => {
    const { result } = renderHook(() => useGiveItem('a'));
    result.current.giveConsumable('b', potion, 1);
    const credit = mockSendUpdate.mock.invocationCallOrder[0];
    const deplete = mockSetConsumed.mock.invocationCallOrder[0];
    expect(credit).toBeLessThan(deplete);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['more than remaining', 4],
  ])('rejects a %s count without writing', (_label, count) => {
    const { result } = renderHook(() => useGiveItem('a'));
    expect(result.current.giveConsumable('b', potion, count)).toBe(false);
    expect(mockSendUpdate).not.toHaveBeenCalled();
    expect(mockSetConsumed).not.toHaveBeenCalled();
  });

  it('floors a fractional count', () => {
    const { result } = renderHook(() => useGiveItem('a'));
    result.current.giveConsumable('b', potion, 2.9);
    expect(giverConsumed).toEqual({ 'Healing Potion': 2 });
  });

  it('freezes in the offline sandbox', () => {
    session = { ...session, connected: true, foundryConnected: false };
    const { result } = renderHook(() => useGiveItem('a'));
    expect(result.current.giveConsumable('b', potion, 1)).toBe(false);
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });
});
