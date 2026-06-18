import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Back useSyncedState with a real per-key React state so submit/clear round-trip.
vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return {
    useSyncedState: (key, init) => {
      const [v, setV] = ReactLib.useState(
        typeof init === 'function' ? init() : init
      );
      return [v, setV];
    },
  };
});

import { useInitiativeRoll } from './useInitiativeRoll';

beforeEach(() => vi.clearAllMocks());

describe('useInitiativeRoll', () => {
  it('starts with no roll', () => {
    const { result } = renderHook(() => useInitiativeRoll('Pellias'));
    expect(result.current.roll).toBeNull();
  });

  it('submit stores the roll with a timestamp; clear resets it', () => {
    const { result } = renderHook(() => useInitiativeRoll('Pellias'));

    act(() => result.current.submit({ d20: 15, mod: 7, total: 22, skill: 'perception' }));
    expect(result.current.roll).toMatchObject({ d20: 15, mod: 7, total: 22, skill: 'perception' });
    expect(typeof result.current.roll.ts).toBe('number');

    act(() => result.current.clear());
    expect(result.current.roll).toBeNull();
  });
});
