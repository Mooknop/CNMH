import { renderHook } from '@testing-library/react';

// Control roster and encounter order via module-level refs so each test
// can set the values it needs without spyOn leakage between tests.
let mockRoster = [];
let mockOrder = [];
let mockFoundryCombatId = null;

vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) => {
      if (key === 'cnmh_roster_global') {
        return ReactLib.useState(mockRoster);
      }
      return ReactLib.useState(typeof init === 'function' ? init() : init);
    },
  };
});

const mockSetActorMap = vi.fn();
let mockActorMap = {};
let mockCharacters = [];

vi.mock('./useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, foundryCombatId: mockFoundryCombatId, order: mockOrder },
    actorMap: mockActorMap,
    setActorMap: mockSetActorMap,
  }),
}));

vi.mock('../contexts/ContentContext', () => ({
  useContent: () => ({ characters: mockCharacters }),
}));

import { useActorMapAutoMatch } from './useActorMapAutoMatch';

beforeEach(() => {
  vi.clearAllMocks();
  mockActorMap = {};
  mockCharacters = [];
  mockRoster = [];
  mockOrder = [];
  mockFoundryCombatId = null;
});

describe('useActorMapAutoMatch — roster path', () => {
  it('does nothing when roster is empty and order is empty', () => {
    renderHook(() => useActorMapAutoMatch());
    expect(mockSetActorMap).not.toHaveBeenCalled();
  });

  it('does nothing when characters list is empty', () => {
    mockRoster = [{ actorId: 'actor-abc', name: 'Pellias' }];
    renderHook(() => useActorMapAutoMatch());
    expect(mockSetActorMap).not.toHaveBeenCalled();
  });

  it('maps roster actorId to charId by case-insensitive name match', () => {
    mockCharacters = [{ id: 'char-pellias', name: 'Pellias' }];
    mockRoster = [{ actorId: 'actor-abc', name: 'pellias' }];

    renderHook(() => useActorMapAutoMatch());

    expect(mockSetActorMap).toHaveBeenCalled();
    const updater = mockSetActorMap.mock.calls[0][0];
    const result = updater({});
    expect(result).toEqual({ 'actor-abc': 'char-pellias' });
  });

  it('does not overwrite an existing actorMap entry', () => {
    mockCharacters = [{ id: 'char-pellias', name: 'Pellias' }];
    mockRoster = [{ actorId: 'actor-abc', name: 'Pellias' }];
    mockActorMap = { 'actor-abc': 'char-someone-else' };

    renderHook(() => useActorMapAutoMatch());

    // If setActorMap is called, the updater must preserve the existing value.
    if (mockSetActorMap.mock.calls.length) {
      const updater = mockSetActorMap.mock.calls[0][0];
      const result = updater(mockActorMap);
      expect(result['actor-abc']).toBe('char-someone-else');
    } else {
      expect(mockSetActorMap).not.toHaveBeenCalled();
    }
  });

  it('skips roster entries without actorId', () => {
    mockCharacters = [{ id: 'char-pellias', name: 'Pellias' }];
    mockRoster = [{ actorId: null, name: 'Pellias' }];

    renderHook(() => useActorMapAutoMatch());

    if (mockSetActorMap.mock.calls.length) {
      const updater = mockSetActorMap.mock.calls[0][0];
      const result = updater({});
      expect(Object.keys(result)).toHaveLength(0);
    }
  });
});

describe('useActorMapAutoMatch — encounter path', () => {
  it('maps combatant foundryActorId to charId by name', () => {
    mockCharacters = [{ id: 'char-ashka', name: 'Ashka' }];
    mockOrder = [{ foundryActorId: 'actor-xyz', name: 'Ashka' }];
    mockFoundryCombatId = 'combat-1';

    renderHook(() => useActorMapAutoMatch());

    expect(mockSetActorMap).toHaveBeenCalled();
    const updater = mockSetActorMap.mock.calls[0][0];
    const result = updater({});
    expect(result).toEqual({ 'actor-xyz': 'char-ashka' });
  });

  it('does not overwrite an existing encounter actorMap entry', () => {
    mockCharacters = [{ id: 'char-ashka', name: 'Ashka' }];
    mockOrder = [{ foundryActorId: 'actor-xyz', name: 'Ashka' }];
    mockFoundryCombatId = 'combat-1';
    mockActorMap = { 'actor-xyz': 'char-other' };

    renderHook(() => useActorMapAutoMatch());

    if (mockSetActorMap.mock.calls.length) {
      const updater = mockSetActorMap.mock.calls[0][0];
      const result = updater(mockActorMap);
      expect(result['actor-xyz']).toBe('char-other');
    } else {
      expect(mockSetActorMap).not.toHaveBeenCalled();
    }
  });
});
