import { renderHook, act } from '@testing-library/react';

const rooms = [
  {
    id: 'sd4s-a3',
    code: 'A3',
    name: 'Shrine to Kabriri',
    treasureCache: { gold: 25, items: [{ ref: 'acid-flask', name: 'Acid Flask', qty: 2 }] },
  },
];
const mockRefresh = vi.fn();
vi.mock('../contexts/ContentContext', () => ({
  __esModule: true,
  useContent: () => ({ rooms, refresh: mockRefresh }),
}));

const mockAppendEvent = vi.fn();
vi.mock('./useSessionLog', () => ({
  useSessionLog: () => ({ log: [], appendEvent: mockAppendEvent }),
}));

const mockSave = vi.fn(() => Promise.resolve({}));
vi.mock('../utils/gmApi', () => ({
  saveDocument: (...a) => mockSave(...a),
}));

// useSyncedState fronts the single global drop key.
let drop = null;
const mockSetDrop = vi.fn((next) => {
  drop = typeof next === 'function' ? next(drop) : next;
});
vi.mock('./useSyncedState', () => ({
  useSyncedState: (key, initial) => {
    if (String(key) === 'cnmh_lootdrop_global') return [drop, mockSetDrop];
    return [initial, vi.fn()];
  },
}));

import { useLootDrop } from './useLootDrop';

beforeEach(() => {
  drop = null;
  vi.clearAllMocks();
});

describe('useLootDrop', () => {
  it('openDrop writes a drop from the room cache', () => {
    const { result } = renderHook(() => useLootDrop());
    let built;
    act(() => { built = result.current.openDrop(rooms[0]); });
    expect(built).toMatchObject({ roomId: 'sd4s-a3', gold: 25, status: 'open' });
    expect(mockSetDrop).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'sd4s-a3' }));
  });

  it('openDrop is a no-op while a drop is already open (one at a time)', () => {
    drop = { id: 'x', roomId: 'other', status: 'open', gold: 1, items: [] };
    const { result } = renderHook(() => useLootDrop());
    let built;
    act(() => { built = result.current.openDrop(rooms[0]); });
    expect(built).toBeNull();
    expect(mockSetDrop).not.toHaveBeenCalled();
  });

  it('openDrop returns null when the room has nothing distributable', () => {
    const { result } = renderHook(() => useLootDrop());
    let built;
    act(() => { built = result.current.openDrop({ id: 'z', name: 'Empty', treasureCache: null }); });
    expect(built).toBeNull();
    expect(mockSetDrop).not.toHaveBeenCalled();
  });

  it('cancelDrop clears the drop and writes nothing else', () => {
    drop = { id: 'x', roomId: 'sd4s-a3', status: 'open', gold: 1, items: [] };
    const { result } = renderHook(() => useLootDrop());
    act(() => { result.current.cancelDrop(); });
    expect(mockSetDrop).toHaveBeenCalledWith(null);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it('finalizeDrop stamps distributedAt, logs, and clears', async () => {
    drop = {
      id: 'x', roomId: 'sd4s-a3', roomName: 'A3. Shrine to Kabriri',
      status: 'open', gold: 25, items: [{ lineId: 'l1', ref: 'acid-flask', qty: 2 }],
    };
    const { result } = renderHook(() => useLootDrop());
    let ok;
    await act(async () => { ok = await result.current.finalizeDrop(); });
    expect(ok).toBe(true);
    expect(mockSave).toHaveBeenCalledWith(
      'room', 'sd4s-a3',
      expect.objectContaining({ id: 'sd4s-a3', distributedAt: expect.any(Number) }),
    );
    expect(mockRefresh).toHaveBeenCalled();
    expect(mockAppendEvent).toHaveBeenCalledWith({
      type: 'action',
      text: 'Distributed A3. Shrine to Kabriri treasure — 25 gp + 2 items',
    });
    expect(mockSetDrop).toHaveBeenCalledWith(null);
  });

  it('finalizeDrop leaves the drop intact when the doc save fails', async () => {
    mockSave.mockRejectedValueOnce(new Error('boom'));
    drop = { id: 'x', roomId: 'sd4s-a3', roomName: 'A3', status: 'open', gold: 5, items: [] };
    const { result } = renderHook(() => useLootDrop());
    await expect(
      act(async () => { await result.current.finalizeDrop(); }),
    ).rejects.toThrow('boom');
    expect(mockSetDrop).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it('finalizeDrop still closes out a drop whose room no longer exists', async () => {
    drop = { id: 'x', roomId: 'gone', roomName: 'Ghost Room', status: 'open', gold: 5, items: [] };
    const { result } = renderHook(() => useLootDrop());
    let ok;
    await act(async () => { ok = await result.current.finalizeDrop(); });
    expect(ok).toBe(true);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockSetDrop).toHaveBeenCalledWith(null);
  });
});
