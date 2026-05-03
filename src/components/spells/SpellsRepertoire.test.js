import React from 'react';
import { render, screen } from '@testing-library/react';
import SpellsRepertoire from './SpellsRepertoire';

jest.mock('./SpellCard', () => {
  return function DummySpellCard({ spell }) {
    return <div data-testid="spell-card">{spell.name}</div>;
  };
});

jest.mock('../../utils/SpellUtils', () => ({
  filterSpellsByDefense: (spells, filter) => {
    if (!spells) return [];
    if (filter === 'all') return spells;
    return spells.filter(s => s.defense === filter);
  },
}));

const makeSpell = (id, name) => ({ id, name });

describe('SpellsRepertoire', () => {
  it('renders spell cards when filteredSpells is non-empty', () => {
    const spells = [makeSpell('s1', 'Fireball'), makeSpell('s2', 'Magic Missile')];
    const character = { spellcasting: { bloodline: null } };
    render(
      <SpellsRepertoire
        spells={spells}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="all"
        character={character}
      />
    );
    expect(screen.getAllByTestId('spell-card')).toHaveLength(2);
    expect(screen.getByText('Fireball')).toBeInTheDocument();
    expect(screen.getByText('Magic Missile')).toBeInTheDocument();
  });

  it('renders empty state when no spells match filter', () => {
    const character = { spellcasting: { bloodline: null } };
    render(
      <SpellsRepertoire
        spells={[]}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="all"
        character={character}
      />
    );
    expect(screen.getByText('No spells matching your current filters.')).toBeInTheDocument();
  });

  it('renders bloodline info section when character.spellcasting.bloodline is non-null', () => {
    const character = {
      spellcasting: {
        bloodline: {
          blood_magic: 'You gain a shield of bone.',
        },
      },
    };
    render(
      <SpellsRepertoire
        spells={[]}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="all"
        character={character}
      />
    );
    expect(screen.getByText('Imperial Blood Magic:')).toBeInTheDocument();
    expect(screen.getByText('You gain a shield of bone.')).toBeInTheDocument();
  });

  it('does NOT render bloodline section when bloodline is null', () => {
    const character = { spellcasting: { bloodline: null } };
    render(
      <SpellsRepertoire
        spells={[]}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="all"
        character={character}
      />
    );
    expect(screen.queryByText('Imperial Blood Magic:')).toBeNull();
  });

  it('does NOT render bloodline section when bloodline is undefined', () => {
    const character = { spellcasting: {} };
    render(
      <SpellsRepertoire
        spells={[]}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="all"
        character={character}
      />
    );
    expect(screen.queryByText('Imperial Blood Magic:')).toBeNull();
  });
});
