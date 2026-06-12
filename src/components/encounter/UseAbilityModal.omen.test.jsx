// UseAbilityModal — harrow omen gating (#227). Routes the cnmh_omen_* key to
// a controllable store so we can drive the active suit and assert the gate
// section, override checkbox, the omen line, and clearsOmen on confirm.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockSetOmen = vi.fn();
let mockOmenState = { suit: null, ts: 0 };

const order = [{ entryId: 'e-caster', kind: 'pc', charId: 'JadeInferno', name: 'Jade' }];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: vi.fn(), subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'JadeInferno', name: 'Jade' }] }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: { day: 5, month: 2, year: 4725 }, time: { hour: 8, minute: 0, second: 0 } }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, phase: 'in-progress', round: 1, order, log: [] },
    appendLog: mockAppendLog,
    addSaveRequest: vi.fn(),
    removeSaveRequest: vi.fn(),
  }),
}));
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({
    turnState: { actionsSpent: 0, attacksMade: 0, reactionAvailable: true },
    spendActions: vi.fn(),
    spendReaction: vi.fn(),
    recordAttack: vi.fn(),
  }),
}));
vi.mock('../../hooks/useEffects', () => ({
  useEffects: () => ({ effects: [], removeEffect: vi.fn() }),
}));
vi.mock('../../hooks/useTargeting', () => ({
  useTargeting: () => ({ targets: [], selectable: [], isTargeted: () => false, toggleTarget: vi.fn() }),
}));
vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({
    optionsFor: () => [],
    spend: () => ({ label: '' }),
    slots: { remainingFor: () => 0, spend: vi.fn() },
  }),
}));
vi.mock('../../hooks/useShield', () => ({
  useShield: () => ({ raised: false }),
}));
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (c) => (c ? { inventory: [] } : null),
}));
// Route the omen key to a controllable store; everything else echoes its initial.
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, initial) =>
    String(key).startsWith('cnmh_omen_') ? [mockOmenState, mockSetOmen] : [initial, vi.fn()],
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const avoidDireFate = {
  name: 'Avoid Dire Fate',
  actions: 'Reaction',
  traits: ['Fortune'],
  requiresOmen: true,
  clearsOmen: true,
};

const character = { id: 'JadeInferno', name: 'Jade' };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#a0f' };

beforeEach(() => {
  vi.clearAllMocks();
  mockOmenState = { suit: null, ts: 0 };
});

describe('UseAbilityModal — harrow omen gating', () => {
  it('blocks an omen-bound ability while no omen is active', () => {
    render(<UseAbilityModal {...props} ability={avoidDireFate} />);
    expect(screen.getByText('Harrow Omen')).toBeInTheDocument();
    expect(screen.getByText(/draw an omen from your deck first/)).toBeInTheDocument();
    expect(screen.getByText('Active harrow omen: none')).toBeInTheDocument();
    expect(screen.getByLabelText('confirm-cast')).toBeDisabled();
  });

  it('override re-enables confirm and tags the log line', () => {
    render(<UseAbilityModal {...props} ability={avoidDireFate} />);
    fireEvent.click(screen.getByLabelText(/Override \(GM ruling\) — use anyway/));
    const confirm = screen.getByLabelText('confirm-cast');
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) => t.includes('(override — no active omen)'))).toBe(true);
  });

  it('with an active omen: no gate, suit shown, confirm spends the omen and logs', () => {
    mockOmenState = { suit: 'Keys', ts: 1 };
    render(<UseAbilityModal {...props} ability={avoidDireFate} />);
    expect(screen.queryByText('Harrow Omen')).not.toBeInTheDocument();
    expect(screen.getByText('Active harrow omen: Keys — spent on use')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockSetOmen).toHaveBeenCalledWith(expect.objectContaining({ suit: null }));
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) =>
      t.includes("Jade's harrow omen (Keys) is spent (Avoid Dire Fate)")
    )).toBe(true);
  });

  it('clearsOmen without requiresOmen never gates and skips the spend when no omen', () => {
    const ability = { name: 'Harrow Cast', actions: 'One Action', clearsOmen: true };
    render(<UseAbilityModal {...props} ability={ability} />);
    expect(screen.queryByText('Harrow Omen')).not.toBeInTheDocument();
    expect(screen.getByText('Active harrow omen: none')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockSetOmen).not.toHaveBeenCalled();
  });

  it('abilities without omen tags render no omen line', () => {
    render(<UseAbilityModal {...props} ability={{ name: 'Sneak', actions: 'One Action' }} />);
    expect(screen.queryByText(/Active harrow omen/)).not.toBeInTheDocument();
  });
});
