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

// Only days committed in the active period count; downtime state carries a
// periodStartedAt stamp that must match the startedAt passed to the hook.
const PERIOD = 'P1';
const dt = (ledger, extra = {}) => ({ periodStartedAt: PERIOD, ledger, ...extra });

describe('useDowntimePartyReady', () => {
  it('returns 0/N ready when no one has committed any days', () => {
    const { Wrapper } = makeWrapper(chars, {});
    const { result } = renderHook(() => useDowntimePartyReady(7, PERIOD), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(0);
    expect(result.current.total).toBe(3);
    expect(result.current.allReady).toBe(false);
  });

  it('counts a PC as ready when their committed days equal the block', () => {
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: dt([{ day: 'Research', night: null }, { day: 'Research', night: null }]),
    });
    const { result } = renderHook(() => useDowntimePartyReady(2, PERIOD), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(1);
    expect(result.current.allReady).toBe(false);
  });

  it('allReady is true when every PC has committed all days', () => {
    const entry = { day: 'Research', night: null };
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: dt([entry]),
      b_downtime: dt([entry]),
      c_downtime: dt([entry]),
    });
    const { result } = renderHook(() => useDowntimePartyReady(1, PERIOD), { wrapper: Wrapper });
    expect(result.current.allReady).toBe(true);
    expect(result.current.readyCount).toBe(3);
  });

  it('re-derives when a subscription fires', () => {
    const stateMap = { a_downtime: null };
    const { Wrapper, notify } = makeWrapper(chars, stateMap);
    const { result } = renderHook(() => useDowntimePartyReady(1, PERIOD), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(0);

    stateMap.a_downtime = dt([{ day: 'Research', night: null }]);
    act(() => notify('a', 'downtime'));
    expect(result.current.readyCount).toBe(1);
  });

  it('does not count days committed under a prior period stamp', () => {
    const entries = Array(3).fill({ day: 'Research', night: null });
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: { periodStartedAt: 'OLD', ledger: entries },
    });
    const { result } = renderHook(() => useDowntimePartyReady(3, PERIOD), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(0);
  });

  it('handles null ledger gracefully', () => {
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: dt(undefined, { selected: ['Research'] }),
    });
    const { result } = renderHook(() => useDowntimePartyReady(3, PERIOD), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(0);
  });

  it('returns total 0 and allReady false for an empty party', () => {
    const { Wrapper } = makeWrapper([], {});
    const { result } = renderHook(() => useDowntimePartyReady(7, PERIOD), { wrapper: Wrapper });
    expect(result.current.total).toBe(0);
    expect(result.current.allReady).toBe(false);
  });

  it('does not count over-committed days as not-ready', () => {
    const entries = Array(5).fill({ day: 'Research', night: null });
    const { Wrapper } = makeWrapper([{ id: 'a' }], {
      a_downtime: dt(entries),
    });
    const { result } = renderHook(() => useDowntimePartyReady(3, PERIOD), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(1);
  });

  it('a project awaiting a finish decision holds its owner back even with days committed', () => {
    const entry = { day: 'Crafting', night: null };
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: dt([entry]),
      a_craftprojects: { projects: [{ id: 'p', status: 'awaiting-decision' }] },
      b_downtime: dt([entry]),
      c_downtime: dt([entry]),
    });
    const { result } = renderHook(() => useDowntimePartyReady(1, PERIOD), { wrapper: Wrapper });
    // a is paused on the decision; b and c are ready
    expect(result.current.readyCount).toBe(2);
    expect(result.current.allReady).toBe(false);
  });

  it('a reducing project does not pause readiness', () => {
    const entry = { day: 'Crafting', night: null };
    const { Wrapper } = makeWrapper([{ id: 'a' }], {
      a_downtime: dt([entry]),
      a_craftprojects: { projects: [{ id: 'p', status: 'reducing' }] },
    });
    const { result } = renderHook(() => useDowntimePartyReady(1, PERIOD), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(1);
  });

  it('re-derives when a craftprojects subscription fires', () => {
    const stateMap = {
      a_downtime: dt([{ day: 'Crafting', night: null }]),
      a_craftprojects: { projects: [{ id: 'p', status: 'awaiting-decision' }] },
    };
    const { Wrapper, notify } = makeWrapper([{ id: 'a' }], stateMap);
    const { result } = renderHook(() => useDowntimePartyReady(1, PERIOD), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(0); // paused

    stateMap.a_craftprojects = { projects: [{ id: 'p', status: 'completed' }] };
    act(() => notify('a', 'craftprojects'));
    expect(result.current.readyCount).toBe(1); // decision resolved
  });

  it('returns allReady:false and readyCount:0 when blockDays is 0 (no active block)', () => {
    // getDaysCommitted(ledger) >= 0 is trivially true without this guard
    const entries = Array(3).fill({ day: 'Research', night: null });
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: dt(entries),
      b_downtime: dt(entries),
      c_downtime: dt(entries),
    });
    const { result } = renderHook(() => useDowntimePartyReady(0, PERIOD), { wrapper: Wrapper });
    expect(result.current.allReady).toBe(false);
    expect(result.current.readyCount).toBe(0);
  });
});
