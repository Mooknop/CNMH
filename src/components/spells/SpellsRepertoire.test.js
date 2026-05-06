import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SpellsRepertoire from './SpellsRepertoire';

jest.mock('../../utils/SpellUtils', () => ({
  filterSpellsByDefense: (spells, filter) => {
    if (!spells) return [];
    if (filter === 'all') return spells;
    return spells.filter(s => s.defense === filter);
  },
  organizeSpellsByRank: (spells) => {
    const result = {};
    spells.forEach(s => {
      const key = s.level === 0 ? 'cantrips' : s.level;
      if (!result[key]) result[key] = [];
      result[key].push(s);
    });
    return result;
  },
  getSortedRankList: (ranks) => {
    const sorted = [...ranks].sort((a, b) => {
      if (a === 'cantrips') return -1;
      if (b === 'cantrips') return 1;
      return Number(a) - Number(b);
    });
    return ['all', ...sorted];
  },
}));

const makeSpell = (id, name, level = 1) => ({ id, name, level });

describe('SpellsRepertoire', () => {
  it('renders spell names as chips when spells are provided', () => {
    const spells = [makeSpell('s1', 'Fireball', 1), makeSpell('s2', 'Magic Missile', 1)];
    const character = { spellcasting: { bloodline: null } };
    render(
      <SpellsRepertoire
        spells={spells}
        spellSlots={{ '1': 3 }}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="all"
        character={character}
      />
    );
    expect(screen.getByText('Fireball')).toBeInTheDocument();
    expect(screen.getByText('Magic Missile')).toBeInTheDocument();
  });

  it('renders slot bubbles for non-cantrip ranks', () => {
    const spells = [makeSpell('s1', 'Fireball', 1)];
    const character = { spellcasting: { bloodline: null } };
    render(
      <SpellsRepertoire
        spells={spells}
        spellSlots={{ '1': 3 }}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="all"
        character={character}
      />
    );
    const filledBubbles = screen.getAllByLabelText('Available slot');
    expect(filledBubbles).toHaveLength(3);
  });

  it('marks a slot as spent when a filled bubble is clicked', () => {
    const spells = [makeSpell('s1', 'Fireball', 1)];
    const character = { spellcasting: { bloodline: null } };
    render(
      <SpellsRepertoire
        spells={spells}
        spellSlots={{ '1': 3 }}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="all"
        character={character}
      />
    );
    const firstBubble = screen.getAllByLabelText('Available slot')[0];
    fireEvent.click(firstBubble);
    expect(screen.getAllByLabelText('Available slot')).toHaveLength(2);
    expect(screen.getAllByLabelText('Spent slot')).toHaveLength(1);
  });

  it('does not render slot bubbles for cantrips', () => {
    const spells = [makeSpell('s1', 'Detect Magic', 0)];
    const character = { spellcasting: { bloodline: null } };
    render(
      <SpellsRepertoire
        spells={spells}
        spellSlots={{}}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="all"
        character={character}
      />
    );
    expect(screen.queryByLabelText('Available slot')).toBeNull();
    expect(screen.getByText('Detect Magic')).toBeInTheDocument();
  });

  it('renders ★ symbol on signature spells', () => {
    const spell = { id: 's1', name: 'Haste', level: 2, signature: true };
    const character = { spellcasting: { bloodline: null } };
    render(
      <SpellsRepertoire
        spells={[spell]}
        spellSlots={{ '2': 2 }}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="all"
        character={character}
      />
    );
    expect(screen.getByText('★')).toBeInTheDocument();
  });

  it('renders ✦ symbol on bloodline spells', () => {
    const spell = { id: 's1', name: 'Dragon Claws', level: 1, bloodline: true };
    const character = {
      spellcasting: {
        bloodline: { blood_magic: 'You gain a shield of bone.' },
      },
    };
    render(
      <SpellsRepertoire
        spells={[spell]}
        spellSlots={{ '1': 3 }}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="all"
        character={character}
      />
    );
    expect(screen.getByText('✦')).toBeInTheDocument();
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
        spellSlots={{}}
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
        spellSlots={{}}
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
        spellSlots={{}}
        themeColor="#4a90d9"
        characterLevel={5}
        defenseFilter="all"
        character={character}
      />
    );
    expect(screen.queryByText('Imperial Blood Magic:')).toBeNull();
  });
});
