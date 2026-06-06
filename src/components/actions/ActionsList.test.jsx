import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ActionsList from './ActionsList';

vi.mock('./CharacterActionsList', () => ({ default: () => <div data-testid="character-actions-list" /> }));
vi.mock('./ReactionsList', () => ({ default: () => <div data-testid="reactions-list" /> }));
vi.mock('./FreeActionsList', () => ({ default: () => <div data-testid="free-actions-list" /> }));
vi.mock('../spells/MagicModal', () => ({ default: () => null }));

vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: () => ({
    flags: {
      hasSpellcasting: false, hasFocusSpells: false, hasInnateSpells: false,
      hasScrolls: false, hasWands: false, hasStaff: false, hasEldPowers: false, hasHarrowing: false,
    },
  }),
}));

vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: false, phase: 'idle', order: [], log: [], round: 0, currentTurnIndex: 0 },
    appendLog: vi.fn(),
  }),
}));

vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({
    turnState: { actionsSpent: 0, reactionAvailable: false, reactionSpent: false, hasStartedFirstTurn: false, actionsLog: [] },
    spendActions: vi.fn(),
    spendReaction: vi.fn(),
  }),
}));

const mockCharacter = { id: '1', name: 'Test', level: 1, actions: [], reactions: [], freeActions: [] };

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
});
