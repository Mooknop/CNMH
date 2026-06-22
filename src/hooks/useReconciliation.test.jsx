import { renderHook, act } from '@testing-library/react';

// Real engine (computePendingChanges) + mocked content / session / saveDocument.
const mockSaveDocument = vi.fn();
vi.mock('../utils/gmApi', () => ({ saveDocument: (...a) => mockSaveDocument(...a) }));

let content = {};
vi.mock('../contexts/ContentContext', () => ({ useContent: () => content }));

let sessionState = {};
let subs = [];
const mockGetState = vi.fn((id, type) => sessionState[`${id}:${type}`]);
const mockSendUpdate = vi.fn((id, type, val) => {
  sessionState[`${id}:${type}`] = val;
  subs.filter((s) => s.id === id && s.type === type).forEach((s) => s.cb(val));
});
const mockSubscribe = vi.fn((id, type, cb) => {
  subs.push({ id, type, cb });
  return () => { subs = subs.filter((s) => s.cb !== cb); };
});
vi.mock('../contexts/SessionContext', () => ({
  useSession: () => ({ getState: mockGetState, sendUpdate: mockSendUpdate, subscribe: mockSubscribe }),
}));

import { useReconciliation, reconChangeId } from './useReconciliation';

const resolved = {
  id: 'c1',
  name: 'Ashka',
  inventory: [
    { uid: 'p1', name: 'Healing Potion', quantity: 3, consumable: { kind: 'healing' } },
    { uid: 'sw', name: 'Sword', quantity: 1 },
  ],
};
const rawDoc = {
  id: 'c1',
  name: 'Ashka',
  inventory: [{ ref: 'healing-potion', uid: 'p1', quantity: 3 }, { ref: 'sword', uid: 'sw' }],
};
let refresh;

beforeEach(() => {
  vi.clearAllMocks();
  subs = [];
  sessionState = {};
  refresh = vi.fn(() => Promise.resolve());
  content = { characters: [resolved], rawCharacters: [rawDoc], refresh };
  mockSaveDocument.mockResolvedValue({});
  window.localStorage.clear();
});

const CHANGE_ID = 'c1:consumed:Healing Potion';

describe('useReconciliation', () => {
  it('reports nothing pending when no overlay diverges', () => {
    const { result } = renderHook(() => useReconciliation());
    expect(result.current.pendingByChar).toEqual([]);
    expect(result.current.totalActive).toBe(0);
  });

  it('computes a pending change from the consumed overlay', () => {
    sessionState['c1:consumed'] = { 'Healing Potion': 2 };
    const { result } = renderHook(() => useReconciliation());
    expect(result.current.pendingByChar).toHaveLength(1);
    expect(result.current.pendingByChar[0].changes[0]).toMatchObject({ detail: '3 → 1' });
    expect(reconChangeId(result.current.pendingByChar[0].changes[0])).toBe(CHANGE_ID);
    expect(result.current.totalActive).toBe(1);
  });

  it('sync writes the doc, clears the overlay, records undo, and refreshes', async () => {
    sessionState['c1:consumed'] = { 'Healing Potion': 2 };
    const { result } = renderHook(() => useReconciliation());

    await act(async () => { await result.current.sync(); });

    expect(mockSaveDocument).toHaveBeenCalledTimes(1);
    const [coll, id, nextRaw] = mockSaveDocument.mock.calls[0];
    expect(coll).toBe('character');
    expect(id).toBe('c1');
    expect(nextRaw.inventory.find((e) => e.uid === 'p1').quantity).toBe(1); // decremented
    // overlay slice cleared
    expect(mockSendUpdate).toHaveBeenCalledWith('c1', 'consumed', {});
    expect(refresh).toHaveBeenCalled();
    expect(result.current.canUndo).toBe(true);
    expect(result.current.lastResult).toEqual({ synced: ['c1'], failed: [] });
    // the cleared overlay propagated back → nothing pending now
    expect(result.current.totalActive).toBe(0);
  });

  it('undo restores both the doc and the overlay', async () => {
    sessionState['c1:consumed'] = { 'Healing Potion': 2 };
    const { result } = renderHook(() => useReconciliation());
    await act(async () => { await result.current.sync(); });
    mockSaveDocument.mockClear();

    await act(async () => { await result.current.undo(); });

    // doc restored to the pre-sync raw (quantity 3 again)
    const [, , restored] = mockSaveDocument.mock.calls[0];
    expect(restored.inventory.find((e) => e.uid === 'p1').quantity).toBe(3);
    // overlay restored to its pre-sync value
    expect(mockSendUpdate).toHaveBeenCalledWith('c1', 'consumed', { 'Healing Potion': 2 });
    expect(result.current.canUndo).toBe(false);
  });

  it('discarding a change excludes it from the sync', async () => {
    sessionState['c1:consumed'] = { 'Healing Potion': 2 };
    const { result } = renderHook(() => useReconciliation());

    act(() => { result.current.toggleDiscard(CHANGE_ID); });
    expect(result.current.totalActive).toBe(0);

    await act(async () => { await result.current.sync(); });
    expect(mockSaveDocument).not.toHaveBeenCalled();
  });

  it('discardChar discards every change for that PC', () => {
    sessionState['c1:consumed'] = { 'Healing Potion': 2 };
    const { result } = renderHook(() => useReconciliation());
    act(() => { result.current.discardChar('c1'); });
    expect(result.current.totalActive).toBe(0);
  });

  it('surfaces a gold divergence from the gold overlay (#558)', () => {
    sessionState['c1:gold'] = 55; // doc has no gold field ⇒ baseline 0
    const { result } = renderHook(() => useReconciliation());
    expect(result.current.pendingByChar).toHaveLength(1);
    expect(result.current.pendingByChar[0].changes[0]).toMatchObject({
      overlay: 'gold',
      detail: '0 → 55 gp',
    });
  });

  it('sync writes gold onto the doc and does NOT clear the gold overlay', async () => {
    sessionState['c1:gold'] = 55;
    const { result } = renderHook(() => useReconciliation());

    await act(async () => { await result.current.sync(); });

    const [, , nextRaw] = mockSaveDocument.mock.calls[0];
    expect(nextRaw.gold).toBe(55);
    // gold overlay is the live source of truth — never written/cleared on sync
    expect(mockSendUpdate).not.toHaveBeenCalledWith('c1', 'gold', expect.anything());
    expect(result.current.canUndo).toBe(true);
  });

  it('keeps the overlay and records the failure when the doc write fails', async () => {
    sessionState['c1:consumed'] = { 'Healing Potion': 2 };
    mockSaveDocument.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useReconciliation());

    await act(async () => { await result.current.sync(); });

    // overlay NOT cleared (no consumed write) so nothing is lost
    expect(mockSendUpdate).not.toHaveBeenCalledWith('c1', 'consumed', expect.anything());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.lastResult.failed).toEqual([{ id: 'c1', error: 'boom' }]);
  });

  it('surfaces, syncs, and clears an acquired (gifted item) overlay (#665)', async () => {
    const gift = { uid: 'g1', name: 'Flaming Longsword', quantity: 1 };
    sessionState['c1:acquired'] = [gift];
    const { result } = renderHook(() => useReconciliation());

    expect(result.current.pendingByChar[0].changes[0]).toMatchObject({
      overlay: 'acquired',
      label: 'Flaming Longsword',
    });

    await act(async () => { await result.current.sync(); });

    const [, , nextRaw] = mockSaveDocument.mock.calls[0];
    expect(nextRaw.inventory.find((e) => e.uid === 'g1')).toMatchObject({ name: 'Flaming Longsword' });
    // overlay slice cleared (entry removed from the array)
    expect(mockSendUpdate).toHaveBeenCalledWith('c1', 'acquired', []);
    expect(result.current.totalActive).toBe(0);
  });

  it('syncs a removed (given-away) overlay by deleting the doc entry (#665)', async () => {
    sessionState['c1:removed'] = ['sw'];
    const { result } = renderHook(() => useReconciliation());

    expect(result.current.pendingByChar[0].changes[0]).toMatchObject({
      overlay: 'removed',
      label: 'Sword',
    });

    await act(async () => { await result.current.sync(); });

    const [, , nextRaw] = mockSaveDocument.mock.calls[0];
    expect(nextRaw.inventory.find((e) => e.uid === 'sw')).toBeUndefined();
    expect(mockSendUpdate).toHaveBeenCalledWith('c1', 'removed', []);
  });

  it('undo restores every touched overlay slice (#665)', async () => {
    sessionState['c1:acquired'] = [{ uid: 'g1', name: 'Flaming Longsword' }];
    sessionState['c1:removed'] = ['sw'];
    const { result } = renderHook(() => useReconciliation());
    await act(async () => { await result.current.sync(); });
    mockSendUpdate.mockClear();

    await act(async () => { await result.current.undo(); });

    expect(mockSendUpdate).toHaveBeenCalledWith('c1', 'acquired', [{ uid: 'g1', name: 'Flaming Longsword' }]);
    expect(mockSendUpdate).toHaveBeenCalledWith('c1', 'removed', ['sw']);
    expect(result.current.canUndo).toBe(false);
  });
});
