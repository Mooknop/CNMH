import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { usePartyDowntime } from './usePartyDowntime';
import { CharacterContext } from '../contexts/CharacterContext';
import { SessionContext } from '../contexts/SessionContext';
import { getCharacterColor } from '../utils/CharacterUtils';

const makeWrapper = (characters, stateMap) => {
  const subscribers = {};
  const getState = (charId, type) => stateMap[`${charId}_${type}`] ?? null;
  const subscribe = vi.fn((charId, type, cb) => {
    const key = `${charId}_${type}`;
    if (!subscribers[key]) subscribers[key] = new Set();
    subscribers[key].add(cb);
    return () => subscribers[key].delete(cb);
  });
  const notify = (charId, type) => subscribers[`${charId}_${type}`]?.forEach((cb) => cb());

  const Wrapper = ({ children }) => (
    <SessionContext.Provider value={{ getState, subscribe, sendUpdate: vi.fn(), connected: true }}>
      <CharacterContext.Provider value={{ characters }}>{children}</CharacterContext.Provider>
    </SessionContext.Provider>
  );
  return { Wrapper, notify };
};

const chars = [{ id: 'a', name: 'Ashka' }, { id: 'b', name: 'Blu' }, { id: 'c', name: 'Izzy' }];
const PERIOD = 'P1';
const stamp = (o) => ({ periodStartedAt: PERIOD, ...o });

describe('usePartyDowntime', () => {
  it('returns a derived view (plan/status/paired/ledger) per party PC', () => {
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: stamp({ plan: { Research: 2 }, status: 'ready', paired: { Research: true } }),
    });
    const { result } = renderHook(() => usePartyDowntime(PERIOD, 'a'), { wrapper: Wrapper });
    const a = result.current.party.find((p) => p.char.id === 'a');
    expect(a.plan).toEqual({ Research: 2 });
    expect(a.status).toBe('ready');
    expect(a.paired).toEqual({ Research: true });
    expect(a.ledger).toHaveLength(2);
  });

  it('sorts the viewer first and flags isYou', () => {
    const { Wrapper } = makeWrapper(chars, {});
    const { result } = renderHook(() => usePartyDowntime(PERIOD, 'b'), { wrapper: Wrapper });
    expect(result.current.party[0].char.id).toBe('b');
    expect(result.current.party[0].isYou).toBe(true);
    expect(result.current.party.filter((p) => p.isYou)).toHaveLength(1);
  });

  it('assigns each PC its roster-index color (computed before reordering)', () => {
    const { Wrapper } = makeWrapper(chars, {});
    const { result } = renderHook(() => usePartyDowntime(PERIOD, 'b'), { wrapper: Wrapper });
    expect(result.current.party.find((p) => p.char.id === 'a').color).toBe(getCharacterColor(0));
    expect(result.current.party.find((p) => p.char.id === 'b').color).toBe(getCharacterColor(1));
    expect(result.current.party.find((p) => p.char.id === 'c').color).toBe(getCharacterColor(2));
  });

  it('counts locked-in PCs and the party total', () => {
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: stamp({ status: 'ready' }),
      b_downtime: stamp({ status: 'planning' }),
      c_downtime: stamp({ status: 'ready' }),
    });
    const { result } = renderHook(() => usePartyDowntime(PERIOD, 'a'), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(2);
    expect(result.current.total).toBe(3);
  });

  it('reads a prior-period stamp as empty/planning', () => {
    const { Wrapper } = makeWrapper(chars, {
      a_downtime: { periodStartedAt: 'OLD', plan: { Research: 3 }, status: 'ready' },
    });
    const { result } = renderHook(() => usePartyDowntime(PERIOD, 'a'), { wrapper: Wrapper });
    const a = result.current.party.find((p) => p.char.id === 'a');
    expect(a.plan).toEqual({});
    expect(a.status).toBe('planning');
  });

  it('re-derives when a teammate downtime subscription fires', () => {
    const stateMap = { b_downtime: stamp({ status: 'planning' }) };
    const { Wrapper, notify } = makeWrapper(chars, stateMap);
    const { result } = renderHook(() => usePartyDowntime(PERIOD, 'a'), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(0);

    stateMap.b_downtime = stamp({ status: 'ready' });
    act(() => notify('b', 'downtime'));
    expect(result.current.readyCount).toBe(1);
  });

  it('handles an empty party', () => {
    const { Wrapper } = makeWrapper([], {});
    const { result } = renderHook(() => usePartyDowntime(PERIOD, 'a'), { wrapper: Wrapper });
    expect(result.current.party).toEqual([]);
    expect(result.current.total).toBe(0);
  });
});
