import React from 'react';
import { render, screen } from '@testing-library/react';
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
  { id: 'w1', name: 'Dizzying Colors', level: 1, defense: 'Will', wandName: 'Wand of Dizzying Colors' },
  { id: 'w2', name: 'Fireball', level: 3, defense: 'Reflex', wandName: 'Wand of Fireball' },
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
  it('renders WandInfoBox with Using Wands heading', () => {
    render(<WandSpells {...baseProps} />);
    expect(screen.getByText('Using Wands')).toBeInTheDocument();
  });

  it('renders spell names as chips', () => {
    render(<WandSpells {...baseProps} />);
    expect(screen.getByText('Dizzying Colors')).toBeInTheDocument();
    expect(screen.getByText('Fireball')).toBeInTheDocument();
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

  it('chip links point to aonprd.com', () => {
    render(<WandSpells {...baseProps} />);
    const link = screen.getByRole('link', { name: 'Dizzying Colors' });
    expect(link).toHaveAttribute('href', expect.stringContaining('aonprd.com'));
  });

  it('renders no interactive bubbles', () => {
    render(<WandSpells {...baseProps} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
