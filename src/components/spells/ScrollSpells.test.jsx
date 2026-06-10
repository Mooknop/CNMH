import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ScrollSpells from './ScrollSpells';

const mockSpend = vi.fn();
const mockRestore = vi.fn();
let mockRemaining;
let mockConsumedMap;

vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({
    consumables: {
      map: mockConsumedMap,
      remainingFor: (name) => mockRemaining[name] ?? 1,
      spend: mockSpend,
      restore: mockRestore,
    },
  }),
}));

vi.mock('../../utils/SpellUtils', () => ({
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
  { id: 's1', name: 'Pocket Library', level: 1, scrollName: 'Scroll of Pocket Library' },
  { id: 's2', name: 'Fireball', level: 3, defense: 'Reflex', scrollName: 'Scroll of Fireball' },
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
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemaining = {};
    mockConsumedMap = {};
  });

  it('renders spell names as cards', () => {
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

  it('shows a remaining-count pip and label per scroll', () => {
    render(<ScrollSpells {...baseProps} />);
    expect(screen.getAllByLabelText('Unused scroll — tap to consume')).toHaveLength(2);
    expect(screen.getAllByText('1 left')).toHaveLength(2);
  });

  it('tapping an unused pip consumes the scroll', () => {
    render(<ScrollSpells {...baseProps} />);
    // Rank 1 section renders first → Pocket Library's pip is first.
    fireEvent.click(screen.getAllByLabelText('Unused scroll — tap to consume')[0]);
    expect(mockSpend).toHaveBeenCalledWith('Scroll of Pocket Library');
  });

  it('tapping a consumed pip restores the scroll', () => {
    mockRemaining = { 'Scroll of Pocket Library': 0 };
    mockConsumedMap = { 'Scroll of Pocket Library': 1 };
    render(<ScrollSpells {...baseProps} />);
    fireEvent.click(screen.getByLabelText('Consumed scroll — tap to restore'));
    expect(mockRestore).toHaveBeenCalledWith('Scroll of Pocket Library');
  });

  it('marks fully-consumed scrolls as used up', () => {
    mockRemaining = { 'Scroll of Fireball': 0 };
    mockConsumedMap = { 'Scroll of Fireball': 1 };
    render(<ScrollSpells {...baseProps} />);
    expect(screen.getByText('Used up')).toBeInTheDocument();
    expect(screen.getByText('1 left')).toBeInTheDocument();
  });
});
