import { renderHook, act } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockKnowledge = {};
const mockSetKnowledge = vi.fn((updater) => {
  mockKnowledge = typeof updater === 'function' ? updater(mockKnowledge) : updater;
});
vi.mock('./useSyncedState', () => ({
  useSyncedState: () => [mockKnowledge, mockSetKnowledge],
}));

const mockAppendLog = vi.fn();
vi.mock('./useEncounter', () => ({
  useEncounter: () => ({ appendLog: mockAppendLog }),
}));

import { useRecallKnowledge } from './useRecallKnowledge';

const successArgs = {
  degree: 'success', choices: ['ac'], by: 'c1', byName: 'Vex',
  skill: 'Arcana', d20: 18, total: 25, dc: 20,
};

beforeEach(() => {
  mockKnowledge = {};
  vi.clearAllMocks();
});

describe('useRecallKnowledge.resolve — out-of-combat (#396)', () => {
  test('in-combat resolve appends to the encounter log', () => {
    const { result } = renderHook(() => useRecallKnowledge());
    act(() => result.current.resolve('gob', successArgs));
    expect(mockAppendLog).toHaveBeenCalledTimes(1);
    expect(mockKnowledge.gob.identity).toBe(true);
  });

  test('out-of-combat resolve writes the record but skips the encounter log', () => {
    const { result } = renderHook(() => useRecallKnowledge());
    act(() => result.current.resolve('gob', { ...successArgs, outOfCombat: true }));
    expect(mockAppendLog).not.toHaveBeenCalled();
    expect(mockKnowledge.gob.identity).toBe(true);
    expect(mockKnowledge.gob.ac).toBe(true);
  });

  test('out-of-combat critical failure day-locks and records history without an encounter log', () => {
    const { result } = renderHook(() => useRecallKnowledge());
    act(() => result.current.resolve('gob', {
      degree: 'criticalFailure', by: 'c1', byName: 'Vex',
      skill: 'Arcana', d20: 1, total: 6, dc: 18, outOfCombat: true, currentDay: 7,
    }));
    expect(mockAppendLog).not.toHaveBeenCalled();
    expect(mockKnowledge.gob.lockedOut).toEqual({});
    expect(mockKnowledge.gob.dayLocked).toEqual({ c1: 7 });
    expect(mockKnowledge.gob.history).toHaveLength(1);
  });
});
