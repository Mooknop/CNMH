import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StaffSpells from './StaffSpells';

jest.mock('../../utils/SpellUtils', () => ({
  filterSpellsByDefense: (spells, filter) =>
    filter === 'all' ? spells : spells.filter(s => s.defense === filter),
  organizeSpellsByRank: (spells) => {
    const result = { cantrips: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [], 10: [] };
    spells.forEach(s => {
      const rank = s.level === 0 ? 'cantrips' : s.level;
      if (result[rank]) result[rank].push(s);
    });
    return result;
  },
  getSortedRankList: (ranks) => {
    const sorted = ['all'];
    if (ranks.includes('cantrips')) sorted.push('cantrips');
    for (let i = 1; i <= 10; i++) {
      if (ranks.includes(String(i))) sorted.push(String(i));
    }
    return sorted;
  },
}));

const baseStaff = {
  name: 'Staff of Fire',
  description: 'A fiery staff.',
  charges: { max: 3, current: 3 },
};

const baseSpells = [
  { id: 's1', name: 'Fireball', level: 3, defense: 'Reflex' },
  { id: 's2', name: 'Produce Flame', level: 0 },
  { id: 's3', name: 'Burning Hands', level: 1, defense: 'Reflex' },
];

const baseProps = {
  staff: baseStaff,
  spells: baseSpells,
  themeColor: '#4a90d9',
  characterLevel: 5,
  defenseFilter: 'all',
  activeSpellRank: 'all',
  character: {},
};

describe('StaffSpells', () => {
  beforeEach(() => localStorage.clear());

  it('renders StaffInfoBox with Staff Rules heading', () => {
    render(<StaffSpells {...baseProps} />);
    expect(screen.getByText('Staff Rules')).toBeInTheDocument();
  });

  it('renders charge bubbles equal to charges.max', () => {
    render(<StaffSpells {...baseProps} />);
    const bubbles = screen.getAllByRole('button');
    expect(bubbles).toHaveLength(3);
  });

  it('starts with all bubbles filled when current equals max', () => {
    render(<StaffSpells {...baseProps} />);
    expect(screen.getAllByLabelText('Available slot')).toHaveLength(3);
    expect(screen.queryAllByLabelText('Spent slot')).toHaveLength(0);
  });

  it('initialises spent bubbles from charges.current', () => {
    const staff = { ...baseStaff, charges: { max: 3, current: 1 } };
    render(<StaffSpells {...baseProps} staff={staff} />);
    expect(screen.getAllByLabelText('Available slot')).toHaveLength(1);
    expect(screen.getAllByLabelText('Spent slot')).toHaveLength(2);
  });

  it('clicking a filled bubble spends a charge', () => {
    render(<StaffSpells {...baseProps} />);
    fireEvent.click(screen.getAllByLabelText('Available slot')[0]);
    expect(screen.getAllByLabelText('Available slot')).toHaveLength(2);
    expect(screen.getAllByLabelText('Spent slot')).toHaveLength(1);
  });

  it('clicking an empty bubble recovers a charge', () => {
    const staff = { ...baseStaff, charges: { max: 3, current: 1 } };
    render(<StaffSpells {...baseProps} staff={staff} />);
    fireEvent.click(screen.getAllByLabelText('Spent slot')[0]);
    expect(screen.getAllByLabelText('Available slot')).toHaveLength(2);
    expect(screen.getAllByLabelText('Spent slot')).toHaveLength(1);
  });

  it('does not render charges section when staff.charges is absent', () => {
    const staff = { name: 'Plain Staff' };
    render(<StaffSpells {...baseProps} staff={staff} />);
    expect(screen.queryByText('Charges')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('does not render charges section when charges.max is 0', () => {
    const staff = { ...baseStaff, charges: { max: 0, current: 0 } };
    render(<StaffSpells {...baseProps} staff={staff} />);
    expect(screen.queryByText('Charges')).not.toBeInTheDocument();
  });

  it('renders spell names as chips', () => {
    render(<StaffSpells {...baseProps} />);
    expect(screen.getByText('Fireball')).toBeInTheDocument();
    expect(screen.getByText('Produce Flame')).toBeInTheDocument();
    expect(screen.getByText('Burning Hands')).toBeInTheDocument();
  });

  it('groups spells into multiple rank sections', () => {
    render(<StaffSpells {...baseProps} />);
    expect(screen.getByText('Cantrips')).toBeInTheDocument();
    expect(screen.getByText('Rank 1')).toBeInTheDocument();
    expect(screen.getByText('Rank 3')).toBeInTheDocument();
  });

  it('filters to only matching rank when activeSpellRank is set', () => {
    render(<StaffSpells {...baseProps} activeSpellRank="3" />);
    expect(screen.getByText('Rank 3')).toBeInTheDocument();
    expect(screen.queryByText('Cantrips')).not.toBeInTheDocument();
    expect(screen.queryByText('Rank 1')).not.toBeInTheDocument();
  });

  it('filters spells by defenseFilter within ranks', () => {
    render(<StaffSpells {...baseProps} defenseFilter="Reflex" />);
    expect(screen.getByText('Fireball')).toBeInTheDocument();
    expect(screen.getByText('Burning Hands')).toBeInTheDocument();
    expect(screen.queryByText('Produce Flame')).not.toBeInTheDocument();
  });

  it('shows filter-aware empty message when no spells match', () => {
    render(<StaffSpells {...baseProps} activeSpellRank="3" defenseFilter="Will" />);
    expect(screen.getByText('No staff spells matching your current filters.')).toBeInTheDocument();
  });

  it('shows generic empty message when staff has no spells and no filter active', () => {
    render(<StaffSpells {...baseProps} spells={[]} />);
    expect(screen.getByText('This staff has no spells.')).toBeInTheDocument();
  });

  it('shows the not-in-hand hint when staff spells are inactive', () => {
    const spells = baseSpells.map((s) => ({ ...s, active: false }));
    render(<StaffSpells {...baseProps} spells={spells} />);
    expect(screen.getByText('Not in hand — hold the staff to cast its spells.')).toBeInTheDocument();
  });

  it('does not show the hint when the staff is held (spells active)', () => {
    const spells = baseSpells.map((s) => ({ ...s, active: true }));
    render(<StaffSpells {...baseProps} spells={spells} />);
    expect(screen.queryByText(/Not in hand/)).not.toBeInTheDocument();
  });

  it('spell chip links point to aonprd.com', () => {
    render(<StaffSpells {...baseProps} />);
    const link = screen.getByRole('link', { name: 'Fireball' });
    expect(link).toHaveAttribute('href', expect.stringContaining('aonprd.com'));
  });
});
