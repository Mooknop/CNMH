// UseAbilityModal — condition-driven flat checks (#262). Drives the actor's
// conditions through the synced-state mock and asserts the stupefied (cast) and
// grabbed (Manipulate) flat-check prompts: confirm is gated until the d20 is
// entered, a failure spends the cost + logs the loss and skips resolution, and a
// pass resolves normally.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockSpendActions = vi.fn();
const mockAddSaveRequest = vi.fn();
let mockConditions = [];

const order = [{ entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Izzy' }];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: vi.fn(), subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'char-a', name: 'Izzy' }], effects: [] }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: { day: 1, month: 1, year: 4725 }, time: { hour: 0, minute: 0, second: 0 } }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, phase: 'in-progress', round: 1, order, log: [] },
    appendLog: mockAppendLog,
    addSaveRequest: mockAddSaveRequest,
    removeSaveRequest: vi.fn(),
  }),
}));
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({
    turnState: { actionsSpent: 0, attacksMade: 0, reactionAvailable: true },
    spendActions: mockSpendActions,
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
// Route the conditions key to a controllable store; everything else echoes init.
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, initial) =>
    key.startsWith('cnmh_conditions_') ? [mockConditions, vi.fn()] : [initial, vi.fn()],
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const character = { id: 'char-a', name: 'Izzy' };
const props = { isOpen: true, onClose: vi.fn(), character, themeColor: '#0af' };

const spell = { name: 'Electric Arc', actions: 'Two Actions', traits: ['Concentrate', 'Manipulate'] };
const manipulateAction = { name: 'Administer a Potion', actions: 'One Action', traits: ['Manipulate'] };
const strike = { name: 'Longsword', actions: 'One Action', traits: ['Attack'] };

beforeEach(() => {
  vi.clearAllMocks();
  mockConditions = [];
});

const lastTexts = () => mockAppendLog.mock.calls.map((c) => c[0].text);

describe('UseAbilityModal — condition flat checks (#262)', () => {
  it('shows no flat-check section for an unconditioned caster', () => {
    render(<UseAbilityModal {...props} verb="Cast" ability={spell} />);
    expect(screen.queryByText('Flat Check')).not.toBeInTheDocument();
    expect(screen.getByLabelText('confirm-cast')).toBeEnabled();
  });

  it('stupefied prompts a DC 5 + value check on a spell cast and gates confirm', () => {
    mockConditions = [{ id: 'stupefied', value: 2 }];
    render(<UseAbilityModal {...props} verb="Cast" ability={spell} />);
    expect(screen.getByText('Flat Check')).toBeInTheDocument();
    expect(screen.getByText('Stupefied 2 — DC 7')).toBeInTheDocument();
    // Confirm stays disabled until the d20 is entered.
    expect(screen.getByLabelText('confirm-cast')).toBeDisabled();
  });

  it('a failed stupefied check spends the action, logs the lost spell, and skips resolution', () => {
    mockConditions = [{ id: 'stupefied', value: 2 }];
    render(<UseAbilityModal {...props} verb="Cast" ability={spell} />);
    fireEvent.change(screen.getByLabelText('Stupefied 2 flat check d20'), { target: { value: '4' } });
    expect(screen.getByText(/Fail — the spell is lost/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    // Two-action cast cost still spent.
    expect(mockSpendActions).toHaveBeenCalledWith(2, 'Cast Electric Arc');
    expect(lastTexts().some((t) => /flat check failed \(DC 7: rolled 4\); the spell is lost/.test(t))).toBe(true);
    // No save request / resolution went out.
    expect(mockAddSaveRequest).not.toHaveBeenCalled();
  });

  it('a passing stupefied check resolves normally (no loss log)', () => {
    mockConditions = [{ id: 'stupefied', value: 2 }];
    render(<UseAbilityModal {...props} verb="Cast" ability={spell} />);
    fireEvent.change(screen.getByLabelText('Stupefied 2 flat check d20'), { target: { value: '10' } });
    expect(screen.getByText('Pass')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(lastTexts().some((t) => /flat check failed/.test(t))).toBe(false);
    expect(mockSpendActions).toHaveBeenCalledWith(2, 'Cast Electric Arc');
  });

  it('grabbed prompts a DC 5 check on a Manipulate action', () => {
    mockConditions = [{ id: 'grabbed' }];
    render(<UseAbilityModal {...props} verb="Use" ability={manipulateAction} />);
    expect(screen.getByText('Grabbed — DC 5')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Grabbed flat check d20'), { target: { value: '3' } });
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockSpendActions).toHaveBeenCalledWith(1, 'Use Administer a Potion');
    expect(lastTexts().some((t) => /Grabbed flat check failed \(DC 5: rolled 3\); the action is disrupted/.test(t))).toBe(true);
  });

  it('does not prompt grabbed for a non-Manipulate action', () => {
    mockConditions = [{ id: 'grabbed' }];
    render(<UseAbilityModal {...props} verb="Use" ability={{ name: 'Step', actions: 'One Action', traits: ['Move'] }} />);
    expect(screen.queryByText('Flat Check')).not.toBeInTheDocument();
  });

  describe('target concealment (#262)', () => {
    it('shows the concealment selector on attacks but not on non-attacks', () => {
      const { unmount } = render(<UseAbilityModal {...props} verb="Use" ability={strike} />);
      expect(screen.getByText('Target Concealment')).toBeInTheDocument();
      unmount();
      render(<UseAbilityModal {...props} verb="Use" ability={manipulateAction} />);
      expect(screen.queryByText('Target Concealment')).not.toBeInTheDocument();
    });

    it('defaults to None — no flat check, confirm enabled', () => {
      render(<UseAbilityModal {...props} verb="Use" ability={strike} />);
      expect(screen.queryByText('Flat Check')).not.toBeInTheDocument();
      expect(screen.getByLabelText('confirm-cast')).toBeEnabled();
    });

    it('picking Hidden injects a DC 11 flat check and gates confirm', () => {
      render(<UseAbilityModal {...props} verb="Use" ability={strike} />);
      fireEvent.click(screen.getByRole('button', { name: 'Hidden (DC 11)' }));
      expect(screen.getByText('Hidden target — DC 11')).toBeInTheDocument();
      expect(screen.getByLabelText('confirm-cast')).toBeDisabled();
    });

    it('a failed concealment check spends the cost, logs the lost attack, and skips resolution', () => {
      render(<UseAbilityModal {...props} verb="Use" ability={strike} />);
      fireEvent.click(screen.getByRole('button', { name: 'Concealed (DC 5)' }));
      fireEvent.change(screen.getByLabelText('Concealed target flat check d20'), { target: { value: '3' } });
      expect(screen.getByText(/Fail — the attack is lost/)).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockSpendActions).toHaveBeenCalledWith(1, 'Use Longsword');
      expect(lastTexts().some((t) => /Concealed target flat check failed \(DC 5: rolled 3\); the attack is lost/.test(t))).toBe(true);
    });

    it('a passing concealment check resolves normally', () => {
      render(<UseAbilityModal {...props} verb="Use" ability={strike} />);
      fireEvent.click(screen.getByRole('button', { name: 'Concealed (DC 5)' }));
      fireEvent.change(screen.getByLabelText('Concealed target flat check d20'), { target: { value: '12' } });
      expect(screen.getByText('Pass')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(lastTexts().some((t) => /flat check failed/.test(t))).toBe(false);
    });
  });
});
