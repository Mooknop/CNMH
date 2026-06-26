import { renderHook, act } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockAppendLog = vi.fn();
let mockEncounter = { active: false, phase: 'idle', round: 0, currentTurnIndex: 0, order: [] };
vi.mock('./useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounter, appendLog: mockAppendLog }),
}));

let mockIsGm = true;
vi.mock('./useGmAuth', () => ({ useGmAuth: () => ({ isGm: mockIsGm }) }));

let mockCharacters = [];
vi.mock('../contexts/ContentContext', () => ({ useContent: () => ({ characters: mockCharacters }) }));

import { useAuraReminders } from './useAuraReminders';

const wispAura = { save: 'fortitude', dc: 23, range: 'adjacent', effect: 'it becomes deafened until it moves away from you' };

const ashka = { id: 'char-a', inventory: [{ name: 'Wisp Chain', state: 'worn', aura: wispAura }] };
const pc = { entryId: 'e-pc', kind: 'pc', charId: 'char-a', name: 'Ashka' };
const goblin = { entryId: 'e-gob', kind: 'enemy', name: 'Goblin' };
const order = [pc, goblin];

const inProgress = (round, turnIdx) => ({
  active: true, phase: 'in-progress', round, currentTurnIndex: turnIdx, order,
});

const setup = () => renderHook(() => useAuraReminders());
const advance = (hook, next) => act(() => { mockEncounter = next; hook.rerender(); });

beforeEach(() => {
  mockAppendLog.mockClear();
  mockIsGm = true;
  mockCharacters = [ashka];
  mockEncounter = { active: false, phase: 'idle', round: 0, currentTurnIndex: 0, order: [] };
});

describe('useAuraReminders', () => {
  it("reminds for a PC's aura at the end of an enemy's turn", () => {
    const hook = setup();
    advance(hook, inProgress(1, 1)); // Goblin's turn (index 1) underway — first observed turn, no fire
    advance(hook, inProgress(1, 0)); // back to PC: Goblin's turn just ended → aura reminder

    expect(mockAppendLog).toHaveBeenCalledTimes(1);
    expect(mockAppendLog.mock.calls[0][0]).toMatchObject({
      type: 'system',
      text: expect.stringContaining('Wisp Chain (Ashka): if Goblin ended its turn adjacent, DC 23 Fortitude'),
    });
  });

  it("does not fire at the end of a PC's own turn (auras target enemies)", () => {
    const hook = setup();
    advance(hook, inProgress(1, 0)); // PC turn underway
    advance(hook, inProgress(1, 1)); // PC's turn ended → outgoing is a PC, no reminder
    expect(mockAppendLog).not.toHaveBeenCalled();
  });

  it('is GM-only', () => {
    mockIsGm = false;
    const hook = setup();
    advance(hook, inProgress(1, 1));
    advance(hook, inProgress(1, 0));
    expect(mockAppendLog).not.toHaveBeenCalled();
  });

  it('emits nothing when no PC projects an aura', () => {
    mockCharacters = [{ id: 'char-a', inventory: [{ name: 'Plain Shirt', state: 'worn' }] }];
    const hook = setup();
    advance(hook, inProgress(1, 1));
    advance(hook, inProgress(1, 0));
    expect(mockAppendLog).not.toHaveBeenCalled();
  });

  it('resets between encounters (no fire on a fresh start)', () => {
    const hook = setup();
    advance(hook, inProgress(1, 1));
    advance(hook, { active: false, phase: 'idle', round: 0, currentTurnIndex: 0, order: [] });
    advance(hook, inProgress(1, 1)); // fresh start — first observed turn, no fire
    expect(mockAppendLog).not.toHaveBeenCalled();
  });
});
