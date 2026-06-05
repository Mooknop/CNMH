import { renderHook } from '@testing-library/react';
import { useExplorationEffect, EXPLORATION_EFFECT_SOURCE } from './useExplorationEffect';

// Drive the reconcile logic through a controllable useSyncedState mock so we can
// assert exactly what gets written to cnmh_effects_<charId>.
let mockEffects;
const mockSetEffects = jest.fn();
jest.mock('./useSyncedState', () => ({ useSyncedState: jest.fn() }));

jest.mock('../utils/uid', () => ({ newEntryUid: () => 'uid-fixed' }));

describe('useExplorationEffect', () => {
  beforeEach(() => {
    mockEffects = [];
    // resetMocks wipes the implementation before each test, so re-install one
    // that reads the live module-level value.
    require('./useSyncedState').useSyncedState.mockImplementation(() => [mockEffects, mockSetEffects]);
  });

  // Resolve the array the component asked setEffects to store.
  const writtenValue = () => {
    const arg = mockSetEffects.mock.calls[0][0];
    return typeof arg === 'function' ? arg(mockEffects) : arg;
  };

  it('appends a tagged effect entry when an activity grants one', () => {
    renderHook(() => useExplorationEffect('izzy', 'defend'));
    expect(mockSetEffects).toHaveBeenCalledTimes(1);
    const next = writtenValue();
    expect(next).toEqual([
      { id: 'uid-fixed', effectId: 'defend', source: EXPLORATION_EFFECT_SOURCE, ts: expect.any(Number) },
    ]);
  });

  it('does nothing when the wanted effect already matches the current one', () => {
    mockEffects = [{ id: 'x', effectId: 'defend', source: EXPLORATION_EFFECT_SOURCE, ts: 1 }];
    renderHook(() => useExplorationEffect('izzy', 'defend'));
    expect(mockSetEffects).not.toHaveBeenCalled();
  });

  it('removes the tagged effect when no effect is wanted', () => {
    mockEffects = [
      { id: 'keep', effectId: 'heroism-1', source: 'spell' },
      { id: 'drop', effectId: 'defend', source: EXPLORATION_EFFECT_SOURCE },
    ];
    renderHook(() => useExplorationEffect('izzy', null));
    expect(writtenValue()).toEqual([{ id: 'keep', effectId: 'heroism-1', source: 'spell' }]);
  });

  it('swaps the tagged effect without disturbing other effects', () => {
    mockEffects = [
      { id: 'keep', effectId: 'bless', source: 'spell' },
      { id: 'old', effectId: 'defend', source: EXPLORATION_EFFECT_SOURCE },
    ];
    renderHook(() => useExplorationEffect('izzy', 'some-other'));
    expect(writtenValue()).toEqual([
      { id: 'keep', effectId: 'bless', source: 'spell' },
      { id: 'uid-fixed', effectId: 'some-other', source: EXPLORATION_EFFECT_SOURCE, ts: expect.any(Number) },
    ]);
  });

  it('no-ops when charId is missing', () => {
    renderHook(() => useExplorationEffect(null, 'defend'));
    expect(mockSetEffects).not.toHaveBeenCalled();
  });
});
