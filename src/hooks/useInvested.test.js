import { renderHook, act } from '@testing-library/react';

// useSyncedState → plain useState (single consumer in this unit test).
vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) => ReactLib.useState(init),
  };
});

import { useInvested, ATTUNE_CAP } from './useInvested';

const setup = () => renderHook(() => useInvested('hero'));

describe('useInvested', () => {
  it('attunes and un-attunes a uid', () => {
    const { result } = setup();
    expect(result.current.isInvested('a')).toBe(false);
    act(() => result.current.attune('a'));
    expect(result.current.isInvested('a')).toBe(true);
    expect(result.current.investedCount).toBe(1);
    act(() => result.current.unattune('a'));
    expect(result.current.isInvested('a')).toBe(false);
    expect(result.current.investedCount).toBe(0);
  });

  it('is idempotent — re-attuning the same uid does not inflate the count', () => {
    const { result } = setup();
    act(() => result.current.attune('a'));
    act(() => result.current.attune('a'));
    expect(result.current.investedCount).toBe(1);
  });

  it(`caps attunement at ${ATTUNE_CAP} invested items`, () => {
    const { result } = setup();
    act(() => {
      for (let i = 0; i < ATTUNE_CAP; i += 1) result.current.attune(`u${i}`);
    });
    expect(result.current.investedCount).toBe(ATTUNE_CAP);
    // The 11th is rejected.
    act(() => result.current.attune('overflow'));
    expect(result.current.investedCount).toBe(ATTUNE_CAP);
    expect(result.current.isInvested('overflow')).toBe(false);
  });

  it('un-attuning frees a slot so a new item can attune', () => {
    const { result } = setup();
    act(() => {
      for (let i = 0; i < ATTUNE_CAP; i += 1) result.current.attune(`u${i}`);
    });
    act(() => result.current.unattune('u0'));
    act(() => result.current.attune('fresh'));
    expect(result.current.isInvested('fresh')).toBe(true);
    expect(result.current.investedCount).toBe(ATTUNE_CAP);
  });

  it('ignores a null uid', () => {
    const { result } = setup();
    act(() => result.current.attune(null));
    expect(result.current.investedCount).toBe(0);
  });
});
