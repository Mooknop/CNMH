import { renderHook, act } from '@testing-library/react';
import { useDowntimePartyReady } from './useDowntimePartyReady';
import { CharacterContext } from '../contexts/CharacterContext';
import { SessionContext } from '../contexts/SessionContext';
import React from 'react';

const makeWrapper = (characters, stateMap) => {
  const subscribers = {};
  const getState = (charId, type) => stateMap[`${charId}_${type}`] ?? null;
  const subscribe = vi.fn((charId, type, cb) => {
    const key = `${charId}_${type}`;
    if (!subscribers[key]) subscribers[key] = new Set();
    subscribers[key].add(cb);
    return () => subscribers[key].delete(cb);
  });
  const notify = (charId, type) =>
    subscribers[`${charId}_${type}`]?.forEach((cb) => cb());

  const Wrapper = ({ children }) => (
    <SessionContext.Provider value={{ getState, subscribe, sendUpdate: vi.fn(), connected: true }}>
      <CharacterContext.Provider value={{ characters }}>
        {children}
      </CharacterContext.Provider>
    </SessionContext.Provider>
  );
  return { Wrapper, notify };
};

const chars = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('useDowntimePartyReady', () => {
  it('returns 0/N ready when no one has committed any days', () => {
    const { Wrapper } = makeWrapper(chars, {});
    const { result } = renderHook(() => useDowntimePartyReady(7), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(0);
    expect(result.current.total).toBe(3);
    expect(result.current.allReady).toBe(false);
  });

  it('counts a PC as ready when their committed days equal the block', () => {
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: { ledger: [{ day: 'Research', night: null }, { day: 'Research', night: null }] },
    });
    const { result } = renderHook(() => useDowntimePartyReady(2), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(1);
    expect(result.current.allReady).toBe(false);
  });

  it('allReady is true when every PC has committed all days', () => {
    const entry = { day: 'Research', night: null };
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: { ledger: [entry] },
      b_downtime: { ledger: [entry] },
      c_downtime: { ledger: [entry] },
    });
    const { result } = renderHook(() => useDowntimePartyReady(1), { wrapper: Wrapper });
    expect(result.current.allReady).toBe(true);
    expect(result.current.readyCount).toBe(3);
  });

  it('re-derives when a subscription fires', () => {
    const stateMap = { a_downtime: null };
    const { Wrapper, notify } = makeWrapper(chars, stateMap);
    const { result } = renderHook(() => useDowntimePartyReady(1), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(0);

    stateMap.a_downtime = { ledger: [{ day: 'Research', night: null }] };
    act(() => notify('a', 'downtime'));
    expect(result.current.readyCount).toBe(1);
  });

  it('handles null ledger gracefully', () => {
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: { selected: ['Research'] },
    });
    const { result } = renderHook(() => useDowntimePartyReady(3), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(0);
  });

  it('returns total 0 and allReady false for an empty party', () => {
    const { Wrapper } = makeWrapper([], {});
    const { result } = renderHook(() => useDowntimePartyReady(7), { wrapper: Wrapper });
    expect(result.current.total).toBe(0);
    expect(result.current.allReady).toBe(false);
  });

  it('does not count over-committed days as not-ready', () => {
    const entries = Array(5).fill({ day: 'Research', night: null });
    const { Wrapper } = makeWrapper([{ id: 'a' }], {
      a_downtime: { ledger: entries },
    });
    const { result } = renderHook(() => useDowntimePartyReady(3), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(1);
  });
});
