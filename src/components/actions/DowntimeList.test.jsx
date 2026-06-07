import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DowntimeList from './DowntimeList';
import { useCharacter } from '../../hooks/useCharacter';
import { useSyncedState } from '../../hooks/useSyncedState';

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
          <button onClick={() => { onSetActive(); onClose(); }}>
            {isActive ? '✓ Active — Clear' : 'Set as active'}
          </button>
        )}
        <button onClick={onClose}>Close</button>
      </div>
    );
  }
}));

const mockSetter = vi.fn();
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: vi.fn(() => [null, mockSetter]),
}));

vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));

const makeCharacterModel = (overrides = {}) => ({
  flags: { ...overrides.flags },
  skillProficiencies: { crafting: 0, ...overrides.skillProficiencies },
});

const mockCharacter = { id: 'char-1', name: 'Tester' };

// DowntimeList reads two synced keys in order: the global block, then the
// per-PC downtime state. This helper stamps both to the same active period so
// the period-scoped `selected` read sees live data.
const PERIOD = 'P1';
const activeBlock = { days: 7, active: true, startedAt: PERIOD };
// Key-based so it survives re-renders (a row click re-renders the list).
const withState = (downtime = null, block = activeBlock) =>
  useSyncedState.mockImplementation((key) =>
    key === 'cnmh_downtimeblock_global' ? [block, mockSetter] : [downtime, mockSetter]
  );

describe('DowntimeList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCharacter.mockReturnValue(makeCharacterModel());
    useSyncedState.mockReturnValue([null, mockSetter]);
  });

  it('returns null when characterModel is null', () => {
    useCharacter.mockReturnValue(null);
    const { container } = render(<DowntimeList character={mockCharacter} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the Activities heading', () => {
    render(<DowntimeList character={mockCharacter} />);
    expect(screen.getByRole('heading', { name: 'Activities' })).toBeInTheDocument();
  });

  it('renders the always-available activities', () => {
    render(<DowntimeList character={mockCharacter} />);
    const names = screen.getAllByTestId('row-name').map((n) => n.textContent);
    expect(names).toEqual(expect.arrayContaining(['Earn Income', 'Retrain', 'Research']));
  });

  it('hides Crafting when the character is untrained in Crafting', () => {
    render(<DowntimeList character={mockCharacter} />);
    const names = screen.getAllByTestId('row-name').map((n) => n.textContent);
    expect(names).not.toContain('Crafting');
  });

  it('shows Crafting when the character is trained in Crafting', () => {
    useCharacter.mockReturnValue(makeCharacterModel({ skillProficiencies: { crafting: 1 } }));
    render(<DowntimeList character={mockCharacter} />);
    const names = screen.getAllByTestId('row-name').map((n) => n.textContent);
    expect(names).toContain('Crafting');
  });

  it('shows a type label as the row chip when no highlight applies', () => {
    render(<DowntimeList character={mockCharacter} />);
    const chips = screen.getAllByTestId('row-chip').map((c) => c.textContent);
    expect(chips).toContain('Full day');     // Earn Income (instant)
    expect(chips).toContain('Accumulates');  // Retrain / Research (accumulate)
  });

  it('shows an Expert highlight chip when crafting is Expert or better', () => {
    useCharacter.mockReturnValue(makeCharacterModel({ skillProficiencies: { crafting: 2 } }));
    render(<DowntimeList character={mockCharacter} />);
    const chips = screen.getAllByTestId('row-chip').map((c) => c.textContent);
    expect(chips.some((c) => c.includes('✦ Expert'))).toBe(true);
  });

  it('opens the activity detail modal when a row is clicked', () => {
    render(<DowntimeList character={mockCharacter} />);
    fireEvent.click(screen.getAllByTestId('action-row')[0]);
    expect(screen.getByTestId('activity-detail-modal')).toBeInTheDocument();
  });

  it('toggles the activity into selected when Set as active is clicked', () => {
    withState(null);
    render(<DowntimeList character={mockCharacter} />);
    fireEvent.click(screen.getAllByTestId('action-row')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Set as active' }));
    expect(mockSetter).toHaveBeenCalled();
    // The updater should add the tapped activity name to selected, stamped to
    // the active period.
    const updater = mockSetter.mock.calls[0][0];
    expect(updater(null)).toEqual({ periodStartedAt: PERIOD, selected: ['Earn Income'], ledger: [] });
  });

  it('removes an already-selected activity when toggled again', () => {
    withState({ periodStartedAt: PERIOD, selected: ['Earn Income'] });
    render(<DowntimeList character={mockCharacter} />);
    fireEvent.click(screen.getAllByTestId('action-row')[0]);
    fireEvent.click(screen.getByRole('button', { name: '✓ Active — Clear' }));
    const updater = mockSetter.mock.calls[0][0];
    expect(updater({ periodStartedAt: PERIOD, selected: ['Earn Income'] }))
      .toEqual({ periodStartedAt: PERIOD, selected: [], ledger: [] });
  });

  it('renders the selected-activities banner with chips', () => {
    withState({ periodStartedAt: PERIOD, selected: ['Research', 'Retrain'] });
    render(<DowntimeList character={mockCharacter} />);
    expect(screen.getByText('Pursuing this downtime')).toBeInTheDocument();
    const chips = screen.getAllByText(/Research|Retrain/);
    expect(chips.length).toBeGreaterThanOrEqual(2);
  });

  it('ignores selected from a prior period (stale stamp reads as empty)', () => {
    withState({ periodStartedAt: 'OLD', selected: ['Research', 'Retrain'] });
    render(<DowntimeList character={mockCharacter} />);
    expect(screen.queryByText('Pursuing this downtime')).not.toBeInTheDocument();
  });

  it('does not render the selected banner when nothing is chosen', () => {
    render(<DowntimeList character={mockCharacter} />);
    expect(screen.queryByText('Pursuing this downtime')).not.toBeInTheDocument();
  });
});
