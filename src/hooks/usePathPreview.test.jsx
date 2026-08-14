import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSynced = vi.fn();
vi.mock('./useSyncedState', () => ({ useSyncedState: (...a) => mockSynced(...a) }));

let mockProtocol = 16;
vi.mock('./useBridgeStatus', () => ({ useBridgeStatus: () => ({ protocol: mockProtocol }) }));

const order = [
  { entryId: 'e-goblin', kind: 'enemy', name: 'Goblin Warrior' },
  { entryId: 'e-pellias', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
];
vi.mock('./useEncounter', () => ({ useEncounter: () => ({ encounter: { order } }) }));

import { usePathPreview, PLAN_GHOST_TTL_MS, MOVE_GHOST_TTL_MS } from './usePathPreview';
import { RELAY, globalKey } from '../sync/keys';

const planPayload = (overrides = {}) => ({
  tokenId: 'tok-goblin', id: 'e-goblin', name: 'Goblin Warrior', disposition: -1,
  sceneId: 'scene-1', origin: { col: 1, row: 1 }, path: [{ col: 2, row: 1 }],
  phase: 'plan', source: 'foundry', ts: Date.now(), ...overrides,
});

const movePayload = (overrides = {}) => ({
  tokenId: 'tok-pellias', id: 'Pellias', name: 'Pellias', disposition: 1,
  sceneId: 'scene-1', origin: { col: 5, row: 5 }, path: [{ col: 6, row: 5 }],
  phase: 'move', source: 'app', ts: Date.now(), ...overrides,
});

beforeEach(() => {
  mockProtocol = 16;
  mockSynced.mockReturnValue([null]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePathPreview (#1744 S3/WS-4)', () => {
  it('picks the public channel for audience "player" (default)', () => {
    renderHook(() => usePathPreview());
    expect(mockSynced).toHaveBeenCalledWith(globalKey(RELAY.PATHPREVIEW), null);
  });

  it('picks the unfiltered GM channel only when audience: "gm" is explicit', () => {
    renderHook(() => usePathPreview({ audience: 'gm' }));
    expect(mockSynced).toHaveBeenCalledWith(globalKey(RELAY.PATHPREVIEWGM), null);
  });

  it('returns nothing below the map-move protocol floor, even with a live payload', () => {
    mockProtocol = 15;
    mockSynced.mockReturnValue([movePayload()]);
    const { result } = renderHook(() => usePathPreview());
    expect(result.current.entries).toEqual([]);
  });

  it('returns nothing with no bridge hello at all (protocol null)', () => {
    mockProtocol = null;
    mockSynced.mockReturnValue([movePayload()]);
    const { result } = renderHook(() => usePathPreview());
    expect(result.current.entries).toEqual([]);
  });

  it('surfaces a fresh move payload, joined to the order for entryId', () => {
    mockSynced.mockReturnValue([movePayload()]);
    const { result } = renderHook(() => usePathPreview());
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({
      tokenId: 'tok-pellias', charId: 'Pellias', entryId: 'e-pellias', name: 'Pellias', phase: 'move',
    });
  });

  it('accumulates by tokenId — two movers moving at once both show up', () => {
    mockSynced.mockReturnValue([movePayload({ tokenId: 'tok-a', id: null, ts: Date.now() })]);
    const { result, rerender } = renderHook(() => usePathPreview());
    expect(result.current.entries).toHaveLength(1);

    mockSynced.mockReturnValue([planPayload({ tokenId: 'tok-b', ts: Date.now() })]);
    rerender();
    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries.map((e) => e.tokenId).sort()).toEqual(['tok-a', 'tok-b']);
  });

  it('a move payload for a token supersedes that same token\'s plan (last-writer-wins by tokenId)', () => {
    mockSynced.mockReturnValue([planPayload({ ts: Date.now() })]);
    const { result, rerender } = renderHook(() => usePathPreview());
    expect(result.current.entries[0].phase).toBe('plan');

    mockSynced.mockReturnValue([movePayload({ tokenId: 'tok-goblin', id: 'e-goblin', ts: Date.now() })]);
    rerender();
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].phase).toBe('move');
  });

  it('expires a plan-phase ghost after PLAN_GHOST_TTL_MS of silence', () => {
    vi.useFakeTimers();
    const now = Date.now();
    mockSynced.mockReturnValue([planPayload({ ts: now })]);
    const { result } = renderHook(() => usePathPreview());
    expect(result.current.entries).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(PLAN_GHOST_TTL_MS - 1); });
    expect(result.current.entries).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current.entries).toHaveLength(0);
  });

  it('expires a move-phase ghost after MOVE_GHOST_TTL_MS, outliving a plan ghost', () => {
    vi.useFakeTimers();
    const now = Date.now();
    mockSynced.mockReturnValue([movePayload({ ts: now })]);
    const { result } = renderHook(() => usePathPreview());

    act(() => { vi.advanceTimersByTime(PLAN_GHOST_TTL_MS + 1); });
    expect(result.current.entries).toHaveLength(1); // still alive — longer horizon than plan

    act(() => { vi.advanceTimersByTime(MOVE_GHOST_TTL_MS - PLAN_GHOST_TTL_MS); });
    expect(result.current.entries).toHaveLength(0);
  });

  it('a fresh payload for the same token re-arms its TTL instead of expiring on the old schedule', () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    mockSynced.mockReturnValue([planPayload({ ts: t0 })]);
    const { result, rerender } = renderHook(() => usePathPreview());

    act(() => { vi.advanceTimersByTime(PLAN_GHOST_TTL_MS - 200); });
    // A re-emission (still mid-drag) lands just before the old deadline.
    mockSynced.mockReturnValue([planPayload({ ts: Date.now() })]);
    rerender();

    // Past the ORIGINAL deadline, but the re-arm should keep it alive.
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current.entries).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(PLAN_GHOST_TTL_MS); });
    expect(result.current.entries).toHaveLength(0);
  });

  it('drops a payload that is already stale by ts when the hook first sees it (a replayed FULL_STATE)', () => {
    const staleTs = Date.now() - (MOVE_GHOST_TTL_MS + 5000);
    mockSynced.mockReturnValue([movePayload({ ts: staleTs })]);
    const { result } = renderHook(() => usePathPreview());
    expect(result.current.entries).toEqual([]);
  });

  it('injectable TTL overrides win over the exported defaults', () => {
    vi.useFakeTimers();
    const now = Date.now();
    mockSynced.mockReturnValue([planPayload({ ts: now })]);
    const { result } = renderHook(() => usePathPreview({ planTtlMs: 50 }));
    expect(result.current.entries).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(51); });
    expect(result.current.entries).toHaveLength(0);
  });
});
