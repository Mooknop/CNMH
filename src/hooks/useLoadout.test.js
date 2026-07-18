import { renderHook, act } from '@testing-library/react';

// useSyncedState → plain useState (single consumer in this unit test).
vi.mock('./useSyncedState', () => {
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

  it('strapTo: worn on the hand, on-person, out of containers', () => {
    const { result } = setup();
    act(() => result.current.stow('buckler', 'bag'));
    act(() => result.current.strapTo('buckler', 1));
    expect(result.current.loadout.buckler).toMatchObject({
      state: 'worn',
      container: null,
      strapHand: 1,
    });
    expect(result.current.loadout.buckler.hand).toBeUndefined();
  });

  it('strapTo: one strapped item per hand — previous occupant is released', () => {
    const { result } = setup();
    act(() => result.current.strapTo('buckler', 1));
    act(() => result.current.strapTo('gauntlet', 1));
    expect(result.current.loadout.gauntlet.strapHand).toBe(1);
    expect(result.current.loadout.buckler.strapHand).toBeUndefined();
    expect(result.current.loadout.buckler.state).toBe('worn'); // stays on your person
  });

  it('unstrap keeps the item Worn; drop/stow clear the strap', () => {
    const { result } = setup();
    act(() => result.current.strapTo('buckler', 2));
    act(() => result.current.unstrap('buckler'));
    expect(result.current.loadout.buckler).toMatchObject({ state: 'worn' });
    expect(result.current.loadout.buckler.strapHand).toBeUndefined();

    act(() => result.current.strapTo('buckler', 2));
    act(() => result.current.drop('buckler'));
    expect(result.current.loadout.buckler.strapHand).toBeUndefined();

    act(() => result.current.strapTo('buckler', 2));
    act(() => result.current.stow('buckler', 'bag'));
    expect(result.current.loadout.buckler.strapHand).toBeUndefined();
  });

  it('setHands leaves strapped items untouched (Swap never disturbs a buckler)', () => {
    const { result } = setup();
    act(() => result.current.strapTo('buckler', 1));
    act(() => result.current.setHands({ hand1: 'sword', hand2: 'torch' }));
    expect(result.current.loadout.buckler).toMatchObject({ state: 'worn', strapHand: 1 });
    // …but a strapped uid explicitly placed into a hand is defensively unstrapped
    act(() => result.current.setHands({ hand1: 'buckler' }));
    expect(result.current.loadout.buckler.strapHand).toBeUndefined();
    expect(result.current.loadout.buckler.state).toBe('held1');
  });
});
