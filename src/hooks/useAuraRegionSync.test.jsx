import { renderHook } from '@testing-library/react';
import { RELAY } from '../sync/keys';
import { AURA_PROTOCOL } from '../utils/auraRelay';

// Shared store mock so useAura's internal read hits a controllable place
// (useAuraKoSweep.test.jsx pattern) — mutate __store then rerender to
// simulate an external activate()/deactivate() write.
vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  const store = {};
  const useSyncedState = (key, init) => {
    ReactLib.useReducer((x) => x + 1, 0);
    if (!(key in store)) store[key] = typeof init === 'function' ? init() : init;
    const set = (u) => { store[key] = typeof u === 'function' ? u(store[key]) : u; };
    return [store[key], set];
  };
  return {
    __esModule: true,
    useSyncedState,
    __store: store,
    __reset: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});

let mockIsGm = true;
vi.mock('./useGmAuth', () => ({ useGmAuth: () => ({ isGm: mockIsGm }) }));

let mockFoundryConnected = true;
const sendUpdate = vi.fn();
vi.mock('../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate, foundryConnected: mockFoundryConnected }),
}));

let mockProtocol = AURA_PROTOCOL;
vi.mock('./useBridgeStatus', () => ({ useBridgeStatus: () => ({ protocol: mockProtocol }) }));

import { __store, __reset } from './useSyncedState';
import { useAuraRegionSync } from './useAuraRegionSync';

const withArea = {
  id: 'Pellias',
  name: 'Pellias',
  feats: [{
    name: 'Kineticist Dedication',
    actions: [{ name: 'Channel Elements', traits: ['Aura', 'Kineticist'], areaShape: { shape: 'emanation', feet: 10 } }],
  }],
};

const noArea = {
  id: 'Pellias',
  name: 'Pellias',
  feats: [{
    name: 'Kineticist Dedication',
    actions: [{ name: 'Channel Elements', traits: ['Aura', 'Kineticist'] }],
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  __reset();
  mockIsGm = true;
  mockFoundryConnected = true;
  mockProtocol = AURA_PROTOCOL;
});

describe('useAuraRegionSync', () => {
  // Mount itself is a "gate just opened" moment (same as a reconnect — see
  // the reconnect test below), so it sends the current state once even when
  // that state is inactive: the resync guarantee ("send the current state
  // once when the bridge connects") applies uniformly rather than carving
  // out an exception for first mount.
  it('sends the current (inactive) state once on mount', () => {
    __store['cnmh_aura_Pellias'] = { active: false, ts: 0 };
    renderHook(() => useAuraRegionSync(withArea));
    expect(sendUpdate).toHaveBeenCalledTimes(1);
    const payload = sendUpdate.mock.calls[0][2];
    expect(payload.active).toBe(false);
    expect('feet' in payload).toBe(false);
  });

  it('sends active:true with the authored radius on the rising edge', () => {
    __store['cnmh_aura_Pellias'] = { active: false, ts: 0 };
    const { rerender } = renderHook(({ character }) => useAuraRegionSync(character), {
      initialProps: { character: withArea },
    });
    sendUpdate.mockClear(); // discard the mount-time resync send

    __store['cnmh_aura_Pellias'] = { active: true, ts: 5 };
    rerender({ character: withArea });

    expect(sendUpdate).toHaveBeenCalledTimes(1);
    expect(sendUpdate).toHaveBeenCalledWith('Pellias', RELAY.AURASET, expect.objectContaining({
      active: true, feet: 10, label: 'Channel Elements',
    }));
  });

  it('sends active:false on the falling edge, without a feet field', () => {
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    const { rerender } = renderHook(({ character }) => useAuraRegionSync(character), {
      initialProps: { character: withArea },
    });
    sendUpdate.mockClear(); // discard the mount-time resync send

    __store['cnmh_aura_Pellias'] = { active: false, ts: 2 };
    rerender({ character: withArea });

    expect(sendUpdate).toHaveBeenCalledTimes(1);
    const payload = sendUpdate.mock.calls[0][2];
    expect(payload.active).toBe(false);
    expect('feet' in payload).toBe(false);
  });

  it('does not resend on a re-render when the state has not changed', () => {
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    const { rerender } = renderHook(({ character }) => useAuraRegionSync(character), {
      initialProps: { character: withArea },
    });
    expect(sendUpdate).toHaveBeenCalledTimes(1);
    sendUpdate.mockClear();

    rerender({ character: { ...withArea } });
    rerender({ character: { ...withArea } });
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('never sends when the ability has no authored size (#1733 ruling 2 — no fallback radius)', () => {
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    renderHook(() => useAuraRegionSync(noArea));
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('stays silent on a non-GM device', () => {
    mockIsGm = false;
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    renderHook(() => useAuraRegionSync(withArea));
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('stays silent while Foundry is disconnected', () => {
    mockFoundryConnected = false;
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    renderHook(() => useAuraRegionSync(withArea));
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('stays silent below the AURA_PROTOCOL floor', () => {
    mockProtocol = AURA_PROTOCOL - 1;
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    renderHook(() => useAuraRegionSync(withArea));
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('re-syncs the current state when the bridge reconnects / reaches protocol', () => {
    mockFoundryConnected = false;
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    const { rerender } = renderHook(({ character }) => useAuraRegionSync(character), {
      initialProps: { character: withArea },
    });
    expect(sendUpdate).not.toHaveBeenCalled();

    mockFoundryConnected = true;
    rerender({ character: withArea });

    expect(sendUpdate).toHaveBeenCalledTimes(1);
    expect(sendUpdate).toHaveBeenCalledWith('Pellias', RELAY.AURASET, expect.objectContaining({
      active: true, feet: 10,
    }));
  });
});
