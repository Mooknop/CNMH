import { renderHook, act } from '@testing-library/react';
import { useTapOrder } from './useTapOrder';

describe('useTapOrder (#1749 OQ-2 option b)', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useTapOrder());
    expect(result.current.order).toEqual([]);
    expect(result.current.set.size).toBe(0);
  });

  it('appends on a fresh tap, preserving tap sequence', () => {
    const { result } = renderHook(() => useTapOrder());
    act(() => result.current.toggle('e-goblin'));
    act(() => result.current.toggle('e-orc'));
    expect(result.current.order).toEqual(['e-goblin', 'e-orc']);
  });

  it('a re-tap of an already-tapped entry removes it', () => {
    const { result } = renderHook(() => useTapOrder());
    act(() => result.current.toggle('e-goblin'));
    act(() => result.current.toggle('e-orc'));
    act(() => result.current.toggle('e-goblin'));
    expect(result.current.order).toEqual(['e-orc']);
  });

  it('isTapped reflects current membership', () => {
    const { result } = renderHook(() => useTapOrder());
    act(() => result.current.toggle('e-goblin'));
    expect(result.current.isTapped('e-goblin')).toBe(true);
    expect(result.current.isTapped('e-orc')).toBe(false);
  });

  it('set is a membership view with no ordering guarantee', () => {
    const { result } = renderHook(() => useTapOrder());
    act(() => result.current.toggle('e-goblin'));
    act(() => result.current.toggle('e-orc'));
    expect([...result.current.set].sort()).toEqual(['e-goblin', 'e-orc']);
  });

  it('clear empties both order and set', () => {
    const { result } = renderHook(() => useTapOrder());
    act(() => result.current.toggle('e-goblin'));
    act(() => result.current.clear());
    expect(result.current.order).toEqual([]);
    expect(result.current.set.size).toBe(0);
  });

  it('ignores a falsy entryId', () => {
    const { result } = renderHook(() => useTapOrder());
    act(() => result.current.toggle(null));
    act(() => result.current.toggle(undefined));
    act(() => result.current.toggle(''));
    expect(result.current.order).toEqual([]);
  });

  it('max caps the order length — a tap past the cap is ignored', () => {
    const { result } = renderHook(() => useTapOrder({ max: 2 }));
    act(() => result.current.toggle('e-goblin'));
    act(() => result.current.toggle('e-orc'));
    act(() => result.current.toggle('e-troll')); // over cap — ignored
    expect(result.current.order).toEqual(['e-goblin', 'e-orc']);
  });

  it('removing under the cap frees a slot for a new tap', () => {
    const { result } = renderHook(() => useTapOrder({ max: 2 }));
    act(() => result.current.toggle('e-goblin'));
    act(() => result.current.toggle('e-orc'));
    act(() => result.current.toggle('e-goblin')); // removes, back to 1
    act(() => result.current.toggle('e-troll')); // room again
    expect(result.current.order).toEqual(['e-orc', 'e-troll']);
  });

  it('with no max, order grows unbounded (matches the app-wide "no maximum today")', () => {
    const { result } = renderHook(() => useTapOrder());
    act(() => {
      for (let i = 0; i < 10; i += 1) result.current.toggle(`e-${i}`);
    });
    expect(result.current.order).toHaveLength(10);
  });
});
