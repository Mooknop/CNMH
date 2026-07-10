import { renderHook, act } from '@testing-library/react';
import { useValueFlash, FX_FLASH_MS } from './useValueFlash';

const setup = (initial, classify) =>
  renderHook(({ value }) => useValueFlash(value, classify), {
    initialProps: { value: initial },
  });

const advance = (ms) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useValueFlash', () => {
  it('does not flash the initial mount value', () => {
    const { result } = setup(30);
    expect(result.current).toBeNull();
    advance(FX_FLASH_MS * 2);
    expect(result.current).toBeNull();
  });

  it('treats the first non-null value after a null hydration gap as baseline', () => {
    const { result, rerender } = setup(null);
    rerender({ value: 30 });
    expect(result.current).toBeNull();
    // ...but a real transition from that baseline flashes
    rerender({ value: 18 });
    expect(result.current).toEqual({ fx: 'changed', delta: -12, key: 1 });
  });

  it('flashes on change and self-clears after the effect duration', () => {
    const { result, rerender } = setup(30);
    rerender({ value: 42 });
    expect(result.current).toEqual({ fx: 'changed', delta: 12, key: 1 });
    advance(FX_FLASH_MS - 1);
    expect(result.current).not.toBeNull();
    advance(1);
    expect(result.current).toBeNull();
  });

  it('does not flash a re-render with an equal value', () => {
    const { result, rerender } = setup(30);
    rerender({ value: 30 });
    expect(result.current).toBeNull();
  });

  it('routes the transition through classify(prev, next)', () => {
    const classify = (prev, next) => (next < prev ? 'damage' : 'heal');
    const { result, rerender } = setup(30, classify);
    rerender({ value: 18 });
    expect(result.current).toMatchObject({ fx: 'damage', delta: -12 });
    advance(FX_FLASH_MS);
    rerender({ value: 25 });
    expect(result.current).toMatchObject({ fx: 'heal', delta: 7 });
  });

  it('classify returning null suppresses the flash', () => {
    const { result, rerender } = setup(30, () => null);
    rerender({ value: 18 });
    expect(result.current).toBeNull();
  });

  it('omits delta for non-numeric values', () => {
    const { result, rerender } = setup('raised');
    rerender({ value: 'dropped' });
    expect(result.current).toEqual({ fx: 'changed', delta: undefined, key: 1 });
  });

  it('rapid successive changes bump the key and restart the clear timer', () => {
    const { result, rerender } = setup(30);
    rerender({ value: 25 });
    expect(result.current.key).toBe(1);
    advance(FX_FLASH_MS - 100);
    rerender({ value: 20 });
    expect(result.current).toEqual({ fx: 'changed', delta: -5, key: 2 });
    // old timer must not clear the restarted flash
    advance(100);
    expect(result.current).not.toBeNull();
    advance(FX_FLASH_MS - 100);
    expect(result.current).toBeNull();
  });

  it('returns null under prefers-reduced-motion', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn(() => ({ matches: true }));
    try {
      const { result, rerender } = setup(30);
      rerender({ value: 18 });
      expect(result.current).toBeNull();
      expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    } finally {
      window.matchMedia = original;
    }
  });
});
