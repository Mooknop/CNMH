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

// "Ready" is the explicit Party-Ledger lock-in (status === 'ready') in the active
// period; downtime state carries a periodStartedAt stamp that must match the
// startedAt passed to the hook.
const PERIOD = 'P1';
const ready = (extra = {}) => ({ periodStartedAt: PERIOD, status: 'ready', ...extra });
const planning = (extra = {}) => ({ periodStartedAt: PERIOD, status: 'planning', ...extra });

describe('useDowntimePartyReady', () => {
  it('returns 0/N ready when no one has locked in', () => {
    const { Wrapper } = makeWrapper(chars, {});
    const { result } = renderHook(() => useDowntimePartyReady(7, PERIOD), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(0);
    expect(result.current.total).toBe(3);
    expect(result.current.allReady).toBe(false);
  });

  it('counts a PC as ready when their plan is locked in', () => {
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: ready({ plan: { Research: 2 } }),
    });
    const { result } = renderHook(() => useDowntimePartyReady(7, PERIOD), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(1);
    expect(result.current.allReady).toBe(false);
  });

  it('a planned-but-unlocked PC is not ready, even with days allocated', () => {
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: planning({ plan: { Research: 7 } }),
    });
    const { result } = renderHook(() => useDowntimePartyReady(7, PERIOD), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(0);
  });

  it('allReady is true when every PC has locked in', () => {
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: ready(),
      b_downtime: ready(),
      c_downtime: ready(),
    });
    const { result } = renderHook(() => useDowntimePartyReady(1, PERIOD), { wrapper: Wrapper });
    expect(result.current.allReady).toBe(true);
    expect(result.current.readyCount).toBe(3);
  });

  it('re-derives when a subscription fires', () => {
    const stateMap = { a_downtime: planning() };
    const { Wrapper, notify } = makeWrapper(chars, stateMap);
    const { result } = renderHook(() => useDowntimePartyReady(1, PERIOD), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(0);

    stateMap.a_downtime = ready();
    act(() => notify('a', 'downtime'));
    expect(result.current.readyCount).toBe(1);
  });

  it('does not count a lock-in under a prior period stamp', () => {
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: { periodStartedAt: 'OLD', status: 'ready' },
    });
    const { result } = renderHook(() => useDowntimePartyReady(3, PERIOD), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(0);
  });

  it('handles null state gracefully', () => {
    const { Wrapper } = makeWrapper(chars, { a_downtime: null });
    const { result } = renderHook(() => useDowntimePartyReady(3, PERIOD), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(0);
  });

  it('returns total 0 and allReady false for an empty party', () => {
    const { Wrapper } = makeWrapper([], {});
    const { result } = renderHook(() => useDowntimePartyReady(7, PERIOD), { wrapper: Wrapper });
    expect(result.current.total).toBe(0);
    expect(result.current.allReady).toBe(false);
  });

  it('a project awaiting a finish decision holds its owner back even when locked in', () => {
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: ready({ plan: { Crafting: 1 } }),
      a_craftprojects: { projects: [{ id: 'p', status: 'awaiting-decision' }] },
      b_downtime: ready(),
      c_downtime: ready(),
    });
    const { result } = renderHook(() => useDowntimePartyReady(1, PERIOD), { wrapper: Wrapper });
    // a is paused on the decision; b and c are ready
    expect(result.current.readyCount).toBe(2);
    expect(result.current.allReady).toBe(false);
  });

  it('a reducing project does not pause readiness', () => {
    const { Wrapper } = makeWrapper([{ id: 'a' }], {
      a_downtime: ready({ plan: { Crafting: 1 } }),
      a_craftprojects: { projects: [{ id: 'p', status: 'reducing' }] },
    });
    const { result } = renderHook(() => useDowntimePartyReady(1, PERIOD), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(1);
  });

  it('re-derives when a craftprojects subscription fires', () => {
    const stateMap = {
      a_downtime: ready({ plan: { Crafting: 1 } }),
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
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: ready(),
      b_downtime: ready(),
      c_downtime: ready(),
    });
    const { result } = renderHook(() => useDowntimePartyReady(0, PERIOD), { wrapper: Wrapper });
    expect(result.current.allReady).toBe(false);
    expect(result.current.readyCount).toBe(0);
  });
});
