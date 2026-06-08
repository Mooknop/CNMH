import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DowntimeCommitBar from './DowntimeCommitBar';
import { useSyncedState } from '../../hooks/useSyncedState';

const mockSetDowntime = vi.fn();
const mockSetCraftProjects = vi.fn();
const mockApplyFatigue = vi.fn();
const mockClearFatigue = vi.fn();

vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: vi.fn(),
}));

vi.mock('../../hooks/useDowntimeFatigue', () => ({
  useDowntimeFatigue: vi.fn(() => ({
    isFatigued: false,
    applyFatigue: mockApplyFatigue,
    clearFatigue: mockClearFatigue,
  })),
}));

const PERIOD = 'P1';
const character = { id: 'char-1' };
const activeBlock = { days: 7, active: true, startedAt: PERIOD };

// Key-aware mock: downtime state and craftprojects state are returned by key.
const withState = (dtState, cpState = null) => {
  const dtVal = dtState ? { periodStartedAt: PERIOD, ...dtState } : dtState;
  const cpVal = cpState ? { projects: cpState } : null;
  useSyncedState.mockImplementation((key) => {
    if (key && key.includes('craftprojects')) return [cpVal, mockSetCraftProjects];
    return [dtVal, mockSetDowntime];
  });
};

// Legacy helper — sets downtime only, no projects.
const withDowntime = (state) => withState(state, null);

// Stamped state matching the active period, for feeding the setState updater.
const scoped = (state) => ({ periodStartedAt: PERIOD, ...state });

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
    render(<DowntimeCommitBar character={character} block={{ days: 2, active: true, startedAt: PERIOD }} />);
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
    const result = updater(scoped({ selected: ['Research'], ledger: [] }));
    expect(result.ledger).toEqual([{ day: 'Research', night: null }]);
    expect(result.periodStartedAt).toBe(PERIOD);

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
    const result = updater(scoped({ selected: ['Research'], ledger: [] }));
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
    const result = updater(scoped({ selected: ['Research', 'Earn Income'], ledger: [] }));
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
    render(<DowntimeCommitBar character={character} block={{ days: 2, active: true, startedAt: PERIOD }} />);
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
    const result = updater(scoped({
      selected: ['Research'],
      ledger: [{ day: 'Research', night: null }],
    }));
    expect(result.ledger).toHaveLength(2);
    expect(result.ledger[0]).toEqual({ day: 'Research', night: null });
    expect(result.ledger[1]).toEqual({ day: 'Research', night: null });
  });

  describe('period scoping', () => {
    it('ignores a ledger stamped for a prior period (reads as fresh)', () => {
      // Two days already committed, but under a DIFFERENT period stamp.
      useSyncedState.mockImplementation((key) => {
        if (key && key.includes('craftprojects')) return [null, mockSetCraftProjects];
        return [
          {
            periodStartedAt: 'OLD',
            selected: ['Research'],
            ledger: [
              { day: 'Research', night: null },
              { day: 'Research', night: null },
            ],
          },
          mockSetDowntime,
        ];
      });
      render(<DowntimeCommitBar character={character} block={{ days: 2, active: true, startedAt: PERIOD }} />);
      // Not exhausted: the prior period's ledger does not count.
      expect(screen.queryByText(/all 2 days committed/i)).not.toBeInTheDocument();
      // But selected is also prior-period, so it reads as empty → activity hint.
      expect(screen.getByText(/select activities above/i)).toBeInTheDocument();
    });

    it('committing over stale state starts a fresh ledger stamped to the new period', () => {
      withDowntime({ selected: ['Research'], ledger: [] });
      render(<DowntimeCommitBar character={character} block={activeBlock} />);
      fireEvent.click(screen.getByRole('button', { name: 'Commit 8h day' }));

      const updater = mockSetDowntime.mock.calls[0][0];
      const result = updater({
        periodStartedAt: 'OLD',
        selected: ['Research', 'Crafting'],
        ledger: [{ day: 'Research', night: null }],
      });
      // Prior-period ledger discarded; only the new commit remains.
      expect(result.ledger).toEqual([{ day: 'Research', night: null }]);
      expect(result.periodStartedAt).toBe(PERIOD);
    });
  });

  describe('craft allocation', () => {
    const craftProject = { id: 'p1', name: 'Antidote (Lesser)', source: 'recipe', threshold: 8, hours: 0 };

    it('does not show allocation panel when Crafting is not selected', () => {
      withState({ selected: ['Research'], ledger: [] }, [craftProject]);
      render(<DowntimeCommitBar character={character} block={activeBlock} />);
      expect(screen.queryByText(/allocate crafting hours/i)).not.toBeInTheDocument();
    });

    it('does not show allocation panel when no projects exist', () => {
      withState({ selected: ['Crafting'], ledger: [] }, []);
      render(<DowntimeCommitBar character={character} block={activeBlock} />);
      expect(screen.queryByText(/allocate crafting hours/i)).not.toBeInTheDocument();
    });

    it('shows allocation panel when Crafting is the activity and projects exist', () => {
      withState({ selected: ['Crafting'], ledger: [] }, [craftProject]);
      render(<DowntimeCommitBar character={character} block={activeBlock} />);
      expect(screen.getByText(/allocate crafting hours/i)).toBeInTheDocument();
      expect(screen.getByLabelText(`Hours for ${craftProject.name}`)).toBeInTheDocument();
    });

    it('defaults all crafting hours to the furthest-along project', () => {
      const p1 = { id: 'p1', name: 'Project A', source: 'recipe', threshold: 8, hours: 2 };
      const p2 = { id: 'p2', name: 'Project B', source: 'recipe', threshold: 8, hours: 6 };
      withState({ selected: ['Crafting'], ledger: [] }, [p1, p2]);
      render(<DowntimeCommitBar character={character} block={activeBlock} />);
      // p2 is furthest along (6h) so it gets the default 8h
      expect(screen.getByLabelText('Hours for Project B')).toHaveValue(8);
      expect(screen.getByLabelText('Hours for Project A')).toHaveValue(0);
    });

    it('commit button is disabled when allocation does not sum to craftingHours', () => {
      withState({ selected: ['Crafting'], ledger: [] }, [craftProject]);
      render(<DowntimeCommitBar character={character} block={activeBlock} />);
      // Change the default allocation away from the valid total
      fireEvent.change(screen.getByLabelText(`Hours for ${craftProject.name}`), {
        target: { value: '0' },
      });
      expect(screen.getByRole('button', { name: 'Commit 8h day' })).toBeDisabled();
    });

    it('commit button is enabled when allocation sums to craftingHours', () => {
      withState({ selected: ['Crafting'], ledger: [] }, [craftProject]);
      render(<DowntimeCommitBar character={character} block={activeBlock} />);
      // Default puts all 8h on the single project → valid
      expect(screen.getByRole('button', { name: 'Commit 8h day' })).not.toBeDisabled();
    });

    it('on commit, updates craftprojects with allocated hours', () => {
      withState({ selected: ['Crafting'], ledger: [] }, [craftProject]);
      render(<DowntimeCommitBar character={character} block={activeBlock} />);
      fireEvent.click(screen.getByRole('button', { name: 'Commit 8h day' }));

      expect(mockSetCraftProjects).toHaveBeenCalled();
      const cpUpdater = mockSetCraftProjects.mock.calls[0][0];
      const cpResult = cpUpdater({ projects: [craftProject] });
      expect(cpResult.projects[0].hours).toBe(8);
    });

    it('does not call setCraftProjects when no projects exist', () => {
      withState({ selected: ['Crafting'], ledger: [] }, []);
      render(<DowntimeCommitBar character={character} block={activeBlock} />);
      fireEvent.click(screen.getByRole('button', { name: 'Commit 8h day' }));
      expect(mockSetCraftProjects).not.toHaveBeenCalled();
    });

    it('shows 16h total when both day and night are Crafting', () => {
      withState({ selected: ['Crafting'], ledger: [] }, [craftProject]);
      render(<DowntimeCommitBar character={character} block={activeBlock} />);
      fireEvent.click(screen.getByLabelText('Work through the night'));
      // Default: 16h on the single project
      expect(screen.getByLabelText(`Hours for ${craftProject.name}`)).toHaveValue(16);
      expect(screen.getByText('16 / 16h allocated')).toBeInTheDocument();
    });
  });
});
