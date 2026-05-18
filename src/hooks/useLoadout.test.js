import { renderHook, act } from '@testing-library/react';

// useSyncedState → plain useState (single consumer in this unit test).
jest.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) => ReactLib.useState(init),
  };
});

import { useLoadout } from './useLoadout';

const setup = () => renderHook(() => useLoadout('hero'));

describe('useLoadout', () => {
  it('drop / worn family set the expected state + clear container', () => {
    const { result } = setup();
    act(() => result.current.drop('a'));
    expect(result.current.loadout.a).toEqual({ state: 'dropped', container: null, hand: undefined });
    act(() => result.current.pickUp('a'));
    expect(result.current.loadout.a).toEqual({ state: 'worn', container: null, hand: undefined });
    act(() => result.current.unhand('a'));
    expect(result.current.loadout.a.state).toBe('worn');
    act(() => result.current.retrieve('a'));
    expect(result.current.loadout.a.state).toBe('worn');
  });

  it('stow sets the container; moveToContainer only repoints placement', () => {
    const { result } = setup();
    act(() => result.current.stow('a', 'bag'));
    expect(result.current.loadout.a).toMatchObject({ container: 'bag', state: 'worn' });
    act(() => result.current.moveToContainer('a', 'pouch'));
    expect(result.current.loadout.a.container).toBe('pouch');
  });

  it('setHands: two different items → one per hand', () => {
    const { result } = setup();
    act(() => result.current.setHands({ hand1: 'sword', hand2: 'shield' }));
    expect(result.current.loadout.sword).toMatchObject({ state: 'held1', hand: 1, container: null });
    expect(result.current.loadout.shield).toMatchObject({ state: 'held1', hand: 2, container: null });
  });

  it('setHands: same item both hands → held2', () => {
    const { result } = setup();
    act(() => result.current.setHands({ hand1: 'bow', hand2: 'bow' }));
    expect(result.current.loadout.bow).toMatchObject({ state: 'held2', container: null });
  });

  it('setHands: a previously-held item not re-chosen returns to Worn', () => {
    const { result } = setup();
    act(() => result.current.setHands({ hand1: 'sword' }));
    expect(result.current.loadout.sword.state).toBe('held1');
    act(() => result.current.setHands({ hand1: 'dagger' }));
    expect(result.current.loadout.dagger).toMatchObject({ state: 'held1', hand: 1 });
    expect(result.current.loadout.sword.state).toBe('worn'); // displaced → Worn
  });
});
