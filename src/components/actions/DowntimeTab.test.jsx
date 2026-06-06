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

vi.mock('../inventory/CraftingModal', () => ({
  default: function DummyCraftingModal({ isOpen }) {
    return isOpen ? <div data-testid="crafting-modal">Crafting Modal</div> : null;
  }
}));

const character = { id: 'char-1', name: 'Pellias' };

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
    useSyncedState.mockReturnValue([{ days: 7, active: true }, vi.fn()]);
    render(<DowntimeTab character={character} />);
    expect(screen.getByText('7 days available')).toBeInTheDocument();
    expect(screen.queryByText(/hasn.t started a downtime period/i)).not.toBeInTheDocument();
  });

  it('singularises a one-day budget', () => {
    useSyncedState.mockReturnValue([{ days: 1, active: true }, vi.fn()]);
    render(<DowntimeTab character={character} />);
    expect(screen.getByText('1 day available')).toBeInTheDocument();
  });

  it('treats an inactive block as not started', () => {
    useSyncedState.mockReturnValue([{ days: 7, active: false }, vi.fn()]);
    render(<DowntimeTab character={character} />);
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });

  it('renders the DowntimeList for the character', () => {
    render(<DowntimeTab character={character} />);
    expect(screen.getByTestId('downtime-list')).toHaveAttribute('data-charid', 'char-1');
  });

  it('hides the Crafting button when the character is untrained in Crafting', () => {
    render(<DowntimeTab character={character} />);
    expect(screen.queryByText('Crafting Recipes')).not.toBeInTheDocument();
  });

  it('shows the Crafting button and opens the modal when trained in Crafting', () => {
    useCharacter.mockReturnValue({ skillProficiencies: { crafting: 1 } });
    render(<DowntimeTab character={character} />);
    const btn = screen.getByText('Crafting Recipes');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.getByTestId('crafting-modal')).toBeInTheDocument();
  });
});
