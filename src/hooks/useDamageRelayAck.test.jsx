import { renderHook, act } from '@testing-library/react';

const mockAppendLog = vi.fn();
vi.mock('./useEncounter', () => ({
  useEncounter: () => ({ appendLog: mockAppendLog }),
}));

let mockIsGm = true;
vi.mock('./useGmAuth', () => ({
  useGmAuth: () => ({ isGm: mockIsGm }),
}));

// useSyncedState: plain useState with the setter captured so tests can push acks.
const syncedMock = vi.hoisted(() => ({ set: null }));
vi.mock('./useSyncedState', () => {
  const React = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) => {
      const [value, setValue] = React.useState(init);
      syncedMock.set = setValue;
      return [value, setValue];
    },
  };
});

import { useDamageRelayAck } from './useDamageRelayAck';

const ack = (overrides = {}) => ({
  id: 'dmg-1',
  sourceName: 'Fireball',
  applied: [{ entryId: 'e-1', name: 'Goblin Warrior', amount: 8, type: 'fire' }],
  failed: [],
  ts: Date.now(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  syncedMock.set = null;
  mockIsGm = true;
});

describe('useDamageRelayAck (#1016)', () => {
  it('mirrors a fresh ack into the encounter log, once per applied hit', () => {
    renderHook(() => useDamageRelayAck());
    act(() => { syncedMock.set(ack()); });
    expect(mockAppendLog).toHaveBeenCalledTimes(1);
    expect(mockAppendLog).toHaveBeenCalledWith({
      type: 'system',
      text: 'Foundry: Fireball: 8 fire damage applied to Goblin Warrior',
    });
  });

  it('notes failed hits so the GM applies them by hand', () => {
    renderHook(() => useDamageRelayAck());
    act(() => {
      syncedMock.set(ack({
        applied: [],
        failed: [{ entryId: 'e-2', name: 'Troll' }],
      }));
    });
    expect(mockAppendLog).toHaveBeenCalledWith({
      type: 'system',
      text: 'Foundry: Fireball: damage NOT applied to Troll — apply by hand',
    });
  });

  it('logs each ack id only once (re-renders do not duplicate)', () => {
    const hook = renderHook(() => useDamageRelayAck());
    const a = ack();
    act(() => { syncedMock.set(a); });
    hook.rerender();
    act(() => { syncedMock.set({ ...a }); }); // same id, new reference
    expect(mockAppendLog).toHaveBeenCalledTimes(1);
  });

  it('ignores stale acks (hydration from a previous session)', () => {
    renderHook(() => useDamageRelayAck());
    act(() => { syncedMock.set(ack({ ts: Date.now() - 60_000 })); });
    expect(mockAppendLog).not.toHaveBeenCalled();
  });

  it('is a GM-only writer', () => {
    mockIsGm = false;
    renderHook(() => useDamageRelayAck());
    act(() => { syncedMock.set(ack()); });
    expect(mockAppendLog).not.toHaveBeenCalled();
  });

  it('unmarked untyped damage logs without a type token', () => {
    renderHook(() => useDamageRelayAck());
    act(() => {
      syncedMock.set(ack({
        sourceName: '',
        applied: [{ entryId: 'e-1', name: 'Goblin', amount: 5, type: '' }],
      }));
    });
    expect(mockAppendLog).toHaveBeenCalledWith({
      type: 'system',
      text: 'Foundry: 5 damage applied to Goblin',
    });
  });
});
