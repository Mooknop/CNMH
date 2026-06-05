import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { CharacterContext } from '../contexts/CharacterContext';

let mockOverride = false;
jest.mock('./useSyncedState', () => ({
  __esModule: true,
  useSyncedState: () => [mockOverride, jest.fn()],
}));

let stateMap = {};
let subscribers = [];
const mockGetState = jest.fn();
const mockSubscribe = jest.fn();

jest.mock('../contexts/SessionContext', () => ({
  __esModule: true,
  useSession: () => ({ getState: mockGetState, subscribe: mockSubscribe }),
}));

import { useExplorationReady } from './useExplorationReady';

const makeWrapper = (characters) =>
  function Wrapper({ children }) {
    return (
      <CharacterContext.Provider value={{ characters }}>
        {children}
      </CharacterContext.Provider>
    );
  };

beforeEach(() => {
  // CRA sets resetMocks: true, so re-apply implementations each test.
  mockOverride = false;
  stateMap = {};
  subscribers = [];
  mockGetState.mockImplementation((id, type) => stateMap[`${id}:${type}`]);
  mockSubscribe.mockImplementation((id, type, cb) => {
    subscribers.push({ id, type, cb });
    return () => {
      subscribers = subscribers.filter((s) => s.cb !== cb);
    };
  });
});

describe('useExplorationReady', () => {
  it('is not ready when the party is empty', () => {
    const { result } = renderHook(() => useExplorationReady(), {
      wrapper: makeWrapper([]),
    });
    expect(result.current.allChosen).toBe(false);
    expect(result.current.ready).toBe(false);
    expect(result.current.ids).toEqual([]);
  });

  it('is ready when every party PC has a non-null pick', () => {
    stateMap = { 'a:exploration': 'Scout', 'b:exploration': 'Hustle' };
    const { result } = renderHook(() => useExplorationReady(), {
      wrapper: makeWrapper([{ id: 'a' }, { id: 'b' }]),
    });
    expect(result.current.allChosen).toBe(true);
    expect(result.current.ready).toBe(true);
  });

  it('is not ready when any PC has not chosen', () => {
    stateMap = { 'a:exploration': 'Scout' }; // b missing
    const { result } = renderHook(() => useExplorationReady(), {
      wrapper: makeWrapper([{ id: 'a' }, { id: 'b' }]),
    });
    expect(result.current.allChosen).toBe(false);
    expect(result.current.ready).toBe(false);
  });

  it('is ready via the GM override even when not all have chosen', () => {
    mockOverride = true;
    stateMap = { 'a:exploration': 'Scout' }; // b missing
    const { result } = renderHook(() => useExplorationReady(), {
      wrapper: makeWrapper([{ id: 'a' }, { id: 'b' }]),
    });
    expect(result.current.allChosen).toBe(false);
    expect(result.current.override).toBe(true);
    expect(result.current.ready).toBe(true);
  });

  it('subscribes to each party PC exploration key', () => {
    renderHook(() => useExplorationReady(), {
      wrapper: makeWrapper([{ id: 'a' }, { id: 'b' }]),
    });
    expect(mockSubscribe).toHaveBeenCalledWith('a', 'exploration', expect.any(Function));
    expect(mockSubscribe).toHaveBeenCalledWith('b', 'exploration', expect.any(Function));
  });

  it('recomputes readiness when a subscribed pick changes', () => {
    const { result } = renderHook(() => useExplorationReady(), {
      wrapper: makeWrapper([{ id: 'a' }]),
    });
    expect(result.current.allChosen).toBe(false);

    act(() => {
      stateMap['a:exploration'] = 'Scout';
      subscribers.forEach((s) => s.cb('Scout'));
    });

    expect(result.current.allChosen).toBe(true);
  });
});
