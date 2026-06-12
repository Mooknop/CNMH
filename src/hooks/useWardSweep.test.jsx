import { renderHook } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockRaised = false;
vi.mock('./useShield', () => ({
  useShield: () => ({ raised: mockRaised }),
}));
vi.mock('./useCharacter', () => ({
  useCharacter: (c) => (c ? { inventory: [] } : null),
}));

const stateStore = {}; // charId -> { effects: [...] }
const mockGetState = vi.fn((charId, key) => stateStore[charId]?.[key]);
const mockSendUpdate = vi.fn((charId, key, value) => {
  if (!stateStore[charId]) stateStore[charId] = {};
  stateStore[charId][key] = value;
});
vi.mock('../contexts/SessionContext', () => ({
  useSession: () => ({ getState: mockGetState, sendUpdate: mockSendUpdate }),
}));

let mockCharacters = [];
vi.mock('../contexts/ContentContext', () => ({
  useContent: () => ({ characters: mockCharacters }),
}));

let mockIsGm = true;
vi.mock('./useGmAuth', () => ({ useGmAuth: () => ({ isGm: mockIsGm }) }));

const mockAppendEvent = vi.fn();
vi.mock('./useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: mockAppendEvent }),
}));

import { useWardSweep } from './useWardSweep';

const pellias = { id: 'Pellias', name: 'Pellias' };
const wardEntry = { id: 'w1', effectId: 'devoted-guardian-tower', appliedBy: 'Pellias', source: 'Devoted Guardian' };
const otherEntry = { id: 'e1', effectId: 'heroism-1', appliedBy: 'Izzy' };

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(stateStore).forEach((k) => delete stateStore[k]);
  mockIsGm = true;
  mockRaised = false;
  mockCharacters = [{ id: 'Ashka', name: 'Ashka' }, { id: 'Pellias', name: 'Pellias' }];
});

describe('useWardSweep', () => {
  it('strips ward entries from allies when the shield is not raised, and logs', () => {
    stateStore['Ashka'] = { effects: [wardEntry, otherEntry] };
    renderHook(() => useWardSweep(pellias));
    expect(mockSendUpdate).toHaveBeenCalledTimes(1);
    const [charId, key, next] = mockSendUpdate.mock.calls[0];
    expect(charId).toBe('Ashka');
    expect(key).toBe('effects');
    expect(next).toEqual([otherEntry]);
    expect(mockAppendEvent).toHaveBeenCalledWith({
      type: 'expire',
      text: "Pellias's ward on Ashka ends — shield no longer raised",
    });
  });

  it('leaves everything alone while the shield is raised', () => {
    mockRaised = true;
    stateStore['Ashka'] = { effects: [wardEntry] };
    renderHook(() => useWardSweep(pellias));
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('non-GM clients never write', () => {
    mockIsGm = false;
    stateStore['Ashka'] = { effects: [wardEntry] };
    renderHook(() => useWardSweep(pellias));
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it("does not touch other warders' entries or unrelated effects", () => {
    stateStore['Ashka'] = {
      effects: [{ ...wardEntry, appliedBy: 'SomeoneElse' }, otherEntry],
    };
    renderHook(() => useWardSweep(pellias));
    expect(mockSendUpdate).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it('no-op when no character carries effects', () => {
    renderHook(() => useWardSweep(pellias));
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });
});
