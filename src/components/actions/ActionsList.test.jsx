import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ActionsList from './ActionsList';

const STANCE_ACTION = { name: 'Dragon Stance', traits: ['Monk', 'Stance'], actionCount: 1 };
const HUNT_PREY_ACTION = { name: 'Hunt Prey', traits: ['Concentrate', 'Ranger'], actionCount: 1 };

// CharacterActionsList is mocked as an inert testid div, plus buttons that
// fire the onUse callback so we can exercise ActionsList.handleUse.
vi.mock('./CharacterActionsList', () => ({
  default: ({ onUse }) => (
    <div data-testid="character-actions-list">
      <button onClick={() => onUse?.(STANCE_ACTION, 1)}>use-stance</button>
      <button onClick={() => onUse?.(HUNT_PREY_ACTION, 1)}>use-hunt-prey</button>
    </div>
  ),
}));
vi.mock('./ReactionsList', () => ({ default: () => <div data-testid="reactions-list" /> }));
vi.mock('./FreeActionsList', () => ({ default: () => <div data-testid="free-actions-list" /> }));
vi.mock('../spells/MagicModal', () => ({ default: () => null }));
vi.mock('../encounter/UseAbilityModal', () => ({ default: () => <div data-testid="use-ability-modal" /> }));
vi.mock('../encounter/HuntPreyModal', () => ({ default: () => <div data-testid="hunt-prey-modal" /> }));

vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: () => ({
    flags: {
      hasSpellcasting: false, hasFocusSpells: false, hasInnateSpells: false,
      hasScrolls: false, hasWands: false, hasStaff: false, hasEldPowers: false, hasHarrowing: false,
    },
  }),
}));

const mockAppendLog = vi.fn();
const mockEncounterState = { active: false, phase: 'idle', order: [], log: [], round: 0, currentTurnIndex: 0 };
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounterState, appendLog: mockAppendLog }),
}));

const mockSpendActions = vi.fn();
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({
    turnState: { actionsSpent: 0, reactionAvailable: false, reactionSpent: false, hasStartedFirstTurn: false, actionsLog: [] },
    spendActions: mockSpendActions,
    spendReaction: vi.fn(),
  }),
}));

const mockEnterStance = vi.fn();
vi.mock('../../hooks/useStance', () => ({
  useStance: () => ({ active: false, stanceName: null, enter: mockEnterStance, leave: vi.fn() }),
}));

const mockCharacter = { id: '1', name: 'Test', level: 1, actions: [], reactions: [], freeActions: [] };

afterEach(() => {
  vi.clearAllMocks();
  mockEncounterState.active = false;
  mockEncounterState.phase = 'idle';
});

describe('ActionsList', () => {
  it('renders without crashing', () => {
    expect(() => render(<ActionsList character={mockCharacter} />)).not.toThrow();
  });

  it('renders the Encounter heading', () => {
    render(<ActionsList character={mockCharacter} />);
    expect(screen.getByRole('heading', { name: 'Encounter' })).toBeInTheDocument();
  });

  it('shows Actions section by default', () => {
    render(<ActionsList character={mockCharacter} />);
    expect(screen.getByTestId('character-actions-list')).toBeInTheDocument();
  });

  it('does not show other sections by default', () => {
    render(<ActionsList character={mockCharacter} />);
    expect(screen.queryByTestId('reactions-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('free-actions-list')).not.toBeInTheDocument();
  });

  it('renders Actions, Reactions, and Free Actions tab buttons', () => {
    render(<ActionsList character={mockCharacter} />);
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Free Actions' })).toBeInTheDocument();
  });

  it('does not render a Strikes tab button', () => {
    render(<ActionsList character={mockCharacter} />);
    expect(screen.queryByRole('button', { name: 'Strikes' })).not.toBeInTheDocument();
  });

  it('switches to Reactions section on click', () => {
    render(<ActionsList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reactions' }));
    expect(screen.getByTestId('reactions-list')).toBeInTheDocument();
    expect(screen.queryByTestId('character-actions-list')).not.toBeInTheDocument();
  });

  it('switches to Free Actions section on click', () => {
    render(<ActionsList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Free Actions' }));
    expect(screen.getByTestId('free-actions-list')).toBeInTheDocument();
  });

  it('switches back to Actions after visiting another tab', () => {
    render(<ActionsList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reactions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByTestId('character-actions-list')).toBeInTheDocument();
    expect(screen.queryByTestId('reactions-list')).not.toBeInTheDocument();
  });

  // ── Stance entry (#224) ──────────────────────────────────────────────────
  it('using a Stance action enters the stance without opening the ability modal', () => {
    render(<ActionsList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'use-stance' }));
    expect(mockEnterStance).toHaveBeenCalledWith('Dragon Stance');
    expect(screen.queryByTestId('use-ability-modal')).not.toBeInTheDocument();
  });

  it('spends an action for a Stance entered during an encounter', () => {
    mockEncounterState.active = true;
    mockEncounterState.phase = 'in-progress';
    render(<ActionsList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'use-stance' }));
    expect(mockEnterStance).toHaveBeenCalledWith('Dragon Stance');
    expect(mockSpendActions).toHaveBeenCalledWith(1, 'Dragon Stance');
  });

  it('does not spend an action for a Stance entered out of encounter', () => {
    render(<ActionsList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'use-stance' }));
    expect(mockEnterStance).toHaveBeenCalledWith('Dragon Stance');
    expect(mockSpendActions).not.toHaveBeenCalled();
  });

  // ── Hunt Prey (#223) ─────────────────────────────────────────────────────
  it('using the Hunt Prey action opens the Hunt Prey modal (not the ability modal)', () => {
    render(<ActionsList character={mockCharacter} />);
    expect(screen.queryByTestId('hunt-prey-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'use-hunt-prey' }));
    expect(screen.getByTestId('hunt-prey-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('use-ability-modal')).not.toBeInTheDocument();
  });
});
