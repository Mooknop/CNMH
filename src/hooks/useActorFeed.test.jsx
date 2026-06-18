import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useActorFeed } from './useActorFeed';

let mockPayload;
vi.mock('./useSyncedState', () => ({
  useSyncedState: () => [mockPayload, () => {}],
}));

beforeEach(() => {
  mockPayload = null;
});

describe('useActorFeed', () => {
  it('returns an empty feed when nothing is relayed', () => {
    const { result } = renderHook(() => useActorFeed('o1'));
    expect(result.current).toEqual({ actions: 3, spent: 0, reaction: true, feed: [] });
  });

  it('ignores a payload for a different (stale) combatant', () => {
    mockPayload = { entryId: 'old', actions: 3, spent: 2, reaction: false, feed: [{ n: 1, label: 'Stride' }] };
    const { result } = renderHook(() => useActorFeed('o1'));
    expect(result.current.feed).toEqual([]);
    expect(result.current.spent).toBe(0);
  });

  it('surfaces the feed + economy when the entryId matches', () => {
    mockPayload = {
      entryId: 'o1', actions: 3, spent: 2, reaction: false,
      feed: [{ n: 1, cost: 1, label: 'Stride', state: 'done' }],
    };
    const { result } = renderHook(() => useActorFeed('o1'));
    expect(result.current).toEqual({
      actions: 3,
      spent: 2,
      reaction: false,
      feed: [{ n: 1, cost: 1, label: 'Stride', state: 'done' }],
    });
  });

  it('tolerates a malformed feed + missing entryId', () => {
    mockPayload = { entryId: 'o1', feed: 'nope' };
    expect(renderHook(() => useActorFeed('o1')).result.current.feed).toEqual([]);
    mockPayload = { entryId: 'o1' };
    expect(renderHook(() => useActorFeed(null)).result.current.feed).toEqual([]);
  });
});
