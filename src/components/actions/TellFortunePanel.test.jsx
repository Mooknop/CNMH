import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TellFortunePanel from './TellFortunePanel';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useContent } from '../../contexts/ContentContext';

vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../contexts/GameDateContext', () => ({ useGameDate: () => ({ gameDate: {}, time: {} }) }));
vi.mock('../../utils/gameTime', () => ({ toGameSeconds: () => 1000 }));
vi.mock('../../utils/expiry', () => ({ expiryLabelSecs: () => 'in 6 days' }));

const character = { id: 'jade', name: 'Jade' };
const characters = [
  { id: 'jade', name: 'Jade', level: 5 },
  { id: 'ashka', name: 'Ashka', level: 5 },
  { id: 'blu', name: 'Blu', level: 6 },
];

const mockSetLedger = vi.fn();
const withLedger = (ledger) =>
  useSyncedState.mockImplementation((key) =>
    typeof key === 'string' && key.startsWith('cnmh_tellfortune_')
      ? [ledger, mockSetLedger]
      : [null, vi.fn()],
  );

beforeEach(() => {
  vi.clearAllMocks();
  withLedger({});
  useContent.mockReturnValue({ characters });
});

describe('TellFortunePanel', () => {
  it('lists party PCs (excluding self) plus an Other-creature option', () => {
    render(<TellFortunePanel character={character} />);
    expect(screen.getByRole('option', { name: /Ashka \(Lvl 5\)/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Blu \(Lvl 6\)/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Other creature/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^Jade/ })).not.toBeInTheDocument();
  });

  it('shows the hard DC for the chosen PC level', () => {
    render(<TellFortunePanel character={character} />);
    fireEvent.change(screen.getByLabelText('Tell Fortune target'), { target: { value: 'ashka' } });
    expect(screen.getByText(/hard DC 22/)).toBeInTheDocument(); // level 5 → 20 + 2
  });

  it('resolves a reading, stamps the immunity, and shows the augury outcome', () => {
    render(<TellFortunePanel character={character} />);
    fireEvent.change(screen.getByLabelText('Tell Fortune target'), { target: { value: 'ashka' } });
    fireEvent.change(screen.getByLabelText('Raw d20 die'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Check total'), { target: { value: '25' } }); // ≥ DC 22 → success
    fireEvent.click(screen.getByRole('button', { name: /tell fortune/i }));

    expect(mockSetLedger).toHaveBeenCalled();
    const next = mockSetLedger.mock.calls[0][0]({});
    expect(next.ashka).toMatchObject({ abilityKey: 'tell-fortune', appliedBy: 'jade' });
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText(/Ashka is now immune for 1 week/)).toBeInTheDocument();
  });

  it('blocks a target already in the ledger and hides the roll inputs', () => {
    withLedger({
      ashka: { effectId: 'ability-immunity', abilityKey: 'tell-fortune', appliedBy: 'jade', expireAtSecs: 2000 },
    });
    render(<TellFortunePanel character={character} />);
    fireEvent.change(screen.getByLabelText('Tell Fortune target'), { target: { value: 'ashka' } });
    expect(screen.getByText(/already immune to your Tell Fortune/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Raw d20 die')).not.toBeInTheDocument();
  });

  it('supports a GM-named creature with its own level → DC', () => {
    render(<TellFortunePanel character={character} />);
    fireEvent.change(screen.getByLabelText('Tell Fortune target'), { target: { value: 'other' } });
    fireEvent.change(screen.getByLabelText('Creature name'), { target: { value: 'Goblin Warchief' } });
    fireEvent.change(screen.getByLabelText('Creature level'), { target: { value: '3' } });
    expect(screen.getByText(/hard DC 20/)).toBeInTheDocument(); // level 3 → 18 + 2
  });
});
