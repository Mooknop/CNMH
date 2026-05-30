import { renderHook, act } from '@testing-library/react';

let mockSession;
jest.mock('../contexts/SessionContext', () => ({
  useSession: () => mockSession,
}));

import { useSyncedState } from './useSyncedState';

const noopSession = () => ({
  connected: false,
  getState: () => undefined,
  sendUpdate: jest.fn(),
  subscribe: jest.fn(() => jest.fn()),
});

beforeEach(() => {
  localStorage.clear();
  mockSession = noopSession();
});

describe('useSyncedState', () => {
  it('falls back to initialValue when nothing is stored', () => {
    const { result } = renderHook(() => useSyncedState('cnmh_focus_IzzyUncut', 7));
    expect(result.current[0]).toBe(7);
  });

  it('supports a function initialValue', () => {
    const { result } = renderHook(() => useSyncedState('cnmh_focus_IzzyUncut', () => 11));
    expect(result.current[0]).toBe(11);
  });

  it('reads from localStorage when present and server has nothing', () => {
    localStorage.setItem('cnmh_focus_IzzyUncut', JSON.stringify(4));
    const { result } = renderHook(() => useSyncedState('cnmh_focus_IzzyUncut', 0));
    expect(result.current[0]).toBe(4);
  });

  it('server state takes precedence over localStorage', () => {
    localStorage.setItem('cnmh_focus_IzzyUncut', JSON.stringify(4));
    mockSession.getState = (c, t) => (c === 'IzzyUncut' && t === 'focus' ? 9 : undefined);
    const { result } = renderHook(() => useSyncedState('cnmh_focus_IzzyUncut', 0));
    expect(result.current[0]).toBe(9);
  });

  it('functional updater reads the latest value (no stale closure) and syncs', () => {
    const { result } = renderHook(() => useSyncedState('cnmh_focus_IzzyUncut', 0));
    act(() => { result.current[1]((p) => p + 1); });
    act(() => { result.current[1]((p) => p + 1); });
    expect(result.current[0]).toBe(2);
    expect(JSON.parse(localStorage.getItem('cnmh_focus_IzzyUncut'))).toBe(2);
    expect(mockSession.sendUpdate).toHaveBeenLastCalledWith('IzzyUncut', 'focus', 2);
  });

  it('applies incoming subscribed updates and caches them locally', () => {
    let captured;
    mockSession.subscribe = jest.fn((c, t, cb) => { captured = cb; return jest.fn(); });
    const { result } = renderHook(() => useSyncedState('cnmh_conditions_Pellias', []));
    act(() => { captured([{ id: 'frightened' }]); });
    expect(result.current[0]).toEqual([{ id: 'frightened' }]);
    expect(JSON.parse(localStorage.getItem('cnmh_conditions_Pellias'))).toEqual([{ id: 'frightened' }]);
  });

  it('non-matching keys behave as plain localStorage with no sync', () => {
    const { result } = renderHook(() => useSyncedState('some_other_key', 'init'));
    expect(mockSession.subscribe).not.toHaveBeenCalled();
    act(() => { result.current[1]('changed'); });
    expect(result.current[0]).toBe('changed');
    expect(JSON.parse(localStorage.getItem('some_other_key'))).toBe('changed');
    expect(mockSession.sendUpdate).not.toHaveBeenCalled();
  });

  it('unsubscribes on unmount', () => {
    const unsub = jest.fn();
    mockSession.subscribe = jest.fn(() => unsub);
    const { unmount } = renderHook(() => useSyncedState('cnmh_slots_JadeInferno', {}));
    unmount();
    expect(unsub).toHaveBeenCalled();
  });

  it('re-derives the value when the key changes (e.g. switching characters)', () => {
    const stored = { Pellias: 18, Ashka: 42 };
    mockSession.getState = (c, t) => (t === 'hp' ? stored[c] : undefined);
    const { result, rerender } = renderHook(
      ({ key }) => useSyncedState(key, 0),
      { initialProps: { key: 'cnmh_hp_Pellias' } }
    );
    expect(result.current[0]).toBe(18);
    // Switch to a different character on the same hook instance.
    rerender({ key: 'cnmh_hp_Ashka' });
    expect(result.current[0]).toBe(42);
  });

  it('falls back to initialValue when the new key has no stored value', () => {
    const { result, rerender } = renderHook(
      ({ key }) => useSyncedState(key, () => ({ current: 0 })),
      { initialProps: { key: 'cnmh_hp_Pellias' } }
    );
    localStorage.setItem('cnmh_hp_Pellias', JSON.stringify({ current: 5 }));
    rerender({ key: 'cnmh_hp_Pellias' }); // same key — no reset
    // Now switch to an untouched character; should reset to the fresh initial.
    rerender({ key: 'cnmh_hp_Nobody' });
    expect(result.current[0]).toEqual({ current: 0 });
  });
});
