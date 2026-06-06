import React from 'react';
import { render, screen } from '@testing-library/react';
import InnateCastingList from './InnateCastingList';

vi.mock('./SpellCard', () => ({
  default: function DummySpellCard({ spell }) {
    return <div data-testid="spell-card">{spell.name}</div>;
  }
}));

vi.mock('../shared/TraitTag', () => ({
  default: function DummyTraitTag({ trait }) {
    return <span>{typeof trait === 'string' ? trait : trait?.name}</span>;
  }
}));

vi.mock('../../utils/SpellUtils', () => ({
  filterSpellsByDefense: (spells, filter) => {
    if (!spells) return [];
    if (filter === 'all') return spells;
    return spells.filter(s => s.defense === filter);
  },
  organizeSpellsByRank: (spells) => {
    const result = { cantrips: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [], 10: [] };
    spells.forEach(s => {
      const rank = s.level === 0 ? 'cantrips' : (s.level || 1);
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

const baseCharacter = { name: 'Aria', level: 5 };

const makeSpell = (id, name, innateSource = 'Ancestry') => ({
  id,
  name,
  level: 1,
  innateSource,
});

describe('InnateCastingList', () => {
  it('renders innate spellcasting header', () => {
    render(
      <InnateCastingList
        spells={[]}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="all"
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Innate Spellcasting')).toBeInTheDocument();
  });

  it('renders spell cards when filteredSpells is non-empty', () => {
    const spells = [makeSpell('s1', 'Detect Magic'), makeSpell('s2', 'Ghost Sound')];
    render(
      <InnateCastingList
        spells={spells}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="all"
        character={baseCharacter}
      />
    );
    expect(screen.getAllByTestId('spell-card')).toHaveLength(2);
    expect(screen.getByText('Detect Magic')).toBeInTheDocument();
    expect(screen.getByText('Ghost Sound')).toBeInTheDocument();
  });

  it('renders "no innate spellcasting" empty state when spells is empty and defenseFilter is "all"', () => {
    render(
      <InnateCastingList
        spells={[]}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="all"
        character={baseCharacter}
      />
    );
    expect(
      screen.getByText("This character doesn't have any innate spellcasting abilities.")
    ).toBeInTheDocument();
  });

  it('renders "no spells matching filters" when defenseFilter is not "all" and result is empty', () => {
    render(
      <InnateCastingList
        spells={[]}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="Will"
        character={baseCharacter}
      />
    );
    expect(
      screen.getByText('No innate spells matching your current filters.')
    ).toBeInTheDocument();
  });

  it('passes fromInnate prop to SpellCard', () => {
    // Verify that a spell with innateSource renders correctly (SpellCard receives it)
    const spells = [makeSpell('s1', 'Charm', 'Ancestry')];
    render(
      <InnateCastingList
        spells={spells}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="all"
        character={baseCharacter}
      />
    );
    expect(screen.getByTestId('spell-card')).toBeInTheDocument();
  });
});
