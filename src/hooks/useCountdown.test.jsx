import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useCountdown } from './useCountdown';

const Probe = ({ deadline }) => {
  const remaining = useCountdown(deadline);
  return <span data-testid="cd">{String(remaining)}</span>;
};

describe('useCountdown (#1575 D4)', () => {
  afterEach(() => vi.useRealTimers());

  it('null deadline → null (no countdown running)', () => {
    render(<Probe deadline={null} />);
    expect(screen.getByTestId('cd')).toHaveTextContent('null');
  });

  it('counts down once per second and clamps at zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    render(<Probe deadline={1_000_000 + 10_000} />);
    expect(screen.getByTestId('cd')).toHaveTextContent('10');

    act(() => { vi.advanceTimersByTime(3_000); });
    expect(screen.getByTestId('cd')).toHaveTextContent('7');

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByTestId('cd')).toHaveTextContent('0');
  });

  it('a deadline already in the past reads 0 without starting an interval', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    render(<Probe deadline={999_000} />);
    expect(screen.getByTestId('cd')).toHaveTextContent('0');
    expect(vi.getTimerCount()).toBe(0);
  });
});
