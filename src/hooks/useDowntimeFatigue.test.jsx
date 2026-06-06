import { renderHook, act } from '@testing-library/react';
import { useDowntimeFatigue } from './useDowntimeFatigue';
import { useSyncedState } from './useSyncedState';

vi.mock('./useSyncedState', () => ({
  useSyncedState: vi.fn(),
}));

const setup = (initialConditions = []) => {
  let storedConditions = initialConditions;
  const mockSet = vi.fn((updaterOrValue) => {
    storedConditions =
      typeof updaterOrValue === 'function'
        ? updaterOrValue(storedConditions)
        : updaterOrValue;
    useSyncedState.mockReturnValue([storedConditions, mockSet]);
  });
  useSyncedState.mockReturnValue([storedConditions, mockSet]);
  return mockSet;
};

beforeEach(() => vi.clearAllMocks());

describe('useDowntimeFatigue', () => {
  it('isFatigued is false when conditions is empty', () => {
    setup([]);
    const { result } = renderHook(() => useDowntimeFatigue('char-1'));
    expect(result.current.isFatigued).toBe(false);
  });

  it('isFatigued is true when fatigued is in conditions', () => {
    setup([{ id: 'fatigued' }]);
    const { result } = renderHook(() => useDowntimeFatigue('char-1'));
    expect(result.current.isFatigued).toBe(true);
  });

  it('applyFatigue appends { id: "fatigued" } when absent', () => {
    const mockSet = setup([{ id: 'frightened', value: 1 }]);
    const { result } = renderHook(() => useDowntimeFatigue('char-1'));
    act(() => result.current.applyFatigue());
    const updater = mockSet.mock.calls[0][0];
    const next = updater([{ id: 'frightened', value: 1 }]);
    expect(next).toEqual([{ id: 'frightened', value: 1 }, { id: 'fatigued' }]);
  });

  it('applyFatigue is idempotent when fatigued is already present', () => {
    const mockSet = setup([{ id: 'fatigued' }]);
    const { result } = renderHook(() => useDowntimeFatigue('char-1'));
    act(() => result.current.applyFatigue());
    const updater = mockSet.mock.calls[0][0];
    const prev = [{ id: 'fatigued' }];
    expect(updater(prev)).toBe(prev);
  });

  it('clearFatigue removes fatigued from conditions', () => {
    const mockSet = setup([{ id: 'frightened', value: 1 }, { id: 'fatigued' }]);
    const { result } = renderHook(() => useDowntimeFatigue('char-1'));
    act(() => result.current.clearFatigue());
    const updater = mockSet.mock.calls[0][0];
    const next = updater([{ id: 'frightened', value: 1 }, { id: 'fatigued' }]);
    expect(next).toEqual([{ id: 'frightened', value: 1 }]);
  });

  it('clearFatigue is a no-op when fatigued is absent', () => {
    const mockSet = setup([{ id: 'frightened', value: 1 }]);
    const { result } = renderHook(() => useDowntimeFatigue('char-1'));
    act(() => result.current.clearFatigue());
    const updater = mockSet.mock.calls[0][0];
    expect(updater([{ id: 'frightened', value: 1 }])).toEqual([{ id: 'frightened', value: 1 }]);
  });

  it('uses cnmh_conditions_none when charId is falsy', () => {
    setup([]);
    renderHook(() => useDowntimeFatigue(null));
    expect(useSyncedState).toHaveBeenCalledWith('cnmh_conditions_none', []);
  });

  it('uses cnmh_conditions_<charId> for the named character', () => {
    setup([]);
    renderHook(() => useDowntimeFatigue('hero-1'));
    expect(useSyncedState).toHaveBeenCalledWith('cnmh_conditions_hero-1', []);
  });
});
