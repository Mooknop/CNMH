import { renderHook, act } from '@testing-library/react';

// useSyncedState → plain useState (single consumer in this unit test).
vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) => ReactLib.useState(init),
  };
});

import { useChambers } from './useChambers';

const UID = 'e-crescent';
const CAP = 3;
const bolt = { name: 'Crescent Cross Bolt', default: true, infinite: true };

const setup = () => renderHook(() => useChambers('hero'));

describe('useChambers', () => {
  it('stateFor returns a fresh empty state for an untracked weapon', () => {
    const { result } = setup();
    expect(result.current.stateFor(UID, CAP)).toEqual({
      chambers: [null, null, null],
      pointer: 0,
    });
  });

  it('load fills a chamber; clear empties it — round-trips through synced state', () => {
    const { result } = setup();
    act(() => result.current.load(UID, 1, bolt, CAP));
    expect(result.current.stateFor(UID, CAP).chambers[1]).toMatchObject({ default: true });
    expect(result.current.chambers[UID].chambers).toHaveLength(CAP);

    act(() => result.current.clear(UID, 1, CAP));
    expect(result.current.stateFor(UID, CAP).chambers[1]).toBeNull();
  });

  it('load is a no-op for an out-of-range chamber index', () => {
    const { result } = setup();
    act(() => result.current.load(UID, 9, bolt, CAP));
    expect(result.current.stateFor(UID, CAP).chambers.every((c) => c == null)).toBe(true);
  });

  it('advance moves the pointer one chamber and wraps', () => {
    const { result } = setup();
    act(() => result.current.advance(UID, CAP));
    expect(result.current.stateFor(UID, CAP).pointer).toBe(1);
    act(() => result.current.advance(UID, CAP));
    act(() => result.current.advance(UID, CAP));
    expect(result.current.stateFor(UID, CAP).pointer).toBe(0); // wrapped 2 → 0
  });

  it('setPointer jumps to a specific chamber (wrapping into range)', () => {
    const { result } = setup();
    act(() => result.current.setPointer(UID, 2, CAP));
    expect(result.current.stateFor(UID, CAP).pointer).toBe(2);
    act(() => result.current.setPointer(UID, 4, CAP));
    expect(result.current.stateFor(UID, CAP).pointer).toBe(1); // 4 % 3
  });

  it('fire empties the discharged chamber and advances the pointer', () => {
    const { result } = setup();
    act(() => result.current.load(UID, 0, bolt, CAP));
    act(() => result.current.load(UID, 1, bolt, CAP));
    act(() => result.current.fire(UID, 0, CAP));
    const st = result.current.stateFor(UID, CAP);
    expect(st.chambers[0]).toBeNull();
    expect(st.chambers[1]).toMatchObject({ default: true });
    expect(st.pointer).toBe(1);
  });

  it('keeps per-weapon state separate', () => {
    const { result } = setup();
    act(() => result.current.load(UID, 0, bolt, CAP));
    act(() => result.current.load('e-other', 0, bolt, 1));
    expect(result.current.stateFor(UID, CAP).chambers).toHaveLength(3);
    expect(result.current.stateFor('e-other', 1).chambers).toHaveLength(1);
  });
});
