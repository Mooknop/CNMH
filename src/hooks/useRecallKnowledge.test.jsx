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

describe('useRecallKnowledge.witness (#1537 S9)', () => {
  it('stamps a fresh witnessed ability and logs the reveal once', () => {
    const { result } = renderHook(() => useRecallKnowledge());

    act(() => {
      result.current.witness('ghoul-key', { name: 'Paralysis', kind: 'ability', creatureName: 'Ghoul' });
    });

    expect(mockKnowledge['ghoul-key'].witnessed.Paralysis).toEqual(
      expect.objectContaining({ kind: 'ability' })
    );
    expect(mockAppendLog).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Ghoul's Paralysis revealed to players (witnessed)" })
    );

    // Idempotent: re-witnessing neither rewrites nor re-logs.
    const stamped = mockKnowledge['ghoul-key'].witnessed.Paralysis;
    act(() => {
      result.current.witness('ghoul-key', { name: 'Paralysis', kind: 'ability', creatureName: 'Ghoul' });
    });
    expect(mockKnowledge['ghoul-key'].witnessed.Paralysis).toBe(stamped);
    expect(mockAppendLog).toHaveBeenCalledTimes(1);
  });

  it('preserves existing reveals on the record and no-ops without a key or name', () => {
    mockKnowledge = { 'ghoul-key': { ...{}, identity: true, witnessed: {} } };
    const { result } = renderHook(() => useRecallKnowledge());

    act(() => {
      result.current.witness('ghoul-key', { name: 'Jaws', kind: 'strike' });
      result.current.witness(null, { name: 'Jaws' });
      result.current.witness('ghoul-key', {});
    });

    expect(mockKnowledge['ghoul-key'].identity).toBe(true);
    expect(Object.keys(mockKnowledge['ghoul-key'].witnessed)).toEqual(['Jaws']);
  });
});
