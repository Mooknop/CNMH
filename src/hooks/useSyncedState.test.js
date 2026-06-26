import { renderHook, act } from '@testing-library/react';

let mockSession;
vi.mock('../contexts/SessionContext', () => ({
  useSession: () => mockSession,
  // Mirror the real allowlist: GM-authored `_global` state and inventory-
  // organization types stay writable in the offline sandbox.
  isSandboxWritable: (t, id) => id === 'global' || t === 'loadout' || t === 'invested',
}));

import { useSyncedState } from './useSyncedState';

const noopSession = () => ({
  connected: false,
  getState: () => undefined,
  sendUpdate: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
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
    expect(mockSession.sendUpdate).toHaveBeenLastCalledWith('IzzyUncut', 'focus', 2, { force: false });
  });

  it('applies incoming subscribed updates and caches them locally', () => {
    let captured;
    mockSession.subscribe = vi.fn((c, t, cb) => { captured = cb; return vi.fn(); });
    const { result } = renderHook(() => useSyncedState('cnmh_conditions_Pellias', []));
    act(() => { captured([{ id: 'frightened' }]); });
    expect(result.current[0]).toEqual([{ id: 'frightened' }]);
    expect(JSON.parse(localStorage.getItem('cnmh_conditions_Pellias'))).toEqual([{ id: 'frightened' }]);
  });

  it('freezes synced writes in the offline sandbox (DO up, Foundry down)', () => {
    mockSession = { ...noopSession(), connected: true, foundryConnected: false };
    localStorage.setItem('cnmh_focus_IzzyUncut', JSON.stringify(3));
    const { result } = renderHook(() => useSyncedState('cnmh_focus_IzzyUncut', 0));
    expect(result.current[0]).toBe(3);
    act(() => { result.current[1](1); });
    // Inert: value frozen, nothing persisted, nothing synced.
    expect(result.current[0]).toBe(3);
    expect(JSON.parse(localStorage.getItem('cnmh_focus_IzzyUncut'))).toBe(3);
    expect(mockSession.sendUpdate).not.toHaveBeenCalled();
  });

  it('still writes synced state when Foundry is connected (live)', () => {
    mockSession = { ...noopSession(), connected: true, foundryConnected: true };
    const { result } = renderHook(() => useSyncedState('cnmh_focus_IzzyUncut', 0));
    act(() => { result.current[1](2); });
    expect(result.current[0]).toBe(2);
    expect(mockSession.sendUpdate).toHaveBeenCalledWith('IzzyUncut', 'focus', 2, { force: false });
  });

  it('keeps local-only keys interactive in the sandbox', () => {
    mockSession = { ...noopSession(), connected: true, foundryConnected: false };
    const { result } = renderHook(() => useSyncedState('some_ui_pref', 'a'));
    act(() => { result.current[1]('b'); });
    expect(result.current[0]).toBe('b');
    expect(JSON.parse(localStorage.getItem('some_ui_pref'))).toBe('b');
  });

  it('keeps GM-authored global writes interactive in the sandbox (always-on GM edits)', () => {
    mockSession = { ...noopSession(), connected: true, foundryConnected: false };
    const { result } = renderHook(() => useSyncedState('cnmh_shops_global', {}));
    act(() => { result.current[1]({ 'red-dog-smithy': { wares: [{ ref: 'slick' }] } }); });
    // GM world-setup persists and syncs even while Foundry is down.
    expect(result.current[0]).toEqual({ 'red-dog-smithy': { wares: [{ ref: 'slick' }] } });
    expect(mockSession.sendUpdate).toHaveBeenCalledWith(
      'global', 'shops', { 'red-dog-smithy': { wares: [{ ref: 'slick' }] } }, { force: false }
    );
  });

  it('keeps inventory-organization writes interactive in the sandbox (#554)', () => {
    mockSession = { ...noopSession(), connected: true, foundryConnected: false };
    const { result } = renderHook(() => useSyncedState('cnmh_invested_Jade', {}));
    act(() => { result.current[1]({ eye: true }); });
    // Attuning works offline: value updates, persists, and syncs.
    expect(result.current[0]).toEqual({ eye: true });
    expect(JSON.parse(localStorage.getItem('cnmh_invested_Jade'))).toEqual({ eye: true });
    expect(mockSession.sendUpdate).toHaveBeenCalledWith('Jade', 'invested', { eye: true }, { force: false });
  });

  it('keeps an authoritative GM write interactive on a frozen per-character key', () => {
    mockSession = { ...noopSession(), connected: true, foundryConnected: false };
    const { result } = renderHook(() =>
      useSyncedState('cnmh_gold_Thorn', 0, { authoritative: true })
    );
    // `gold` is a normally-frozen per-character resource key, but the GM dashboard
    // sets party gold authoritatively — the input must stay editable offline.
    act(() => { result.current[1](120); });
    expect(result.current[0]).toBe(120);
    expect(JSON.parse(localStorage.getItem('cnmh_gold_Thorn'))).toBe(120);
    expect(mockSession.sendUpdate).toHaveBeenCalledWith('Thorn', 'gold', 120, { force: true });
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
    const unsub = vi.fn();
    mockSession.subscribe = vi.fn(() => unsub);
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
