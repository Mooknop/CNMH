import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ExplorationList from './ExplorationList';
import { useCharacter } from '../../hooks/useCharacter';
import { useSyncedState } from '../../hooks/useSyncedState';

// ExplorationList now renders ActionRows + opens ActionDetailModal on tap.
// Mock both to isolate ExplorationList behaviour.

vi.mock('../shared/ActionRow', () => ({
  default: function DummyActionRow({ name, rightLabel, active, onClick }) {
    return (
      <button data-testid="action-row" data-active={active} onClick={onClick}>
        <span data-testid="row-name">{name}</span>
        {rightLabel && <span data-testid="row-chip">{rightLabel}</span>}
      </button>
    );
  }
}));

vi.mock('../encounter/ActionDetailModal', () => ({
  default: function DummyActionDetailModal({ item, type, isOpen, onClose, isActive, onSetActive }) {
    if (!item || !isOpen) return null;
    return (
      <div data-testid="activity-detail-modal">
        <span>{item.name}</span>
        {type === 'activity' && onSetActive && (
          <button
            onClick={() => { onSetActive(); onClose(); }}
          >
            {isActive ? '✓ Active — Clear' : 'Set as active'}
          </button>
        )}
        <button onClick={onClose}>Close</button>
      </div>
    );
  }
}));

vi.mock('../encounter/TreatWoundsModal', () => ({
  default: function DummyTreatWoundsModal({ isOpen, onClose }) {
    if (!isOpen) return null;
    return <div data-testid="treat-wounds-modal"><button onClick={onClose}>Close</button></div>;
  }
}));

vi.mock('./RollActivityModal', () => ({
  default: function DummyRollActivityModal({ isOpen, onClose, activity }) {
    if (!isOpen) return null;
    return (
      <div data-testid="roll-activity-modal">
        <span>{activity?.name}</span>
        <button onClick={onClose}>Close</button>
      </div>
    );
  }
}));

vi.mock('./SkillCheckModal', () => ({
  default: function DummySkillCheckModal({ isOpen, onClose, action }) {
    if (!isOpen) return null;
    return (
      <div data-testid="skill-check-modal">
        <span>{action?.name}</span>
        <button onClick={onClose}>Close</button>
      </div>
    );
  }
}));

vi.mock('../shared/TraitTag', () => ({ default: ({ trait }) => <span>{trait}</span> }));

vi.mock('../../hooks/useEffects', () => ({ useEffects: vi.fn(() => ({ effects: [] })) }));
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn(() => ({ effects: [] })) }));

const mockSetter = vi.fn();
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: vi.fn(() => [null, mockSetter]),
}));

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

vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));

const mockCharacter = { name: 'Tester' };

describe('ExplorationList', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useCharacter.mockReturnValue(makeCharacterModel());
    useSyncedState.mockReturnValue([null, mockSetter]);
  });

  it('renders without crashing', () => {
    expect(() => render(<ExplorationList character={mockCharacter} />)).not.toThrow();
  });

  it('returns null when characterModel is null', () => {

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

    useCharacter.mockReturnValue(makeCharacterModel({ flags: { hasSpellcasting: true, hasFocusSpells: false } }));
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.getByText('Magic')).toBeInTheDocument();
  });

  it('shows Magic category when character has focus spells', () => {

    useCharacter.mockReturnValue(makeCharacterModel({ flags: { hasSpellcasting: false, hasFocusSpells: true } }));
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.getByText('Magic')).toBeInTheDocument();
  });

  it('surfaces Track under a Skill Actions section and opens the resolver (#407)', () => {
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.getByText('Skill Actions')).toBeInTheDocument();
    const trackRow = screen.getByText('Track').closest('[data-testid="action-row"]');
    expect(trackRow).toBeTruthy();

    fireEvent.click(trackRow);
    expect(screen.getByTestId('skill-check-modal')).toBeInTheDocument();
  });

  it('hides Healing category when Medicine is untrained', () => {
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.queryByText('Healing')).not.toBeInTheDocument();
  });

  it('shows Healing category when Medicine is trained', () => {

    useCharacter.mockReturnValue(makeCharacterModel({ skillProficiencies: { medicine: 1 } }));
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.getAllByText('Healing').length).toBeGreaterThan(0);
  });

  it('shows highlight badge as row chip when relevant skill is Expert or better', () => {

    useCharacter.mockReturnValue(makeCharacterModel({ skillProficiencies: { stealth: 2 } }));
    render(<ExplorationList character={mockCharacter} />);
    const chips = screen.getAllByTestId('row-chip');
    expect(chips.some((c) => c.textContent.includes('✦ Expert'))).toBe(true);
  });

  it('shows Master badge in row chip when skill is rank 3', () => {

    useCharacter.mockReturnValue(makeCharacterModel({ skillProficiencies: { perception: 3 } }));
    render(<ExplorationList character={mockCharacter} />);
    const chips = screen.getAllByTestId('row-chip');
    expect(chips.some((c) => c.textContent.includes('✦ Master'))).toBe(true);
  });

  it('shows no highlight badge when all skills are below Expert', () => {
    render(<ExplorationList character={mockCharacter} />);
    const chips = screen.queryAllByTestId('row-chip');
    expect(chips.every((c) => !c.textContent.includes('✦'))).toBe(true);
  });

  it('shows active activity banner when an activity is selected', () => {
    useSyncedState.mockReturnValue(['Hustle', mockSetter]);
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.getByText('Active Activity')).toBeInTheDocument();
    expect(screen.getAllByText('Hustle').length).toBeGreaterThan(0);
  });

  it('does not show active banner when no activity is selected', () => {
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.queryByText('Active Activity')).not.toBeInTheDocument();
  });

  it('shows the travel pace and mechanics note on the active banner', () => {
    useSyncedState.mockReturnValue(['Hustle', mockSetter]);
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.getByText('×2 Speed')).toBeInTheDocument();
    expect(screen.getByText(/Fatigued after Constitution modifier/)).toBeInTheDocument();
  });

  it('shows Roll Check button on banner when active activity has a roll', () => {
    useSyncedState.mockReturnValue(['Make an Impression', mockSetter]);
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.getByRole('button', { name: 'Roll Check' })).toBeInTheDocument();
  });

  it('opens the roll modal when banner Roll Check is clicked', () => {
    useSyncedState.mockReturnValue(['Make an Impression', mockSetter]);
    render(<ExplorationList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Roll Check' }));
    expect(screen.getByTestId('roll-activity-modal')).toBeInTheDocument();
  });

  it('does not show Roll Check button on banner for activities without a roll', () => {
    useSyncedState.mockReturnValue(['Hustle', mockSetter]);
    render(<ExplorationList character={mockCharacter} />);
    expect(screen.queryByRole('button', { name: 'Roll Check' })).not.toBeInTheDocument();
  });

  it('opens activity detail modal when a row is clicked', () => {
    render(<ExplorationList character={mockCharacter} />);
    const rows = screen.getAllByTestId('action-row');
    fireEvent.click(rows[0]);
    expect(screen.getByTestId('activity-detail-modal')).toBeInTheDocument();
  });

  it('calls setter when Set as active button is clicked in modal', () => {
    render(<ExplorationList character={mockCharacter} />);
    const rows = screen.getAllByTestId('action-row');
    // Find a non-Treat-Wounds row (Treat Wounds opens TreatWoundsModal instead)
    const nonTWRow = rows.find((r) => !r.textContent.includes('Treat Wounds'));
    fireEvent.click(nonTWRow);
    fireEvent.click(screen.getByRole('button', { name: 'Set as active' }));
    expect(mockSetter).toHaveBeenCalled();
  });

  it('calls setter with null when Clear button is clicked', () => {
    useSyncedState.mockReturnValue(['Hustle', mockSetter]);
    render(<ExplorationList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(mockSetter).toHaveBeenCalledWith(null);
  });

  it('shows Active — Clear label for the selected activity in modal', () => {
    useSyncedState.mockReturnValue(['Hustle', mockSetter]);
    render(<ExplorationList character={mockCharacter} />);
    // Find the Hustle row (it will be marked active)
    const hustleRow = screen.getAllByTestId('action-row').find(
      (r) => r.querySelector('[data-testid="row-name"]')?.textContent === 'Hustle'
    );
    expect(hustleRow).toBeTruthy();
    fireEvent.click(hustleRow);
    expect(screen.getByRole('button', { name: /✓ Active — Clear/ })).toBeInTheDocument();
  });

  it('opens TreatWoundsModal directly when Treat Wounds row is clicked', () => {

    useCharacter.mockReturnValue(makeCharacterModel({ skillProficiencies: { medicine: 1 } }));
    render(<ExplorationList character={mockCharacter} />);
    const twRow = screen.getAllByTestId('action-row').find(
      (r) => r.querySelector('[data-testid="row-name"]')?.textContent === 'Treat Wounds'
    );
    expect(twRow).toBeTruthy();
    fireEvent.click(twRow);
    expect(screen.getByTestId('treat-wounds-modal')).toBeInTheDocument();
  });
});
