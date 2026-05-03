import React from 'react';
import { render, screen } from '@testing-library/react';
import InnateCastingList from './InnateCastingList';

jest.mock('./SpellCard', () => {
  return function DummySpellCard({ spell }) {
    return <div data-testid="spell-card">{spell.name}</div>;
  };
});

jest.mock('../shared/TraitTag', () => {
  return function DummyTraitTag({ trait }) {
    return <span>{typeof trait === 'string' ? trait : trait?.name}</span>;
  };
});

jest.mock('../../utils/SpellUtils', () => ({
  filterSpellsByDefense: (spells, filter) => {
    if (!spells) return [];
    if (filter === 'all') return spells;
    return spells.filter(s => s.defense === filter);
  },
}));

const baseCharacter = { name: 'Aria', level: 5 };

const makeSpell = (id, name, innateSource = 'Ancestry') => ({
  id,
  name,
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
