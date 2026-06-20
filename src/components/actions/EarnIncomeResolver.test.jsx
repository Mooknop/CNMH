import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EarnIncomeResolver from './EarnIncomeResolver';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';

vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));

const PERIOD = 'P1';
const character = { id: 'char-1', name: 'Ashka' };

const mockSetResults = vi.fn();

// Key-aware useSyncedState mock.
const setup = ({ block, downtime, taskMap, results } = {}) => {
  useSyncedState.mockImplementation((key) => {
    if (key === 'cnmh_downtimeblock_global') return [block, vi.fn()];
    if (key === 'cnmh_earnincometask_global') return [taskMap, vi.fn()];
    if (key === 'cnmh_downtimeresults_global') return [results, mockSetResults];
    if (key.startsWith('cnmh_downtime_')) return [downtime, vi.fn()];
    return [null, vi.fn()];
  });
};

const activeBlock = { days: 7, active: true, startedAt: PERIOD };
const earnedOneDay = {
  periodStartedAt: PERIOD,
  selected: ['Earn Income'],
  ledger: [{ day: 'Earn Income', night: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
  useCharacter.mockReturnValue({
    skillProficiencies: { crafting: 2 },
    loreSkills: [],
    feats: [],
  });
});

describe('EarnIncomeResolver', () => {
  it('renders nothing when no Earn Income day has been committed', () => {
    setup({ block: activeBlock, downtime: { periodStartedAt: PERIOD, selected: [], ledger: [] }, taskMap: { 'char-1': 8 } });
    const { container } = render(<EarnIncomeResolver character={character} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prompts for the GM when a roll is owed but no task level is assigned', () => {
    setup({ block: activeBlock, downtime: earnedOneDay, taskMap: null });
    render(<EarnIncomeResolver character={character} />);
    expect(screen.getByText(/waiting on the gm/i)).toBeInTheDocument();
  });

  it('shows the assigned level/DC and a Crafting option', () => {
    setup({ block: activeBlock, downtime: earnedOneDay, taskMap: { 'char-1': 8 } });
    render(<EarnIncomeResolver character={character} />);
    expect(screen.getByText('Level 8 · DC 24')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Crafting \(Expert\)/ })).toBeInTheDocument();
  });

  it('previews degree + payout and submits a pending result', () => {
    setup({ block: activeBlock, downtime: earnedOneDay, taskMap: { 'char-1': 8 }, results: null });
    render(<EarnIncomeResolver character={character} />);

    fireEvent.change(screen.getByLabelText('Earn Income skill'), { target: { value: 'crafting' } });
    fireEvent.change(screen.getByLabelText('Raw d20 die'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Check total'), { target: { value: '27' } });

    // lvl 8 expert success = 3 gp = 300 cp
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText(/3 gp \(3 gp\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /submit for gm/i }));
    expect(mockSetResults).toHaveBeenCalledTimes(1);
    const next = mockSetResults.mock.calls[0][0](null);
    expect(next.entries).toHaveLength(1);
    expect(next.entries[0]).toMatchObject({
      charId: 'char-1', taskLevel: 8, dc: 24, skillKey: 'crafting',
      degree: 'success', payoutCp: 300, status: 'pending', periodStartedAt: PERIOD,
    });
  });

  it('renders nothing once every committed roll has a result', () => {
    setup({
      block: activeBlock,
      downtime: earnedOneDay,
      taskMap: { 'char-1': 8 },
      results: { entries: [{ charId: 'char-1', periodStartedAt: PERIOD }] },
    });
    const { container } = render(<EarnIncomeResolver character={character} />);
    expect(container).toBeEmptyDOMElement();
  });
});
