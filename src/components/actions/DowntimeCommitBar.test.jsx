import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DowntimeCommitBar from './DowntimeCommitBar';
import { useSyncedState } from '../../hooks/useSyncedState';

const mockSetDowntime = vi.fn();
const mockApplyFatigue = vi.fn();
const mockClearFatigue = vi.fn();

vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: vi.fn(() => [null, mockSetDowntime]),
}));

vi.mock('../../hooks/useDowntimeFatigue', () => ({
  useDowntimeFatigue: vi.fn(() => ({
    isFatigued: false,
    applyFatigue: mockApplyFatigue,
    clearFatigue: mockClearFatigue,
  })),
}));

const character = { id: 'char-1' };
const activeBlock = { days: 7, active: true };

const withDowntime = (state) =>
  useSyncedState.mockReturnValue([state, mockSetDowntime]);

beforeEach(() => {
  vi.clearAllMocks();
  withDowntime(null);
});

describe('DowntimeCommitBar', () => {
  it('shows a hint when no activities are selected', () => {
    render(<DowntimeCommitBar character={character} block={activeBlock} />);
    expect(screen.getByText(/select activities above/i)).toBeInTheDocument();
  });

  it('shows a "budget exhausted" hint when all days are committed', () => {
    withDowntime({
      selected: ['Research'],
      ledger: [
        { day: 'Research', night: null },
        { day: 'Research', night: null },
      ],
    });
    render(<DowntimeCommitBar character={character} block={{ days: 2, active: true }} />);
    expect(screen.getByText(/all 2 days committed/i)).toBeInTheDocument();
  });

  it('shows the commit button and budget readout when activities are selected', () => {
    withDowntime({ selected: ['Research'], ledger: [] });
    render(<DowntimeCommitBar character={character} block={activeBlock} />);
    expect(screen.getByRole('button', { name: 'Commit 8h day' })).toBeInTheDocument();
    expect(screen.getByText('Day 1 of 7')).toBeInTheDocument();
  });

  it('shows the activity name (not a dropdown) for a single selected activity', () => {
    withDowntime({ selected: ['Research'], ledger: [] });
    render(<DowntimeCommitBar character={character} block={activeBlock} />);
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows a dropdown when multiple activities are selected', () => {
    withDowntime({ selected: ['Research', 'Crafting'], ledger: [] });
    render(<DowntimeCommitBar character={character} block={activeBlock} />);
    expect(screen.getByLabelText('Day activity')).toBeInTheDocument();
  });

  it('does not show night activity until the checkbox is ticked', () => {
    withDowntime({ selected: ['Research'], ledger: [] });
    render(<DowntimeCommitBar character={character} block={activeBlock} />);
    expect(screen.queryByText('Night (8h)')).not.toBeInTheDocument();
  });

  it('reveals the night block row when the night checkbox is checked', () => {
    withDowntime({ selected: ['Research'], ledger: [] });
    render(<DowntimeCommitBar character={character} block={activeBlock} />);
    fireEvent.click(screen.getByLabelText('Work through the night'));
    expect(screen.getByText('Night (8h)')).toBeInTheDocument();
  });

  it('button label changes to "16h day" when working through the night', () => {
    withDowntime({ selected: ['Research'], ledger: [] });
    render(<DowntimeCommitBar character={character} block={activeBlock} />);
    fireEvent.click(screen.getByLabelText('Work through the night'));
    expect(screen.getByRole('button', { name: 'Commit 16h day' })).toBeInTheDocument();
  });

  it('shows night activity dropdown for multiple activities when night is checked', () => {
    withDowntime({ selected: ['Research', 'Crafting'], ledger: [] });
    render(<DowntimeCommitBar character={character} block={activeBlock} />);
    fireEvent.click(screen.getByLabelText('Work through the night'));
    expect(screen.getByLabelText('Night activity')).toBeInTheDocument();
  });

  it('committing a day-only entry appends { day, night: null } and calls clearFatigue', () => {
    withDowntime({ selected: ['Research'], ledger: [] });
    render(<DowntimeCommitBar character={character} block={activeBlock} />);
    fireEvent.click(screen.getByRole('button', { name: 'Commit 8h day' }));

    expect(mockSetDowntime).toHaveBeenCalled();
    const updater = mockSetDowntime.mock.calls[0][0];
    const result = updater({ selected: ['Research'], ledger: [] });
    expect(result.ledger).toEqual([{ day: 'Research', night: null }]);

    expect(mockClearFatigue).toHaveBeenCalled();
    expect(mockApplyFatigue).not.toHaveBeenCalled();
  });

  it('committing a night entry appends { day, night } and calls applyFatigue', () => {
    withDowntime({ selected: ['Research'], ledger: [] });
    render(<DowntimeCommitBar character={character} block={activeBlock} />);
    fireEvent.click(screen.getByLabelText('Work through the night'));
    fireEvent.click(screen.getByRole('button', { name: 'Commit 16h day' }));

    expect(mockSetDowntime).toHaveBeenCalled();
    const updater = mockSetDowntime.mock.calls[0][0];
    const result = updater({ selected: ['Research'], ledger: [] });
    expect(result.ledger).toEqual([{ day: 'Research', night: 'Research' }]);

    expect(mockApplyFatigue).toHaveBeenCalled();
    expect(mockClearFatigue).not.toHaveBeenCalled();
  });

  it('commit with different day and night activities assigns each correctly', () => {
    withDowntime({ selected: ['Research', 'Earn Income'], ledger: [] });
    render(<DowntimeCommitBar character={character} block={activeBlock} />);
    fireEvent.click(screen.getByLabelText('Work through the night'));

    // Day stays at Research (first in list), change night to Earn Income
    fireEvent.change(screen.getByLabelText('Night activity'), {
      target: { value: 'Earn Income' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Commit 16h day' }));

    const updater = mockSetDowntime.mock.calls[0][0];
    const result = updater({ selected: ['Research', 'Earn Income'], ledger: [] });
    expect(result.ledger[0]).toEqual({ day: 'Research', night: 'Earn Income' });
  });

  it('resets the night checkbox to unchecked after committing', () => {
    withDowntime({ selected: ['Research'], ledger: [] });
    render(<DowntimeCommitBar character={character} block={activeBlock} />);
    const checkbox = screen.getByLabelText('Work through the night');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Commit 16h day' }));
    expect(screen.queryByText('Night (8h)')).not.toBeInTheDocument();
  });

  it('marks the last day as "(last day)" in the budget readout', () => {
    withDowntime({
      selected: ['Research'],
      ledger: [{ day: 'Research', night: null }],
    });
    render(<DowntimeCommitBar character={character} block={{ days: 2, active: true }} />);
    expect(screen.getByText('Day 2 of 2 (last day)')).toBeInTheDocument();
  });

  it('preserves existing ledger entries when committing a new day', () => {
    withDowntime({
      selected: ['Research'],
      ledger: [{ day: 'Research', night: null }],
    });
    render(<DowntimeCommitBar character={character} block={activeBlock} />);
    fireEvent.click(screen.getByRole('button', { name: 'Commit 8h day' }));

    const updater = mockSetDowntime.mock.calls[0][0];
    const result = updater({
      selected: ['Research'],
      ledger: [{ day: 'Research', night: null }],
    });
    expect(result.ledger).toHaveLength(2);
    expect(result.ledger[0]).toEqual({ day: 'Research', night: null });
    expect(result.ledger[1]).toEqual({ day: 'Research', night: null });
  });
});
