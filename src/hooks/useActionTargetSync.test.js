import { renderHook, act } from '@testing-library/react';

const mockSendUpdate = vi.fn();
let mockProtocol = 17;

vi.mock('../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: mockSendUpdate }),
}));
vi.mock('./useBridgeStatus', () => ({ useBridgeStatus: () => ({ protocol: mockProtocol }) }));

import { useActionTargetSync, ACTION_SYNC_DEBOUNCE_MS } from './useActionTargetSync';
import { RELAY } from '../sync/keys';

beforeEach(() => {
  mockSendUpdate.mockClear();
  mockProtocol = 17;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useActionTargetSync (#1749 S1)', () => {
  it('does nothing until the debounce window elapses', () => {
    renderHook(() =>
      useActionTargetSync('Pellias', ['e-goblin'], { kind: 'strike', sourceUid: 'ability-1' })
    );
    expect(mockSendUpdate).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(ACTION_SYNC_DEBOUNCE_MS - 1); });
    expect(mockSendUpdate).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(mockSendUpdate).toHaveBeenCalledTimes(1);
    expect(mockSendUpdate).toHaveBeenCalledWith('Pellias', RELAY.ACTION, {
      kind: 'strike',
      sourceUid: 'ability-1',
      targets: ['e-goblin'],
      ts: expect.any(Number),
    });
  });

  it('coalesces a rapid toggle burst into one write of the FINAL target set', () => {
    const { rerender } = renderHook(
      ({ targets }) => useActionTargetSync('Pellias', targets, { kind: 'strike' }),
      { initialProps: { targets: ['e-goblin'] } }
    );
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ targets: ['e-goblin', 'e-orc'] });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ targets: ['e-orc'] }); // deselected the goblin mid-burst
    expect(mockSendUpdate).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(ACTION_SYNC_DEBOUNCE_MS); });
    expect(mockSendUpdate).toHaveBeenCalledTimes(1);
    expect(mockSendUpdate.mock.calls[0][2].targets).toEqual(['e-orc']);
  });

  it('does not resend when the target set settles back to an already-sent value', () => {
    const { rerender } = renderHook(
      ({ targets }) => useActionTargetSync('Pellias', targets, { kind: 'strike' }),
      { initialProps: { targets: ['e-goblin'] } }
    );
    act(() => { vi.advanceTimersByTime(ACTION_SYNC_DEBOUNCE_MS); });
    expect(mockSendUpdate).toHaveBeenCalledTimes(1);

    rerender({ targets: ['e-goblin'] }); // same content, fresh array identity
    act(() => { vi.advanceTimersByTime(ACTION_SYNC_DEBOUNCE_MS); });
    expect(mockSendUpdate).toHaveBeenCalledTimes(1);
  });

  it('is a no-op with no kind (opt-in per caller)', () => {
    renderHook(() => useActionTargetSync('Pellias', ['e-goblin'], {}));
    act(() => { vi.advanceTimersByTime(ACTION_SYNC_DEBOUNCE_MS * 2); });
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('is a no-op below MAP_TARGET_PROTOCOL', () => {
    mockProtocol = 16;
    renderHook(() => useActionTargetSync('Pellias', ['e-goblin'], { kind: 'strike' }));
    act(() => { vi.advanceTimersByTime(ACTION_SYNC_DEBOUNCE_MS * 2); });
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('is a no-op with no bridge hello at all (protocol null)', () => {
    mockProtocol = null;
    renderHook(() => useActionTargetSync('Pellias', ['e-goblin'], { kind: 'strike' }));
    act(() => { vi.advanceTimersByTime(ACTION_SYNC_DEBOUNCE_MS * 2); });
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('sends for a non-active character too — the bridge, not the app, gates on active', () => {
    // No "active combatant" concept is threaded through here at all; this
    // test exists to pin that absence so a future change doesn't reintroduce
    // an app-side active check the OQ-3 ruling explicitly assigned to the bridge.
    renderHook(() => useActionTargetSync('Bystander', ['e-goblin'], { kind: 'spell' }));
    act(() => { vi.advanceTimersByTime(ACTION_SYNC_DEBOUNCE_MS); });
    expect(mockSendUpdate).toHaveBeenCalledTimes(1);
  });

  it('sends an empty array when the last target is deselected', () => {
    const { rerender } = renderHook(
      ({ targets }) => useActionTargetSync('Pellias', targets, { kind: 'strike' }),
      { initialProps: { targets: ['e-goblin'] } }
    );
    act(() => { vi.advanceTimersByTime(ACTION_SYNC_DEBOUNCE_MS); });
    expect(mockSendUpdate).toHaveBeenCalledTimes(1);

    rerender({ targets: [] });
    act(() => { vi.advanceTimersByTime(ACTION_SYNC_DEBOUNCE_MS); });
    expect(mockSendUpdate).toHaveBeenCalledTimes(2);
    expect(mockSendUpdate.mock.calls[1][2].targets).toEqual([]);
  });
});
