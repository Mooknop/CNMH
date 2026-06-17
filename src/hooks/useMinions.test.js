import { renderHook, act } from '@testing-library/react';

vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) =>
      ReactLib.useState(typeof init === 'function' ? init() : init),
  };
});

import { useMinions } from './useMinions';

const setup = (ownerId = 'Ashka') => renderHook(() => useMinions(ownerId));

describe('useMinions', () => {
  it('getHp lazily defaults to the authored max when unset (no eager write)', () => {
    const { result } = setup();
    expect(result.current.getHp('companion', 32)).toEqual({ current: 32, max: 32, temp: 0 });
    expect(result.current.minions).toEqual({});
  });

  it('damage absorbs temp HP first, then reduces current, clamped at 0', () => {
    const { result } = setup();
    act(() => result.current.setHp('companion', { current: 32, max: 32, temp: 5 }));
    act(() => result.current.damage('companion', 8, 32));
    // 5 temp absorbed, 3 to current
    expect(result.current.getHp('companion', 32)).toEqual({ current: 29, max: 32, temp: 0 });
    act(() => result.current.damage('companion', 100, 32));
    expect(result.current.getHp('companion', 32).current).toBe(0);
  });

  it('heal clamps current at max', () => {
    const { result } = setup();
    act(() => result.current.setHp('companion', { current: 10, max: 32, temp: 0 }));
    act(() => result.current.heal('companion', 100, 32));
    expect(result.current.getHp('companion', 32).current).toBe(32);
  });

  it('keeps roles independent and max tracks the data value', () => {
    const { result } = setup();
    act(() => result.current.damage('companion', 4, 32));
    expect(result.current.getHp('companion', 32)).toEqual({ current: 28, max: 32, temp: 0 });
    // familiar untouched, falls back to its own data max
    expect(result.current.getHp('familiar', 20)).toEqual({ current: 20, max: 20, temp: 0 });
  });

  it('getConditions lazily defaults to an empty list', () => {
    const { result } = setup();
    expect(result.current.getConditions('companion')).toEqual([]);
  });

  it('setConditions stores a role list without disturbing the other role or its hp', () => {
    const { result } = setup();
    act(() => result.current.setHp('companion', { current: 30, max: 32, temp: 0 }));
    act(() => result.current.setConditions('companion', [{ id: 'frightened', value: 2 }]));
    act(() => result.current.setConditions('familiar', [{ id: 'prone', value: null }]));

    expect(result.current.getConditions('companion')).toEqual([{ id: 'frightened', value: 2 }]);
    expect(result.current.getConditions('familiar')).toEqual([{ id: 'prone', value: null }]);
    // companion HP survives the condition writes (merge, not replace)
    expect(result.current.getHp('companion', 32)).toEqual({ current: 30, max: 32, temp: 0 });
  });
});
