import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useReactors } from './useReactors';

// Back the synced key with plain useState so the reducer logic is exercised
// directly (functional updaters and all).
vi.mock('./useSyncedState', () => {
  const React = require('react');
  return { useSyncedState: (_key, init) => React.useState(init) };
});

describe('useReactors', () => {
  it('declares a PC as resolving', () => {
    const { result } = renderHook(() => useReactors());
    act(() => result.current.declare('p1', 'Nimble Dodge'));
    expect(result.current.reactors).toEqual([
      { pcId: 'p1', label: 'Nimble Dodge', status: 'resolving' },
    ]);
  });

  it('replaces a prior declaration for the same PC (no duplicates)', () => {
    const { result } = renderHook(() => useReactors());
    act(() => result.current.declare('p1', 'Nimble Dodge'));
    act(() => result.current.declare('p1', 'Counterspell'));
    expect(result.current.reactors).toHaveLength(1);
    expect(result.current.reactors[0].label).toBe('Counterspell');
  });

  it('supports multiple simultaneous reactors and clears one without the others', () => {
    const { result } = renderHook(() => useReactors());
    act(() => result.current.declare('p1', 'Nimble Dodge'));
    act(() => result.current.declare('p2', 'Reactive Strike'));
    expect(result.current.reactors.map((r) => r.pcId)).toEqual(['p1', 'p2']);

    act(() => result.current.clear('p1'));
    expect(result.current.reactors.map((r) => r.pcId)).toEqual(['p2']);
  });

  it('clearAll drops every declaration (turn-change sweep)', () => {
    const { result } = renderHook(() => useReactors());
    act(() => result.current.declare('p1', 'Nimble Dodge'));
    act(() => result.current.declare('p2', 'Reactive Strike'));
    expect(result.current.reactors).toHaveLength(2);

    act(() => result.current.clearAll());
    expect(result.current.reactors).toEqual([]);
  });
});
