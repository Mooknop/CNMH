import { renderHook, act } from '@testing-library/react';

vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) =>
      ReactLib.useState(typeof init === 'function' ? init() : init),
  };
});

let mockEncounter = { active: false };
vi.mock('./useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounter }),
}));

let mockSession = { connected: false, foundryConnected: false };
vi.mock('../contexts/SessionContext', () => ({
  useSession: () => mockSession,
}));

let mockOverride = { localMode: null, setLocalMode: vi.fn() };
vi.mock('../contexts/PlayModeOverrideContext', () => ({
  usePlayModeOverride: () => mockOverride,
}));

import { usePlayMode } from './usePlayMode';

const setup = () => renderHook(() => usePlayMode());

beforeEach(() => {
  mockEncounter = { active: false };
  mockSession = { connected: false, foundryConnected: false };
  mockOverride = { localMode: null, setLocalMode: vi.fn() };
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

  describe('offline sandbox override (#554)', () => {
    it('sandbox is false when live (DO + Foundry connected)', () => {
      mockSession = { connected: true, foundryConnected: true };
      const { result } = setup();
      expect(result.current.sandbox).toBe(false);
    });

    it('sandbox is true when DO is up but Foundry is disconnected', () => {
      mockSession = { connected: true, foundryConnected: false };
      const { result } = setup();
      expect(result.current.sandbox).toBe(true);
    });

    it('sandbox is false when the DO link is down (truly offline)', () => {
      mockSession = { connected: false, foundryConnected: false };
      const { result } = setup();
      expect(result.current.sandbox).toBe(false);
    });

    it('local override drives the mode in the sandbox', () => {
      mockSession = { connected: true, foundryConnected: false };
      mockOverride = { localMode: 'downtime', setLocalMode: vi.fn() };
      const { result } = setup();
      expect(result.current.mode).toBe('downtime');
      expect(result.current.localMode).toBe('downtime');
    });

    it('ignores the local override when live (GM mode stays authoritative)', () => {
      mockSession = { connected: true, foundryConnected: true };
      mockOverride = { localMode: 'encounter', setLocalMode: vi.fn() };
      const { result } = setup();
      act(() => result.current.setGmMode('exploration'));
      expect(result.current.mode).toBe('exploration');
    });

    it('an active encounter still wins over the local override', () => {
      mockEncounter = { active: true };
      mockSession = { connected: true, foundryConnected: false };
      mockOverride = { localMode: 'downtime', setLocalMode: vi.fn() };
      const { result } = setup();
      expect(result.current.mode).toBe('encounter');
    });

    it('exposes setLocalMode from the override context', () => {
      const setLocalMode = vi.fn();
      mockOverride = { localMode: null, setLocalMode };
      const { result } = setup();
      result.current.setLocalMode('encounter');
      expect(setLocalMode).toHaveBeenCalledWith('encounter');
    });
  });
});
