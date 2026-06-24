import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { usePartyActivity } from './usePartyActivity';
import { CharacterContext } from '../contexts/CharacterContext';
import { SessionContext } from '../contexts/SessionContext';
import { getCharacterColor } from '../utils/CharacterUtils';

const makeWrapper = (characters, stateMap) => {
  const subscribers = {};
  const getState = (id, type) => stateMap[`${id}_${type}`] ?? null;
  const subscribe = vi.fn((id, type, cb) => {
    const key = `${id}_${type}`;
    if (!subscribers[key]) subscribers[key] = new Set();
    subscribers[key].add(cb);
    return () => subscribers[key].delete(cb);
  });
  const notify = (id, type) => subscribers[`${id}_${type}`]?.forEach((cb) => cb());
  const Wrapper = ({ children }) => (
    <SessionContext.Provider value={{ getState, subscribe, sendUpdate: vi.fn(), connected: true }}>
      <CharacterContext.Provider value={{ characters }}>{children}</CharacterContext.Provider>
    </SessionContext.Provider>
  );
  return { Wrapper, notify, subscribe };
};

const chars = [{ id: 'a', name: 'Ashka' }, { id: 'b', name: 'Blu' }, { id: 'c', name: 'Izzy' }];
const ready = (state) => (state != null ? 'ready' : 'planning');

describe('usePartyActivity', () => {
  it('returns a per-PC view with raw state, derived status, color and isYou', () => {
    const { Wrapper } = makeWrapper(chars, { a_exploration: 'Scout' });
    const { result } = renderHook(
      () => usePartyActivity('exploration', { youId: 'a', deriveStatus: ready }),
      { wrapper: Wrapper },
    );
    const a = result.current.party.find((p) => p.char.id === 'a');
    expect(a.state).toBe('Scout');
    expect(a.status).toBe('ready');
    expect(a.isYou).toBe(true);
    expect(result.current.party.find((p) => p.char.id === 'b').status).toBe('planning');
  });

  it('sorts the viewer first and assigns roster-index colors', () => {
    const { Wrapper } = makeWrapper(chars, {});
    const { result } = renderHook(
      () => usePartyActivity('exploration', { youId: 'b', deriveStatus: ready }),
      { wrapper: Wrapper },
    );
    expect(result.current.party[0].char.id).toBe('b');
    expect(result.current.party.find((p) => p.char.id === 'a').color).toBe(getCharacterColor(0));
    expect(result.current.party.find((p) => p.char.id === 'b').color).toBe(getCharacterColor(1));
  });

  it('preserves roster order when youFirst is false', () => {
    const { Wrapper } = makeWrapper(chars, {});
    const { result } = renderHook(
      () => usePartyActivity('exploration', { youId: 'c', youFirst: false }),
      { wrapper: Wrapper },
    );
    expect(result.current.party.map((p) => p.char.id)).toEqual(['a', 'b', 'c']);
  });

  it('counts ready PCs and the total', () => {
    const { Wrapper } = makeWrapper(chars, { a_exploration: 'Scout', c_exploration: 'Hustle' });
    const { result } = renderHook(
      () => usePartyActivity('exploration', { deriveStatus: ready }),
      { wrapper: Wrapper },
    );
    expect(result.current.readyCount).toBe(2);
    expect(result.current.total).toBe(3);
  });

  it('subscribes to each PC on the given state type and re-derives on change', () => {
    const stateMap = {};
    const { Wrapper, notify, subscribe } = makeWrapper(chars, stateMap);
    const { result } = renderHook(
      () => usePartyActivity('exploration', { deriveStatus: ready }),
      { wrapper: Wrapper },
    );
    expect(subscribe).toHaveBeenCalledWith('a', 'exploration', expect.any(Function));
    expect(result.current.readyCount).toBe(0);

    stateMap.a_exploration = 'Scout';
    act(() => notify('a', 'exploration'));
    expect(result.current.readyCount).toBe(1);
  });

  it('defaults every PC to planning without a deriveStatus', () => {
    const { Wrapper } = makeWrapper(chars, { a_exploration: 'Scout' });
    const { result } = renderHook(() => usePartyActivity('exploration', {}), { wrapper: Wrapper });
    expect(result.current.readyCount).toBe(0);
    expect(result.current.party.every((p) => p.status === 'planning')).toBe(true);
  });

  it('handles an empty party', () => {
    const { Wrapper } = makeWrapper([], {});
    const { result } = renderHook(() => usePartyActivity('exploration', {}), { wrapper: Wrapper });
    expect(result.current.party).toEqual([]);
    expect(result.current.total).toBe(0);
  });
});
