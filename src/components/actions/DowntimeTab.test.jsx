import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DowntimeTab from './DowntimeTab';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';

vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    formatGameDate: () => '5 Pharast, 4725 AR',
    formatClockTime: () => '08:00',
    getCurrentWeekday: () => 'Oathday',
  }),
}));

vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: vi.fn(() => [null, vi.fn()]),
}));

vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));

vi.mock('./DowntimeList', () => ({
  default: function DummyDowntimeList({ character: c }) {
    return <div data-testid="downtime-list" data-charid={c?.id} />;
  }
}));

vi.mock('./DowntimeCommitBar', () => ({
  default: function DummyDowntimeCommitBar({ block }) {
    return <div data-testid="downtime-commit-bar" data-days={block?.days} />;
  }
}));

vi.mock('../inventory/CraftingModal', () => ({
  default: function DummyCraftingModal({ isOpen }) {
    return isOpen ? <div data-testid="crafting-modal">Crafting Modal</div> : null;
  }
}));

vi.mock('./CraftingProjects', () => ({
  default: function DummyCraftingProjects({ character: c }) {
    return <div data-testid="crafting-projects" data-charid={c?.id} />;
  }
}));

const character = { id: 'char-1', name: 'Pellias' };

// DowntimeTab calls useSyncedState twice: first for the block, then for the
// per-PC downtime state. Helpers set both in order, stamping the block with a
// period id and the downtime state with the matching periodStartedAt so the
// period-scoped reads see live (current-period) data.
const PERIOD = 'P1';
const withBlock = (block, downtime = null) => {
  const stampedBlock = block ? { startedAt: PERIOD, ...block } : block;
  const stampedDowntime = downtime ? { periodStartedAt: PERIOD, ...downtime } : downtime;
  useSyncedState
    .mockReturnValueOnce([stampedBlock, vi.fn()])    // cnmh_downtimeblock_global
    .mockReturnValueOnce([stampedDowntime, vi.fn()]); // cnmh_downtime_<charId>
};

beforeEach(() => {
  vi.clearAllMocks();
  useSyncedState.mockReturnValue([null, vi.fn()]);
  useCharacter.mockReturnValue({ skillProficiencies: { crafting: 0 } });
});

describe('DowntimeTab', () => {
  it('shows the Downtime label and the current date/time', () => {
    render(<DowntimeTab character={character} />);
    expect(screen.getByText('Downtime')).toBeInTheDocument();
    expect(screen.getByText(/Oathday.*Pharast/)).toBeInTheDocument();
    expect(screen.getByText('08:00')).toBeInTheDocument();
  });

  it('shows "Not started" and a hint when no block is active', () => {
    render(<DowntimeTab character={character} />);
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(screen.getByText(/hasn.t started a downtime period/i)).toBeInTheDocument();
  });

  it('shows the granted day budget when a block is active', () => {
    withBlock({ days: 7, active: true });
    render(<DowntimeTab character={character} />);
    expect(screen.getByText('7 days available')).toBeInTheDocument();
    expect(screen.queryByText(/hasn.t started a downtime period/i)).not.toBeInTheDocument();
  });

  it('singularises a one-day budget', () => {
    withBlock({ days: 1, active: true });
    render(<DowntimeTab character={character} />);
    expect(screen.getByText('1 day available')).toBeInTheDocument();
  });

  it('treats an inactive block as not started', () => {
    withBlock({ days: 7, active: false });
    render(<DowntimeTab character={character} />);
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });

  it('renders the DowntimeList for the character', () => {
    render(<DowntimeTab character={character} />);
    expect(screen.getByTestId('downtime-list')).toHaveAttribute('data-charid', 'char-1');
  });

  it('renders the DowntimeCommitBar when the block is active', () => {
    withBlock({ days: 7, active: true });
    render(<DowntimeTab character={character} />);
    expect(screen.getByTestId('downtime-commit-bar')).toBeInTheDocument();
    expect(screen.getByTestId('downtime-commit-bar')).toHaveAttribute('data-days', '7');
  });

  it('hides the DowntimeCommitBar when no block is active', () => {
    render(<DowntimeTab character={character} />);
    expect(screen.queryByTestId('downtime-commit-bar')).not.toBeInTheDocument();
  });

  it('shows days-used sub-header once days have been committed', () => {
    withBlock(
      { days: 7, active: true },
      { selected: ['Research'], ledger: [{ day: 'Research', night: null }] }
    );
    render(<DowntimeTab character={character} />);
    expect(screen.getByText('1 of 7 days used')).toBeInTheDocument();
  });

  it('hides the days-used sub-header when ledger is empty', () => {
    withBlock({ days: 7, active: true }, { selected: ['Research'], ledger: [] });
    render(<DowntimeTab character={character} />);
    expect(screen.queryByText(/days used/i)).not.toBeInTheDocument();
  });

  describe('progress readout', () => {
    it('is hidden before any days are committed', () => {
      withBlock({ days: 7, active: true }, { selected: ['Research'], ledger: [] });
      render(<DowntimeTab character={character} />);
      expect(screen.queryByText('Progress')).not.toBeInTheDocument();
    });

    it('shows accumulate hours / benchmark for an accumulate activity', () => {
      withBlock(
        { days: 7, active: true },
        {
          selected: ['Research'],
          ledger: [{ day: 'Research', night: 'Research' }],
        }
      );
      render(<DowntimeTab character={character} />);
      expect(screen.getByText('Progress')).toBeInTheDocument();
      expect(screen.getByText('Research')).toBeInTheDocument();
      expect(screen.getByText('16h / 8h')).toBeInTheDocument();
    });

    it('shows roll count for an instant activity', () => {
      withBlock(
        { days: 7, active: true },
        {
          selected: ['Earn Income'],
          ledger: [
            { day: 'Earn Income', night: null },
            { day: 'Earn Income', night: 'Earn Income' },
          ],
        }
      );
      render(<DowntimeTab character={character} />);
      expect(screen.getByText('3 rolls')).toBeInTheDocument();
    });

    it('shows multiple activities in parallel', () => {
      withBlock(
        { days: 7, active: true },
        {
          selected: ['Research', 'Crafting'],
          ledger: [{ day: 'Research', night: 'Crafting' }],
        }
      );
      render(<DowntimeTab character={character} />);
      expect(screen.getByText('Research')).toBeInTheDocument();
      expect(screen.getByText('Crafting')).toBeInTheDocument();
    });
  });

  it('hides the Crafting button and projects panel when untrained in Crafting', () => {
    render(<DowntimeTab character={character} />);
    expect(screen.queryByText('Crafting Recipes')).not.toBeInTheDocument();
    expect(screen.queryByTestId('crafting-projects')).not.toBeInTheDocument();
  });

  it('shows the Crafting button, projects panel, and opens the modal when trained in Crafting', () => {
    useCharacter.mockReturnValue({ skillProficiencies: { crafting: 1 } });
    render(<DowntimeTab character={character} />);
    expect(screen.getByTestId('crafting-projects')).toBeInTheDocument();
    const btn = screen.getByText('Crafting Recipes');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.getByTestId('crafting-modal')).toBeInTheDocument();
  });
});
