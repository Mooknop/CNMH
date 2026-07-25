import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useDevicePref, setDevicePref } from './useDevicePref';

const Probe = ({ name, fallback, testId = 'pref' }) => {
  const [value, set] = useDevicePref(name, fallback);
  return (
    <button data-testid={testId} onClick={() => set(!value)}>
      {String(value)}
    </button>
  );
};

describe('useDevicePref (#1575 D3)', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts at the fallback and persists a set to localStorage', () => {
    render(<Probe name="tabledice" fallback={false} />);
    expect(screen.getByTestId('pref')).toHaveTextContent('false');

    fireEvent.click(screen.getByTestId('pref'));
    expect(screen.getByTestId('pref')).toHaveTextContent('true');
    expect(window.localStorage.getItem('cnmh-devicepref-tabledice')).toBe('true');
  });

  it('rehydrates from localStorage on mount', () => {
    window.localStorage.setItem('cnmh-devicepref-tabledice', 'true');
    render(<Probe name="tabledice" fallback={false} />);
    expect(screen.getByTestId('pref')).toHaveTextContent('true');
  });

  it('keeps every mounted consumer in sync, including non-hook setters', () => {
    render(
      <>
        <Probe name="tabledice" fallback={false} testId="a" />
        <Probe name="tabledice" fallback={false} testId="b" />
      </>
    );
    fireEvent.click(screen.getByTestId('a'));
    expect(screen.getByTestId('b')).toHaveTextContent('true');

    act(() => setDevicePref('tabledice', false));
    expect(screen.getByTestId('a')).toHaveTextContent('false');
    expect(screen.getByTestId('b')).toHaveTextContent('false');
  });

  it('prefs are independent per name', () => {
    render(
      <>
        <Probe name="tabledice" fallback={false} testId="a" />
        <Probe name="other" fallback={true} testId="b" />
      </>
    );
    fireEvent.click(screen.getByTestId('a'));
    expect(screen.getByTestId('a')).toHaveTextContent('true');
    expect(screen.getByTestId('b')).toHaveTextContent('true'); // its own fallback, untouched
    expect(window.localStorage.getItem('cnmh-devicepref-other')).toBeNull();
  });
});
