import { renderHook, act } from '@testing-library/react';

const mockSendUpdate = vi.fn();
let mockBladeState = {}; // { [charId]: bladeValue }
let mockEncounter = { active: false, phase: 'idle', round: 0, currentTurnIndex: 0, order: [] };
let mockIsGm = true;

vi.mock('./useEncounter', () => ({ useEncounter: () => ({ encounter: mockEncounter }) }));
vi.mock('./useGmAuth', () => ({ useGmAuth: () => ({ isGm: mockIsGm }) }));
vi.mock('../contexts/SessionContext', () => ({
  useSession: () => ({
    getState: (charId, type) => (type === 'blade' ? mockBladeState[charId] : undefined),
    sendUpdate: mockSendUpdate,
  }),
}));

import { useBladeCleanup } from './useBladeCleanup';

const pc = { entryId: 'e-pc', kind: 'pc', charId: 'char-a', name: 'Ashka' };
const goblin = { entryId: 'e-gob', kind: 'enemy', name: 'Goblin' };
const order = [pc, goblin];
const inProgress = (round, turnIdx) => ({ active: true, phase: 'in-progress', round, currentTurnIndex: turnIdx, order });

const setup = () => renderHook(() => useBladeCleanup());
const advance = (hook, next) => act(() => { mockEncounter = next; hook.rerender(); });

beforeEach(() => {
  mockSendUpdate.mockClear();
  mockIsGm = true;
  mockBladeState = {};
  mockEncounter = { active: false, phase: 'idle', round: 0, currentTurnIndex: 0, order: [] };
});

describe('useBladeCleanup', () => {
  it('returns a drawn dagger to the armor at the end of the wearer\'s turn', () => {
    mockBladeState = { 'char-a': { active: true } };
    const hook = setup();
    advance(hook, inProgress(1, 0)); // PC turn underway (first observed, no fire)
    advance(hook, inProgress(1, 1)); // PC's turn ended → clear PC's blade

    expect(mockSendUpdate).toHaveBeenCalledTimes(1);
    expect(mockSendUpdate).toHaveBeenCalledWith('char-a', 'blade', expect.objectContaining({ active: false }));
  });

  it('does nothing when the wearer has no dagger drawn', () => {
    mockBladeState = { 'char-a': { active: false } };
    const hook = setup();
    advance(hook, inProgress(1, 0));
    advance(hook, inProgress(1, 1));
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('ignores the end of an enemy turn', () => {
    mockBladeState = { 'char-a': { active: true } };
    const hook = setup();
    advance(hook, inProgress(1, 1)); // Goblin (enemy) turn underway
    advance(hook, inProgress(1, 0)); // Goblin's turn ended → outgoing is enemy, no clear
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('is GM-only', () => {
    mockIsGm = false;
    mockBladeState = { 'char-a': { active: true } };
    const hook = setup();
    advance(hook, inProgress(1, 0));
    advance(hook, inProgress(1, 1));
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });
});
