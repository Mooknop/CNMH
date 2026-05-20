import { renderHook, act } from '@testing-library/react';

jest.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) =>
      ReactLib.useState(typeof init === 'function' ? init() : init),
  };
});

import { useTurnState, defaultTurnState } from './useTurnState';

const setup = (charId = 'Pellias') => renderHook(() => useTurnState(charId));

describe('useTurnState', () => {
  it('default state matches defaultTurnState()', () => {
    const { result } = setup();
    expect(result.current.turnState).toEqual(defaultTurnState());
  });

  it('spendActions increments actionsSpent and appends actionsLog', () => {
    const { result } = setup();
    act(() => result.current.spendActions(2, 'Double Slice'));
    const { actionsSpent, actionsLog } = result.current.turnState;
    expect(actionsSpent).toBe(2);
    expect(actionsLog).toHaveLength(1);
    expect(actionsLog[0]).toMatchObject({ name: 'Double Slice', cost: 2 });
  });

  it('spendActions accumulates across multiple calls', () => {
    const { result } = setup();
    act(() => result.current.spendActions(1, 'Stride'));
    act(() => result.current.spendActions(2, 'Strike'));
    expect(result.current.turnState.actionsSpent).toBe(3);
    expect(result.current.turnState.actionsLog).toHaveLength(2);
  });

  it('spendReaction sets reactionSpent and appends log', () => {
    const { result } = setup();
    act(() => result.current.spendReaction('Shield Block'));
    const { reactionSpent, actionsLog } = result.current.turnState;
    expect(reactionSpent).toBe(true);
    expect(actionsLog[0]).toMatchObject({ name: 'Shield Block', cost: 'reaction' });
  });

  it('spendReaction does not touch actionsSpent', () => {
    const { result } = setup();
    act(() => result.current.spendActions(1, 'Stride'));
    act(() => result.current.spendReaction('Shield Block'));
    expect(result.current.turnState.actionsSpent).toBe(1);
  });

  it('resetForNewTurn clears actionsSpent, marks reaction available, sets hasStartedFirstTurn', () => {
    const { result } = setup();
    act(() => result.current.spendActions(3, 'Triple'));
    act(() => result.current.spendReaction('Block'));
    act(() => result.current.resetForNewTurn());
    expect(result.current.turnState).toMatchObject({
      actionsSpent: 0,
      reactionAvailable: true,
      reactionSpent: false,
      hasStartedFirstTurn: true,
      actionsLog: [],
    });
  });

  it('reaction is unavailable by default (hasStartedFirstTurn=false)', () => {
    const { result } = setup();
    expect(result.current.turnState.reactionAvailable).toBe(false);
    expect(result.current.turnState.hasStartedFirstTurn).toBe(false);
  });

  it('spendActions with no label defaults to "Action"', () => {
    const { result } = setup();
    act(() => result.current.spendActions(1));
    expect(result.current.turnState.actionsLog[0].name).toBe('Action');
  });

  it('spendReaction with no label defaults to "Reaction"', () => {
    const { result } = setup();
    act(() => result.current.spendReaction());
    expect(result.current.turnState.actionsLog[0].name).toBe('Reaction');
  });
});
