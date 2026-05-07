import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ExplorationList from './ExplorationList';

jest.mock('../shared/CollapsibleCard', () =>
  function DummyCollapsibleCard({ header, children }) {
    return (
      <div data-testid="collapsible-card">
        <div data-testid="card-header">{header}</div>
        <div>{children}</div>
      </div>
    );
  }
);

jest.mock('../shared/TraitTag', () => ({ trait }) => <span>{trait}</span>);

const mockSetter = jest.fn();
jest.mock('../../hooks/useLocalStorage', () => jest.fn(() => [null, mockSetter]));

const makeCharacterModel = (overrides = {}) => ({
  flags: {
    hasSpellcasting: false,
    hasFocusSpells: false,
    ...overrides.flags,
  },
  skillProficiencies: {
    stealth: 0,
    perception: 0,
    survival: 0,
    medicine: 0,
    intimidation: 0,
    diplomacy: 0,
    deception: 0,
    arcana: 0,
    nature: 0,
    occultism: 0,
    religion: 0,
    society: 0,
    ...overrides.skillProficiencies,
  },
});

jest.mock('../../hooks/useCharacter', () => ({ useCharacter: jest.fn() }));

const mockCharacter = { name: 'Tester' };

describe('ExplorationList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { useCharacter } = require('../../hooks/useCharacter');
    useCharacter.mockReturnValue(makeCharacterModel());
    require('../../hooks/useLocalStorage').mockReturnValue([null, mockSetter]);
  });

  it('renders without crashing', () => {
    expect(() => render(<ExplorationList character={mockCharacter} />)).not.toThrow();
  });

  it('returns null when characterModel is null', () => {
    const { useCharacter } = require('../../hooks/useCharacter');
    useCharacter.mockReturnValue(null);
    const { container } = render(<ExplorationList character={mockCharacter} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the Exploration heading', () => {
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.getByRole('heading', { name: 'Exploration' })).toBeInTheDocument();
  });

  it('renders category section dividers', () => {
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.getByText('Scouting')).toBeInTheDocument();
    expect(screen.getByText('Social')).toBeInTheDocument();
    expect(screen.getByText('Knowledge')).toBeInTheDocument();
  });

  it('hides Magic category for non-caster without focus spells', () => {
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.queryByText('Magic')).not.toBeInTheDocument();
  });

  it('shows Magic category when character has spellcasting', () => {
    const { useCharacter } = require('../../hooks/useCharacter');
    useCharacter.mockReturnValue(makeCharacterModel({ flags: { hasSpellcasting: true, hasFocusSpells: false } }));
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.getByText('Magic')).toBeInTheDocument();
  });

  it('shows Magic category when character has focus spells', () => {
    const { useCharacter } = require('../../hooks/useCharacter');
    useCharacter.mockReturnValue(makeCharacterModel({ flags: { hasSpellcasting: false, hasFocusSpells: true } }));
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.getByText('Magic')).toBeInTheDocument();
  });

  it('hides Healing category when Medicine is untrained', () => {
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.queryByText('Healing')).not.toBeInTheDocument();
  });

  it('shows Healing category when Medicine is trained', () => {
    const { useCharacter } = require('../../hooks/useCharacter');
    useCharacter.mockReturnValue(makeCharacterModel({ skillProficiencies: { medicine: 1 } }));
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.getAllByText('Healing').length).toBeGreaterThan(0);
  });

  it('shows highlight badge when relevant skill is Expert or better', () => {
    const { useCharacter } = require('../../hooks/useCharacter');
    useCharacter.mockReturnValue(makeCharacterModel({ skillProficiencies: { stealth: 2 } }));
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.getByText(/✦ Expert/)).toBeInTheDocument();
  });

  it('shows Master badge when skill is rank 3', () => {
    const { useCharacter } = require('../../hooks/useCharacter');
    useCharacter.mockReturnValue(makeCharacterModel({ skillProficiencies: { perception: 3 } }));
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.getAllByText(/✦ Master/).length).toBeGreaterThan(0);
  });

  it('shows no highlight badge when all skills are below Expert', () => {
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.queryByText(/✦/)).not.toBeInTheDocument();
  });

  it('shows active activity banner when an activity is selected', () => {
    require('../../hooks/useLocalStorage').mockReturnValue(['Hustle', mockSetter]);
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.getByText('Active Activity')).toBeInTheDocument();
    expect(screen.getAllByText('Hustle').length).toBeGreaterThan(0);
  });

  it('does not show active banner when no activity is selected', () => {
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.queryByText('Active Activity')).not.toBeInTheDocument();
  });

  it('calls setter when Set Active button is clicked', () => {
    render(<ExplorationList character={mockCharacter} />);
    const buttons = screen.getAllByRole('button', { name: 'Set Active' });
    fireEvent.click(buttons[0]);
    expect(mockSetter).toHaveBeenCalled();
  });

  it('calls setter with null when Clear button is clicked', () => {
    require('../../hooks/useLocalStorage').mockReturnValue(['Hustle', mockSetter]);
    render(<ExplorationList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(mockSetter).toHaveBeenCalledWith(null);
  });

  it('shows Active button label for the selected activity', () => {
    require('../../hooks/useLocalStorage').mockReturnValue(['Hustle', mockSetter]);
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.getByRole('button', { name: /✓ Active/ })).toBeInTheDocument();
  });
});
