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

// Catalog comes from the ContentContext (DO-backed since #263), not the
// bundled pf2eEffects module — DO-only effects must resolve in expiry logs.
let mockCharacters = [];
let mockEffectCatalog = [];
vi.mock('../contexts/ContentContext', () => ({
  useContent: () => ({ characters: mockCharacters, effects: mockEffectCatalog }),
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
  mockEffectCatalog = [
    { id: 'ability-immunity', name: 'Immune' },
    { id: 'heroism-1', name: 'Heroism' },
  ];
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

  it('resolves DO-only (GM-authored) effects by name in the expiry log', () => {
    // 'shrouded' is not in the bundled pf2eEffects.js — only the context catalog.
    mockEffectCatalog = [...mockEffectCatalog, { id: 'shrouded', name: 'Shrouded' }];
    seed('char-a', [{ id: 'e1', effectId: 'shrouded', expireAtSecs: NOW - 1 }]);
    renderHook(() => useEffectExpirySweep());
    expect(mockAppendEvent).toHaveBeenCalledWith({
      type: 'expire',
      text: 'Shrouded expired on Izzy',
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

  it('prunes expired item-target effects and logs them on the item (#339)', () => {
    stateStore['char-a'] = {
      itemeffects: [
        { id: 'i1', itemId: 'plate', itemName: 'Full Plate', label: 'Weightless', source: 'Oil of Weightlessness', expireAtSecs: NOW - 1 },
        { id: 'i2', itemId: 'bow', itemName: 'Bow', label: 'Oiled', source: 'Oil', expireAtSecs: NOW + 3600 },
      ],
    };
    renderHook(() => useEffectExpirySweep());
    const call = mockSendUpdate.mock.calls.find(([, key]) => key === 'itemeffects');
    expect(call).toBeTruthy();
    expect(call[2].map((e) => e.id)).toEqual(['i2']);
    expect(mockAppendEvent).toHaveBeenCalledWith({
      type: 'expire',
      text: 'Weightless (Oil of Weightlessness) expired on Full Plate',
    });
  });

  it('sweeps item effects even when the character has no creature effects', () => {
    stateStore['char-a'] = {
      itemeffects: [{ id: 'i1', itemId: 'plate', itemName: 'Full Plate', label: 'Weightless', source: 'Oil', expireAtSecs: NOW - 1 }],
    };
    renderHook(() => useEffectExpirySweep());
    expect(mockSendUpdate).toHaveBeenCalledWith('char-a', 'itemeffects', []);
  });
});
