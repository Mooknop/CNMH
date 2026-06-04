import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import WandSpells from './WandSpells';

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

const baseSpells = [
  { id: 'spell-1', name: 'Dizzying Colors', level: 1, defense: 'Will', wandName: 'Wand of Dizzying Colors' },
  { id: 'spell-2', name: 'Fireball', level: 3, defense: 'Reflex', wandName: 'Wand of Fireball' },
];

const baseProps = {
  spells: baseSpells,
  themeColor: '#4a90d9',
  characterLevel: 5,
  defenseFilter: 'all',
  activeSpellRank: 'all',
  character: {},
};

describe('WandSpells', () => {
  beforeEach(() => localStorage.clear());

  it('renders WandInfoBox with Using Wands heading', () => {
    render(<WandSpells {...baseProps} />);
    expect(screen.getByText('Using Wands')).toBeInTheDocument();
  });

  it('renders spell names as cards', () => {
    render(<WandSpells {...baseProps} />);
    expect(screen.getByText('Dizzying Colors')).toBeInTheDocument();
    expect(screen.getByText('Fireball')).toBeInTheDocument();
  });

  it('renders one charge bubble per wand, all initially available', () => {
    render(<WandSpells {...baseProps} />);
    expect(screen.getAllByLabelText('Available charge')).toHaveLength(2);
    expect(screen.queryAllByLabelText('Spent charge')).toHaveLength(0);
  });

  it('clicking an available bubble marks the wand as used', () => {
    render(<WandSpells {...baseProps} />);
    fireEvent.click(screen.getAllByLabelText('Available charge')[0]);
    expect(screen.getAllByLabelText('Available charge')).toHaveLength(1);
    expect(screen.getAllByLabelText('Spent charge')).toHaveLength(1);
  });

  it('clicking a spent bubble resets the wand to available', () => {
    render(<WandSpells {...baseProps} />);
    fireEvent.click(screen.getAllByLabelText('Available charge')[0]);
    fireEvent.click(screen.getByLabelText('Spent charge'));
    expect(screen.getAllByLabelText('Available charge')).toHaveLength(2);
  });

  it('shows Overcharge button only for used wands', () => {
    render(<WandSpells {...baseProps} />);
    expect(screen.queryByRole('button', { name: /overcharge/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText('Available charge')[0]);
    expect(screen.getByRole('button', { name: /overcharge/i })).toBeInTheDocument();
  });

  it('clicking Overcharge marks the wand as overcharged', () => {
    render(<WandSpells {...baseProps} />);
    fireEvent.click(screen.getAllByLabelText('Available charge')[0]);
    fireEvent.click(screen.getByRole('button', { name: /overcharge/i }));
    expect(screen.getByText(/Overcharged/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Overcharge' })).not.toBeInTheDocument();
  });

  it('clicking the overcharged label resets the wand to available', () => {
    render(<WandSpells {...baseProps} />);
    fireEvent.click(screen.getAllByLabelText('Available charge')[0]);
    fireEvent.click(screen.getByRole('button', { name: /overcharge/i }));
    fireEvent.click(screen.getByText(/Overcharged/));
    expect(screen.getAllByLabelText('Available charge')).toHaveLength(2);
    expect(screen.queryByText(/Overcharged/)).not.toBeInTheDocument();
  });

  it('each wand tracks state independently', () => {
    render(<WandSpells {...baseProps} />);
    fireEvent.click(screen.getAllByLabelText('Available charge')[0]);
    expect(screen.getAllByLabelText('Available charge')).toHaveLength(1);
    expect(screen.getAllByLabelText('Spent charge')).toHaveLength(1);
  });

  it('groups spells into rank sections', () => {
    render(<WandSpells {...baseProps} />);
    expect(screen.getByText('Rank 1')).toBeInTheDocument();
    expect(screen.getByText('Rank 3')).toBeInTheDocument();
  });

  it('filters to matching rank when activeSpellRank is set', () => {
    render(<WandSpells {...baseProps} activeSpellRank="1" />);
    expect(screen.getByText('Rank 1')).toBeInTheDocument();
    expect(screen.queryByText('Rank 3')).not.toBeInTheDocument();
  });

  it('filters spells by defenseFilter', () => {
    render(<WandSpells {...baseProps} defenseFilter="Will" />);
    expect(screen.getByText('Dizzying Colors')).toBeInTheDocument();
    expect(screen.queryByText('Fireball')).not.toBeInTheDocument();
  });

  it('shows filter-aware empty message when no spells match', () => {
    render(<WandSpells {...baseProps} defenseFilter="Fortitude" />);
    expect(screen.getByText('No wands matching your current filters.')).toBeInTheDocument();
  });

  it('shows generic empty message when no wands in inventory', () => {
    render(<WandSpells {...baseProps} spells={[]} />);
    expect(screen.getByText('No wands in inventory.')).toBeInTheDocument();
  });
});
