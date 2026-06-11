import { renderHook } from '@testing-library/react';
import { toGameSeconds } from '../utils/gameTime';

// ── Mocks ──────────────────────────────────────────────────────────────────

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

let mockClock = { day: 5, month: 2, year: 4725, hour: 8, minute: 0, second: 0 };
vi.mock('../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: mockClock.day, month: mockClock.month, year: mockClock.year },
    time: { hour: mockClock.hour, minute: mockClock.minute, second: mockClock.second },
  }),
}));

let mockIsGm = true;
vi.mock('./useGmAuth', () => ({ useGmAuth: () => ({ isGm: mockIsGm }) }));

const mockAppendEvent = vi.fn();
vi.mock('./useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: mockAppendEvent }),
}));

import { useEffectExpirySweep } from './useEffectExpirySweep';

const NOW = toGameSeconds(mockClock);

const seed = (charId, effects) => { stateStore[charId] = { effects }; };

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(stateStore).forEach((k) => delete stateStore[k]);
  mockIsGm = true;
  mockClock = { day: 5, month: 2, year: 4725, hour: 8, minute: 0, second: 0 };
  mockCharacters = [{ id: 'char-a', name: 'Izzy' }];
});

describe('useEffectExpirySweep', () => {
  it('removes effects whose expireAtSecs has passed and logs them', () => {
    seed('char-a', [
      { id: 'e1', effectId: 'ability-immunity', source: 'Guidance', expireAtSecs: NOW - 1 },
      { id: 'e2', effectId: 'heroism-1', expireAtSecs: NOW + 3600 },
    ]);
    renderHook(() => useEffectExpirySweep());
    expect(mockSendUpdate).toHaveBeenCalledTimes(1);
    const [charId, key, next] = mockSendUpdate.mock.calls[0];
    expect(charId).toBe('char-a');
    expect(key).toBe('effects');
    expect(next.map((e) => e.id)).toEqual(['e2']);
    expect(mockAppendEvent).toHaveBeenCalledWith({
      type: 'expire',
      text: 'Immune (Guidance) expired on Izzy',
    });
  });

  it('leaves encounter-boundary effects (expireAt only) untouched', () => {
    seed('char-a', [{ id: 'e1', effectId: 'heroism-1', expireAt: { round: 2, boundary: 'round-end' } }]);
    renderHook(() => useEffectExpirySweep());
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('does not write when nothing is expired yet', () => {
    seed('char-a', [{ id: 'e1', effectId: 'ability-immunity', expireAtSecs: NOW + 60 }]);
    renderHook(() => useEffectExpirySweep());
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('non-GM clients never write', () => {
    mockIsGm = false;
    seed('char-a', [{ id: 'e1', effectId: 'ability-immunity', expireAtSecs: NOW - 1 }]);
    renderHook(() => useEffectExpirySweep());
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('sweeps every character', () => {
    mockCharacters = [
      { id: 'char-a', name: 'Izzy' },
      { id: 'char-b', name: 'Pellias' },
    ];
    seed('char-a', [{ id: 'a1', effectId: 'ability-immunity', expireAtSecs: NOW - 1 }]);
    seed('char-b', [{ id: 'b1', effectId: 'ability-immunity', expireAtSecs: NOW - 1 }]);
    renderHook(() => useEffectExpirySweep());
    expect(mockSendUpdate).toHaveBeenCalledTimes(2);
  });
});
