import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DowntimeSummaryModal from './DowntimeSummaryModal';
import { useSyncedState } from '../../hooks/useSyncedState';

const mockSetSummary = vi.fn();

vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: vi.fn(() => [null, mockSetSummary]),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useSyncedState.mockReturnValue([null, mockSetSummary]);
});

const singleCharSummary = {
  period: { days: 7 },
  chars: [
    {
      id: 'a',
      name: 'Pellias',
      selected: ['Research'],
      ledger: [
        { day: 'Research', night: 'Research' },
        { day: 'Research', night: null },
      ],
    },
  ],
};

const multiCharSummary = {
  period: { days: 3 },
  chars: [
    {
      id: 'a',
      name: 'Pellias',
      selected: ['Earn Income'],
      ledger: [
        { day: 'Earn Income', night: 'Earn Income' },
        { day: 'Earn Income', night: null },
      ],
    },
    {
      id: 'b',
      name: 'Seraphina',
      selected: ['Crafting'],
      ledger: [{ day: 'Crafting', night: 'Crafting' }],
    },
    {
      id: 'c',
      name: 'Zira',
      selected: [],
      ledger: [],
    },
  ],
};

describe('DowntimeSummaryModal', () => {
  it('renders nothing when summary is null', () => {
    render(<DowntimeSummaryModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the "Downtime Complete" title when a summary exists', () => {
    useSyncedState.mockReturnValue([singleCharSummary, mockSetSummary]);
    render(<DowntimeSummaryModal />);
    expect(screen.getByText('Downtime Complete')).toBeInTheDocument();
  });

  it('shows the period day count', () => {
    useSyncedState.mockReturnValue([singleCharSummary, mockSetSummary]);
    render(<DowntimeSummaryModal />);
    expect(screen.getByText('7 days elapsed')).toBeInTheDocument();
  });

  it('singularises the period for 1 day', () => {
    useSyncedState.mockReturnValue([{ period: { days: 1 }, chars: [] }, mockSetSummary]);
    render(<DowntimeSummaryModal />);
    expect(screen.getByText('1 day elapsed')).toBeInTheDocument();
  });

  it('shows character name and accumulate hours progress', () => {
    useSyncedState.mockReturnValue([singleCharSummary, mockSetSummary]);
    render(<DowntimeSummaryModal />);
    expect(screen.getByText('Pellias')).toBeInTheDocument();
    expect(screen.getByText('Research')).toBeInTheDocument();
    // 2 entries × night + 1 day + 1 night = 3 blocks × 8h = wait...
    // ledger: [{day:'Research', night:'Research'}, {day:'Research', night:null}]
    // getHoursForActivity: day blocks (2) + night blocks (1) = 3 × 8 = 24h
    expect(screen.getByText('24h / 8h')).toBeInTheDocument();
  });

  it('shows roll count for instant activities', () => {
    useSyncedState.mockReturnValue([multiCharSummary, mockSetSummary]);
    render(<DowntimeSummaryModal />);
    // Pellias: 3 Earn Income blocks (2 day + 1 night) = 3 rolls
    expect(screen.getByText('3 rolls')).toBeInTheDocument();
  });

  it('singularises "1 roll"', () => {
    useSyncedState.mockReturnValue([{
      period: { days: 1 },
      chars: [{
        id: 'x', name: 'Test', selected: ['Earn Income'],
        ledger: [{ day: 'Earn Income', night: null }],
      }],
    }, mockSetSummary]);
    render(<DowntimeSummaryModal />);
    expect(screen.getByText('1 roll')).toBeInTheDocument();
  });

  it('shows "No activities committed" for a character with an empty ledger', () => {
    useSyncedState.mockReturnValue([multiCharSummary, mockSetSummary]);
    render(<DowntimeSummaryModal />);
    expect(screen.getByText('No activities committed')).toBeInTheDocument();
  });

  it('shows all characters in the party', () => {
    useSyncedState.mockReturnValue([multiCharSummary, mockSetSummary]);
    render(<DowntimeSummaryModal />);
    expect(screen.getByText('Pellias')).toBeInTheDocument();
    expect(screen.getByText('Seraphina')).toBeInTheDocument();
    expect(screen.getByText('Zira')).toBeInTheDocument();
  });

  it('"Got it" button clears the summary', () => {
    useSyncedState.mockReturnValue([singleCharSummary, mockSetSummary]);
    render(<DowntimeSummaryModal />);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(mockSetSummary).toHaveBeenCalledWith(null);
  });

  it('includes activities that appeared in the night slot but not the day slot', () => {
    useSyncedState.mockReturnValue([{
      period: { days: 1 },
      chars: [{
        id: 'x', name: 'Mixed',
        selected: ['Research', 'Crafting'],
        ledger: [{ day: 'Research', night: 'Crafting' }],
      }],
    }, mockSetSummary]);
    render(<DowntimeSummaryModal />);
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('Crafting')).toBeInTheDocument();
  });
});
