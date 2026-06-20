import React from 'react';
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { PlayModeOverrideProvider, usePlayModeOverride } from './PlayModeOverrideContext';

describe('PlayModeOverrideContext', () => {
  it('returns an inert default when no provider is mounted', () => {
    const { result } = renderHook(() => usePlayModeOverride());
    expect(result.current.localMode).toBeNull();
    // Safe no-op — must not throw.
    expect(() => result.current.setLocalMode('encounter')).not.toThrow();
  });

  it('holds and updates the local mode within a provider', () => {
    const Probe = () => {
      const { localMode, setLocalMode } = usePlayModeOverride();
      return (
        <>
          <span data-testid="mode">{String(localMode)}</span>
          <button onClick={() => setLocalMode('downtime')}>set</button>
          <button onClick={() => setLocalMode(null)}>clear</button>
        </>
      );
    };
    render(<PlayModeOverrideProvider><Probe /></PlayModeOverrideProvider>);
    expect(screen.getByTestId('mode').textContent).toBe('null');
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('mode').textContent).toBe('downtime');
    fireEvent.click(screen.getByText('clear'));
    expect(screen.getByTestId('mode').textContent).toBe('null');
  });
});
