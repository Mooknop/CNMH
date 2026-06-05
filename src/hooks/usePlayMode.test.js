import { renderHook, act } from '@testing-library/react';

jest.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) =>
      ReactLib.useState(typeof init === 'function' ? init() : init),
  };
});

let mockEncounter = { active: false };
jest.mock('./useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounter }),
}));

import { usePlayMode } from './usePlayMode';

const setup = () => renderHook(() => usePlayMode());

beforeEach(() => {
  mockEncounter = { active: false };
});

describe('usePlayMode', () => {
  it('defaults to exploration mode with movement disabled', () => {
    const { result } = setup();
    expect(result.current.mode).toBe('exploration');
    expect(result.current.gmMode).toBe('exploration');
    expect(result.current.moveEnabled).toBe(false);
  });

  it('encounter active overrides gmMode to encounter', () => {
    mockEncounter = { active: true };
    const { result } = setup();
    expect(result.current.mode).toBe('encounter');
    expect(result.current.gmMode).toBe('exploration'); // stored value unchanged
  });

  it('setGmMode switches effective mode to downtime when no encounter', () => {
    const { result } = setup();
    act(() => result.current.setGmMode('downtime'));
    expect(result.current.mode).toBe('downtime');
    expect(result.current.gmMode).toBe('downtime');
  });

  it('encounter active overrides even when gmMode is downtime', () => {
    mockEncounter = { active: true };
    const { result } = setup();
    act(() => result.current.setGmMode('downtime'));
    expect(result.current.mode).toBe('encounter');
  });

  it('setMoveEnabled toggles moveEnabled', () => {
    const { result } = setup();
    act(() => result.current.setMoveEnabled(true));
    expect(result.current.moveEnabled).toBe(true);
    act(() => result.current.setMoveEnabled(false));
    expect(result.current.moveEnabled).toBe(false);
  });

  it('defaults moveOverride to false and setMoveOverride toggles it', () => {
    const { result } = setup();
    expect(result.current.moveOverride).toBe(false);
    act(() => result.current.setMoveOverride(true));
    expect(result.current.moveOverride).toBe(true);
    act(() => result.current.setMoveOverride(false));
    expect(result.current.moveOverride).toBe(false);
  });
});
