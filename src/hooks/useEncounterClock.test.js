import { renderHook, act } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockEncounter = { active: false, phase: 'idle', round: 0 };
jest.mock('./useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounter }),
}));

let mockIsGm = true;
jest.mock('./useGmAuth', () => ({
  useGmAuth: () => ({ isGm: mockIsGm }),
}));

const mockAdvanceSeconds = jest.fn();
jest.mock('../contexts/GameDateContext', () => ({
  useGameDate: () => ({ advanceSeconds: mockAdvanceSeconds }),
}));

// useSyncedState: behave like plain useState so we can track write calls too.
jest.mock('./useSyncedState', () => {
  const React = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) => React.useState(typeof init === 'function' ? init() : init),
  };
});

import { useEncounterClock } from './useEncounterClock';

const setup = () => renderHook(() => useEncounterClock());

beforeEach(() => {
  jest.clearAllMocks();
  mockIsGm = true;
  mockEncounter = { active: false, phase: 'idle', round: 0 };
  localStorage.clear();
});

// Helper to transition encounter state inside an act() call.
const setEncounter = (hook, next) => {
  act(() => { mockEncounter = next; hook.rerender(); });
};

describe('useEncounterClock', () => {
  it('starts with 0 combat seconds', () => {
    const { result } = setup();
    expect(result.current.combatSecs).toBe(0);
  });

  it('accrues 6 s when round 1 starts (beginRound1)', () => {
    const hook = setup();
    setEncounter(hook, { active: true, phase: 'in-progress', round: 1 });
    expect(hook.result.current.combatSecs).toBe(6);
  });

  it('accrues 6 s more per subsequent round', () => {
    const hook = setup();
    setEncounter(hook, { active: true, phase: 'in-progress', round: 1 });
    setEncounter(hook, { active: true, phase: 'in-progress', round: 2 });
    setEncounter(hook, { active: true, phase: 'in-progress', round: 3 });
    expect(hook.result.current.combatSecs).toBe(18);
  });

  it('does not accrue while phase is not in-progress', () => {
    const hook = setup();
    setEncounter(hook, { active: true, phase: 'setup', round: 0 });
    expect(hook.result.current.combatSecs).toBe(0);
  });

  it('commits accumulated seconds to the clock and resets on encounter end', () => {
    const hook = setup();
    setEncounter(hook, { active: true, phase: 'in-progress', round: 1 });
    setEncounter(hook, { active: true, phase: 'in-progress', round: 2 }); // 12 s
    setEncounter(hook, { active: false, phase: 'idle', round: 0 }); // end
    expect(mockAdvanceSeconds).toHaveBeenCalledTimes(1);
    expect(mockAdvanceSeconds).toHaveBeenCalledWith(12);
    expect(hook.result.current.combatSecs).toBe(0);
  });

  it('resets tally cleanly for a second consecutive encounter', () => {
    const hook = setup();
    // First encounter
    setEncounter(hook, { active: true, phase: 'in-progress', round: 1 });
    setEncounter(hook, { active: false, phase: 'idle', round: 0 });
    expect(mockAdvanceSeconds).toHaveBeenCalledWith(6);

    mockAdvanceSeconds.mockClear();

    // Second encounter
    setEncounter(hook, { active: true, phase: 'in-progress', round: 1 });
    setEncounter(hook, { active: true, phase: 'in-progress', round: 2 });
    setEncounter(hook, { active: false, phase: 'idle', round: 0 });
    expect(mockAdvanceSeconds).toHaveBeenCalledWith(12);
  });

  it('does not commit when combatSecs is 0 at encounter end', () => {
    const hook = setup();
    setEncounter(hook, { active: true, phase: 'setup', round: 0 });
    setEncounter(hook, { active: false, phase: 'idle', round: 0 });
    expect(mockAdvanceSeconds).not.toHaveBeenCalled();
  });

  it('non-GM does not accrue or commit', () => {
    mockIsGm = false;
    const hook = setup();
    setEncounter(hook, { active: true, phase: 'in-progress', round: 1 });
    setEncounter(hook, { active: true, phase: 'in-progress', round: 2 });
    expect(hook.result.current.combatSecs).toBe(0); // no writes from this client
    setEncounter(hook, { active: false, phase: 'idle', round: 0 });
    expect(mockAdvanceSeconds).not.toHaveBeenCalled();
  });
});
