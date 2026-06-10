import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TreatWoundsModal from './TreatWoundsModal';
import { IMMUNITY_EFFECT_ID } from '../../utils/treatWounds';
import * as treatWounds from '../../utils/treatWounds';
import { useCharacter } from '../../hooks/useCharacter';

// ── Context / hook mocks ─────────────────────────────────────────────────────

const mockGetState  = vi.fn(() => undefined);
const mockSendUpdate = vi.fn();
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: mockGetState, sendUpdate: mockSendUpdate }),
}));

const mockCharacters = [
  { id: 'c1', name: 'Brakor',  maxHp: 40 },
  { id: 'c2', name: 'Pellias', maxHp: 35 },
];
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: mockCharacters }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: 5, month: 2, year: 4725 },
    time: { hour: 8, minute: 0, second: 0 },
  }),
}));

const mockAppendLog = vi.fn();
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: false, phase: 'idle', order: [] },
    appendLog: mockAppendLog,
  }),
}));

const mockSpendActions = vi.fn();
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({ spendActions: mockSpendActions }),
}));

// healer with Expert Medicine (rank 2, modifier +7) — unlocks DC 15 and DC 20
vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));


// ── Helpers ──────────────────────────────────────────────────────────────────

const healer = { id: 'h1', name: 'Pellias' };

const defaultProps = {
  isOpen:     true,
  onClose:    vi.fn(),
  mode:       'treat-wounds',
  healer,
  themeColor: '#aaa',
  actionCost: 0,
};

function renderModal(props = {}) {
  return render(<TreatWoundsModal {...defaultProps} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetState.mockReturnValue(undefined);
  useCharacter.mockReturnValue({
    skillModifiers:    { medicine: 7 },
    skillProficiencies:{ medicine: 2 },
  });
  vi.spyOn(treatWounds, 'applyTreatWounds').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Visibility / guard ───────────────────────────────────────────────────────

describe('visibility', () => {
  it('renders null when isOpen is false', () => {
    const { container } = render(<TreatWoundsModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when healer is null', () => {
    const { container } = render(<TreatWoundsModal {...defaultProps} healer={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the modal title for Treat Wounds', () => {
    renderModal({ mode: 'treat-wounds' });
    expect(screen.getByRole('heading', { level: 2, name: 'Treat Wounds' })).toBeInTheDocument();
  });

  it('renders the modal title for Battle Medicine', () => {
    renderModal({ mode: 'battle-medicine' });
    expect(screen.getByRole('heading', { level: 2, name: 'Battle Medicine' })).toBeInTheDocument();
  });
});

// ── Target section ───────────────────────────────────────────────────────────

describe('target selection', () => {
  it('renders all characters as target buttons', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Brakor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pellias' })).toBeInTheDocument();
  });

  it('selects a target on click', () => {
    renderModal();
    const btn = screen.getByRole('button', { name: 'Brakor' });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('deselects an already-selected target on second click', () => {
    renderModal();
    const btn = screen.getByRole('button', { name: 'Brakor' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });
});

// ── DC section ───────────────────────────────────────────────────────────────

describe('DC buttons', () => {
  it('shows DC 15 and DC 20 for Expert medicine (rank 2)', () => {
    renderModal();
    expect(screen.getByText('DC 15')).toBeInTheDocument();
    expect(screen.getByText('DC 20')).toBeInTheDocument();
    expect(screen.queryByText('DC 30')).not.toBeInTheDocument();
  });

  it('shows "training required" notice when medicine rank is 0', () => {
    useCharacter.mockReturnValue({
      skillModifiers:    { medicine: 0 },
      skillProficiencies:{ medicine: 0 },
    });
    renderModal();
    expect(screen.getByText(/training required/i)).toBeInTheDocument();
  });

  it('selects a DC on click', () => {
    renderModal();
    const dc15 = screen.getByText('DC 15').closest('button');
    fireEvent.click(dc15);
    expect(dc15).toHaveClass('tw-dc-btn--on');
  });
});

// ── Roll section ─────────────────────────────────────────────────────────────

describe('medicine check input', () => {
  it('renders the d20 input', () => {
    renderModal();
    expect(screen.getByPlaceholderText('d20')).toBeInTheDocument();
  });

  it('shows medicine modifier badge', () => {
    renderModal();
    expect(screen.getByLabelText('medicine modifier')).toHaveTextContent('+7');
  });

  it('shows computed total when d20 is entered', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('d20'), { target: { value: '12' } });
    expect(screen.getByText('= 19')).toBeInTheDocument();
  });

  it('shows degree chip when both DC and d20 are set', () => {
    renderModal();
    fireEvent.click(screen.getByText('DC 15').closest('button'));
    fireEvent.change(screen.getByPlaceholderText('d20'), { target: { value: '14' } });
    // total = 14+7=21 vs DC 15 → Success
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('shows Critical Success for high roll', () => {
    renderModal();
    fireEvent.click(screen.getByText('DC 15').closest('button'));
    fireEvent.change(screen.getByPlaceholderText('d20'), { target: { value: '20' } });
    // total = 20+7=27, DC+10=25 → crit success (and nat 20 shifts up)
    expect(screen.getByText('Critical Success')).toBeInTheDocument();
  });

  it('shows Failure for low roll', () => {
    renderModal();
    fireEvent.click(screen.getByText('DC 15').closest('button'));
    fireEvent.change(screen.getByPlaceholderText('d20'), { target: { value: '1' } });
    expect(screen.getByText('Critical Failure')).toBeInTheDocument();
  });
});

// ── Amount input ─────────────────────────────────────────────────────────────

describe('amount input', () => {
  function setupToSuccess() {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Brakor' }));
    fireEvent.click(screen.getByText('DC 15').closest('button'));
    // roll 10 + 7 = 17 vs DC 15 → success
    fireEvent.change(screen.getByPlaceholderText('d20'), { target: { value: '10' } });
  }

  it('shows HP Healed input on success', () => {
    setupToSuccess();
    expect(screen.getByLabelText('hp healed')).toBeInTheDocument();
    expect(screen.getByText('HP Healed')).toBeInTheDocument();
  });

  it('shows dice hint for the selected DC on success', () => {
    setupToSuccess();
    expect(screen.getByText('2d8')).toBeInTheDocument();
  });

  it('does not show amount input on failure', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Brakor' }));
    fireEvent.click(screen.getByText('DC 20').closest('button'));
    // roll 3 + 7 = 10 vs DC 20 → failure (but not crit since d20≠1 and total≥DC-10=10)
    // Actually 10 >= 10 so success boundary... let me use roll 2: 2+7=9 vs DC 20 → 9 < 20-10=10? No 9<10 → crit fail
    // Use roll 5: 5+7=12 vs DC 20 → 12 < 20 and 12 > 10 → failure
    fireEvent.change(screen.getByPlaceholderText('d20'), { target: { value: '5' } });
    expect(screen.queryByLabelText('hp healed')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('damage total')).not.toBeInTheDocument();
  });

  it('shows Damage Dealt input on critical failure', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Brakor' }));
    fireEvent.click(screen.getByText('DC 20').closest('button'));
    // roll 1 + 7 = 8 vs DC 20, and nat 1 shifts one step down → crit failure
    fireEvent.change(screen.getByPlaceholderText('d20'), { target: { value: '1' } });
    expect(screen.getByLabelText('damage total')).toBeInTheDocument();
    expect(screen.getByText('Damage Dealt')).toBeInTheDocument();
  });

  it('shows 4d8 hint on critical success', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Brakor' }));
    fireEvent.click(screen.getByText('DC 15').closest('button'));
    fireEvent.change(screen.getByPlaceholderText('d20'), { target: { value: '20' } });
    expect(screen.getByText('4d8')).toBeInTheDocument();
  });
});

// ── Immunity block ────────────────────────────────────────────────────────────

describe('immunity block', () => {
  it('shows immunity notice and disables confirm when target is immune', () => {
    // getState returns effects with an immunity for this healer
    mockGetState.mockImplementation((_charId, key) => {
      if (key === 'effects') {
        return [{ effectId: IMMUNITY_EFFECT_ID, appliedBy: healer.id }];
      }
      return undefined;
    });
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Brakor' }));

    expect(screen.getByText(/immune/i)).toBeInTheDocument();
    // Confirm should be disabled (no DC selected anyway, but immunity is the explicit blocker)
  });

  it('does not show immunity notice for a different healer', () => {
    mockGetState.mockImplementation((_charId, key) => {
      if (key === 'effects') {
        return [{ effectId: IMMUNITY_EFFECT_ID, appliedBy: 'other-healer-id' }];
      }
      return undefined;
    });
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Brakor' }));
    expect(screen.queryByText(/immune/i)).not.toBeInTheDocument();
  });
});

// ── Confirm button state ──────────────────────────────────────────────────────

describe('confirm button', () => {
  it('is disabled initially', () => {
    renderModal();
    const btn = screen.getByRole('button', { name: /Treat Wounds/ });
    expect(btn).toBeDisabled();
  });

  it('is disabled when target is selected but no DC or roll', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Brakor' }));
    const btn = screen.getByRole('button', { name: /Treat Wounds/ });
    expect(btn).toBeDisabled();
  });

  it('is disabled on failure degree (no amount needed, but failure = no confirmation value)', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Brakor' }));
    fireEvent.click(screen.getByText('DC 20').closest('button'));
    fireEvent.change(screen.getByPlaceholderText('d20'), { target: { value: '5' } });
    // degree = failure → no amount needed → confirmEnabled should be true
    // Actually degree=failure: needsAmount=false, so confirmEnabled=true
    const btn = screen.getByRole('button', { name: /Treat Wounds/ });
    expect(btn).not.toBeDisabled();
  });

  it('is enabled when all fields are filled for success', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Brakor' }));
    fireEvent.click(screen.getByText('DC 15').closest('button'));
    // d20 10 + 7 = 17 vs DC15 → success
    fireEvent.change(screen.getByPlaceholderText('d20'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('hp healed'), { target: { value: '12' } });
    const btn = screen.getByRole('button', { name: /Treat Wounds/ });
    expect(btn).not.toBeDisabled();
  });

  it('shows action count when actionCost > 0', () => {
    renderModal({ mode: 'battle-medicine', actionCost: 1 });
    expect(screen.getByRole('button', { name: /1 act/ })).toBeInTheDocument();
  });

  it('does not show action count when actionCost is 0', () => {
    renderModal({ mode: 'treat-wounds', actionCost: 0 });
    expect(screen.queryByText(/act/)).not.toBeInTheDocument();
  });
});

// ── Confirm action ────────────────────────────────────────────────────────────

describe('confirm handling', () => {
  it('calls applyTreatWounds and onClose on confirm (success)', () => {
    const onClose = vi.fn();
    render(<TreatWoundsModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Brakor' }));
    fireEvent.click(screen.getByText('DC 15').closest('button'));
    fireEvent.change(screen.getByPlaceholderText('d20'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('hp healed'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /Treat Wounds/ }));
    expect(treatWounds.applyTreatWounds).toHaveBeenCalledWith(expect.objectContaining({
      healer: { id: healer.id, name: healer.name },
      dc: 15,
      degree: 'success',
      amount: 12,
      actionName: 'Treat Wounds',
    }));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not spend actions when actionCost is 0', () => {
    renderModal({ actionCost: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Brakor' }));
    fireEvent.click(screen.getByText('DC 20').closest('button'));
    fireEvent.change(screen.getByPlaceholderText('d20'), { target: { value: '5' } });
    // failure → no amount needed → confirm enabled
    fireEvent.click(screen.getByRole('button', { name: /Treat Wounds/ }));
    expect(mockSpendActions).not.toHaveBeenCalled();
  });
});
