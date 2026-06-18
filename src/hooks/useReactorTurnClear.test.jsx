import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockAppendLog = vi.fn();
let mockEncounter = { active: false, phase: 'idle', round: 0, currentTurnIndex: 0, order: [] };
vi.mock('./useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounter, appendLog: mockAppendLog }),
}));

const mockClearAll = vi.fn();
let mockReactors = [];
vi.mock('./useReactors', () => ({
  useReactors: () => ({ reactors: mockReactors, clearAll: mockClearAll }),
}));

let mockIsGm = true;
vi.mock('./useGmAuth', () => ({ useGmAuth: () => ({ isGm: mockIsGm }) }));

import { useReactorTurnClear } from './useReactorTurnClear';

const inProgress = (round, idx) => ({
  active: true, phase: 'in-progress', round, currentTurnIndex: idx, order: [],
});

const setup = () => renderHook(() => useReactorTurnClear());
const transition = (hook, next) => act(() => { mockEncounter = next; hook.rerender(); });

beforeEach(() => {
  vi.clearAllMocks();
  mockIsGm = true;
  mockReactors = [{ pcId: 'p1', label: 'Nimble Dodge', status: 'resolving' }];
  mockEncounter = { active: false, phase: 'idle', round: 0, currentTurnIndex: 0, order: [] };
});

describe('useReactorTurnClear (#477)', () => {
  it('clears declared reactors and logs once on a turn change', () => {
    mockEncounter = inProgress(1, 0);
    const hook = setup();                       // initial observation — no clear
    expect(mockClearAll).not.toHaveBeenCalled();

    transition(hook, inProgress(1, 1));         // turn advances
    expect(mockClearAll).toHaveBeenCalledTimes(1);
    expect(mockAppendLog).toHaveBeenCalledWith({
      type: 'system', text: 'Unresolved reaction cleared: Nimble Dodge',
    });
  });

  it('does not clear when the turn has not changed', () => {
    mockEncounter = inProgress(1, 0);
    const hook = setup();
    transition(hook, { ...inProgress(1, 0), log: [{}] }); // unrelated re-render
    expect(mockClearAll).not.toHaveBeenCalled();
  });

  it('does nothing on a non-GM client (single writer)', () => {
    mockIsGm = false;
    mockEncounter = inProgress(1, 0);
    const hook = setup();
    transition(hook, inProgress(1, 1));
    expect(mockClearAll).not.toHaveBeenCalled();
    expect(mockAppendLog).not.toHaveBeenCalled();
  });

  it('does nothing when there are no reactors to clear', () => {
    mockReactors = [];
    mockEncounter = inProgress(1, 0);
    const hook = setup();
    transition(hook, inProgress(1, 1));
    expect(mockClearAll).not.toHaveBeenCalled();
  });

  it('forgets the snapshot when combat ends, so the next round-1 start is not a transition', () => {
    mockEncounter = inProgress(2, 3);
    const hook = setup();
    transition(hook, { active: false, phase: 'idle', round: 0, currentTurnIndex: 0, order: [] });
    transition(hook, inProgress(1, 0));         // fresh encounter, first turn
    expect(mockClearAll).not.toHaveBeenCalled();
  });
});
