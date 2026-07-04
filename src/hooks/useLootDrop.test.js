import { renderHook, act } from '@testing-library/react';

const rooms = [
  {
    id: 'sd4s-a3',
    code: 'A3',
    name: 'Shrine to Kabriri',
    treasureCache: { gold: 25, items: [{ ref: 'acid-flask', name: 'Acid Flask', qty: 2 }] },
  },
];
const characters = [
  { id: 'a', name: 'Aria', gold: 100 },
  { id: 'b', name: 'Vestri', gold: 50 },
];
const mockRefresh = vi.fn();
vi.mock('../contexts/ContentContext', () => ({
  __esModule: true,
  useContent: () => ({ rooms, characters, refresh: mockRefresh }),
}));

// Session primitives: getState/sendUpdate front the per-character overlays.
let session;
const stateStore = {};
const mockSendUpdate = vi.fn((cid, type, value) => {
  stateStore[cid] = { ...(stateStore[cid] || {}), [type]: value };
});
const mockGetState = vi.fn((cid, type) => stateStore[cid]?.[type]);
vi.mock('../contexts/SessionContext', () => ({
  __esModule: true,
  useSession: () => ({ ...session, getState: mockGetState, sendUpdate: mockSendUpdate }),
}));

const mockAppendEvent = vi.fn();
vi.mock('./useSessionLog', () => ({
  useSessionLog: () => ({ log: [], appendEvent: mockAppendEvent }),
}));

const mockSave = vi.fn(() => Promise.resolve({}));
vi.mock('../utils/gmApi', () => ({
  saveDocument: (...a) => mockSave(...a),
}));

vi.mock('../utils/gold', () => ({ docGold: (c) => c?.gold ?? 0 }));

// Deterministic uids for asserting credited entries.
let uidSeq = 0;
vi.mock('../utils/uid', () => ({ newEntryUid: () => `e-${(uidSeq += 1)}` }));

let drop = null;
const mockSetDrop = vi.fn((next) => {
  drop = typeof next === 'function' ? next(drop) : next;
});
vi.mock('./useSyncedState', () => ({
  useSyncedState: (key) => {
    if (String(key) === 'cnmh_lootdrop_global') return [drop, mockSetDrop];
    return [null, vi.fn()];
  },
}));

import { useLootDrop } from './useLootDrop';

const openDropState = (over = {}) => ({
  id: 'x', roomId: 'sd4s-a3', roomName: 'A3. Shrine to Kabriri', status: 'open',
  gold: 25, goldSplit: null,
  items: [{ lineId: 'l1', ref: 'acid-flask', name: 'Acid Flask', qty: 2, claims: [] }],
  ...over,
});

beforeEach(() => {
  drop = null;
  uidSeq = 0;
  Object.keys(stateStore).forEach((k) => delete stateStore[k]);
  vi.clearAllMocks();
  session = { connected: true, foundryConnected: true };
});

describe('useLootDrop — lifecycle', () => {
  it('openDrop writes a drop from the room cache', () => {
    const { result } = renderHook(() => useLootDrop());
    let built;
    act(() => { built = result.current.openDrop(rooms[0]); });
    expect(built).toMatchObject({ roomId: 'sd4s-a3', gold: 25, status: 'open' });
    expect(mockSetDrop).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'sd4s-a3' }));
  });

  it('openDrop is a no-op while a drop is already open', () => {
    drop = openDropState({ roomId: 'other' });
    const { result } = renderHook(() => useLootDrop());
    let built;
    act(() => { built = result.current.openDrop(rooms[0]); });
    expect(built).toBeNull();
    expect(mockSetDrop).not.toHaveBeenCalled();
  });

  it('cancelDrop clears the drop and writes nothing else', () => {
    drop = openDropState();
    const { result } = renderHook(() => useLootDrop());
    act(() => { result.current.cancelDrop(); });
    expect(mockSetDrop).toHaveBeenCalledWith(null);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('exposes live even-split gold shares', () => {
    drop = openDropState();
    const { result } = renderHook(() => useLootDrop());
    expect(result.current.shares).toEqual({ a: 13, b: 12 });
  });
});

describe('useLootDrop — claiming', () => {
  it('claimLine applies a claim through the reducer', () => {
    drop = openDropState();
    const { result } = renderHook(() => useLootDrop());
    act(() => { result.current.claimLine('l1', 'a', 1); });
    expect(drop.items[0].claims).toEqual([{ charId: 'a', qty: 1 }]);
  });

  it('claimLine is frozen in the offline sandbox', () => {
    session = { connected: true, foundryConnected: false };
    drop = openDropState();
    const { result } = renderHook(() => useLootDrop());
    act(() => { result.current.claimLine('l1', 'a', 1); });
    expect(mockSetDrop).not.toHaveBeenCalled();
  });

  it('setGoldSplit writes an override map onto the drop', () => {
    drop = openDropState();
    const { result } = renderHook(() => useLootDrop());
    act(() => { result.current.setGoldSplit({ a: 25, b: 0 }); });
    expect(drop.goldSplit).toEqual({ a: 25, b: 0 });
  });
});

describe('useLootDrop — finalize', () => {
  it('credits claimed items + gold shares, logs per character, returns remainder, stamps', async () => {
    drop = openDropState({
      items: [{ lineId: 'l1', ref: 'acid-flask', name: 'Acid Flask', qty: 2, claims: [{ charId: 'a', qty: 1 }] }],
    });
    const { result } = renderHook(() => useLootDrop());
    let ok;
    await act(async () => { ok = await result.current.finalizeDrop(); });
    expect(ok).toBe(true);

    // Aria: 1 acid flask + 13 gp; her gold defaults to the committed doc (100).
    expect(mockSendUpdate).toHaveBeenCalledWith('a', 'acquired', [{ ref: 'acid-flask', uid: 'e-1' }]);
    expect(mockSendUpdate).toHaveBeenCalledWith('a', 'gold', 113);
    // Vestri: no items, only the 12 gp share.
    expect(mockSendUpdate).toHaveBeenCalledWith('b', 'gold', 62);
    expect(mockSendUpdate).not.toHaveBeenCalledWith('b', 'acquired', expect.anything());

    expect(mockAppendEvent).toHaveBeenCalledWith({ type: 'action', text: 'Aria claimed Acid Flask, +13 gp' });
    expect(mockAppendEvent).toHaveBeenCalledWith({ type: 'action', text: 'Vestri claimed +12 gp' });

    // 1 unclaimed acid flask returns to the cache; all gold distributed.
    expect(mockSave).toHaveBeenCalledWith('room', 'sd4s-a3', expect.objectContaining({
      distributedAt: expect.any(Number),
      treasureCache: { gold: 0, items: [{ ref: 'acid-flask', name: 'Acid Flask', qty: 1 }] },
    }));
    expect(mockSetDrop).toHaveBeenCalledWith(null);
  });

  it('adds to an existing acquired overlay rather than replacing it', async () => {
    stateStore.a = { acquired: [{ ref: 'dagger', uid: 'old' }], gold: 5 };
    drop = openDropState({
      gold: 0,
      items: [{ lineId: 'l1', ref: 'acid-flask', name: 'Acid Flask', qty: 1, claims: [{ charId: 'a', qty: 1 }] }],
    });
    const { result } = renderHook(() => useLootDrop());
    await act(async () => { await result.current.finalizeDrop(); });
    expect(mockSendUpdate).toHaveBeenCalledWith('a', 'acquired', [
      { ref: 'dagger', uid: 'old' },
      { ref: 'acid-flask', uid: 'e-1' },
    ]);
    // No gold in this drop → no gold write.
    expect(mockSendUpdate).not.toHaveBeenCalledWith('a', 'gold', expect.anything());
  });

  it('is frozen offline (no writes at all)', async () => {
    session = { connected: true, foundryConnected: false };
    drop = openDropState();
    const { result } = renderHook(() => useLootDrop());
    let ok;
    await act(async () => { ok = await result.current.finalizeDrop(); });
    expect(ok).toBe(false);
    expect(mockSendUpdate).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockSetDrop).not.toHaveBeenCalled();
  });

  it('leaves the drop intact when the doc save fails (credits already synced)', async () => {
    mockSave.mockRejectedValueOnce(new Error('boom'));
    drop = openDropState();
    const { result } = renderHook(() => useLootDrop());
    await expect(
      act(async () => { await result.current.finalizeDrop(); }),
    ).rejects.toThrow('boom');
    expect(mockSetDrop).not.toHaveBeenCalled();
  });
});
