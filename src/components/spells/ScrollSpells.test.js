import React from 'react';
import { render, screen } from '@testing-library/react';
import ScrollSpells from './ScrollSpells';

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
  { id: 's1', name: 'Pocket Library', level: 1 },
  { id: 's2', name: 'Fireball', level: 3, defense: 'Reflex' },
];

const baseProps = {
  spells: baseSpells,
  themeColor: '#4a90d9',
  characterLevel: 5,
  defenseFilter: 'all',
  activeSpellRank: 'all',
  character: {},
};

describe('ScrollSpells', () => {
  it('renders spell names as chips', () => {
    render(<ScrollSpells {...baseProps} />);
    expect(screen.getByText('Pocket Library')).toBeInTheDocument();
    expect(screen.getByText('Fireball')).toBeInTheDocument();
  });

  it('groups spells into rank sections', () => {
    render(<ScrollSpells {...baseProps} />);
    expect(screen.getByText('Rank 1')).toBeInTheDocument();
    expect(screen.getByText('Rank 3')).toBeInTheDocument();
  });

  it('filters to matching rank when activeSpellRank is set', () => {
    render(<ScrollSpells {...baseProps} activeSpellRank="3" />);
    expect(screen.getByText('Rank 3')).toBeInTheDocument();
    expect(screen.queryByText('Rank 1')).not.toBeInTheDocument();
  });

  it('filters spells by defenseFilter', () => {
    render(<ScrollSpells {...baseProps} defenseFilter="Reflex" />);
    expect(screen.getByText('Fireball')).toBeInTheDocument();
    expect(screen.queryByText('Pocket Library')).not.toBeInTheDocument();
  });

  it('shows filter-aware empty message when no spells match', () => {
    render(<ScrollSpells {...baseProps} defenseFilter="Will" />);
    expect(screen.getByText('No scrolls matching your current filters.')).toBeInTheDocument();
  });

  it('shows generic empty message when no scrolls in inventory', () => {
    render(<ScrollSpells {...baseProps} spells={[]} />);
    expect(screen.getByText('No scrolls in inventory.')).toBeInTheDocument();
  });

  it('chip links point to aonprd.com', () => {
    render(<ScrollSpells {...baseProps} />);
    const link = screen.getByRole('link', { name: 'Fireball' });
    expect(link).toHaveAttribute('href', expect.stringContaining('aonprd.com'));
  });

  it('renders no interactive bubbles', () => {
    render(<ScrollSpells {...baseProps} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
