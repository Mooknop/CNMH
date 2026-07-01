import React from 'react';
import { render, screen } from '@testing-library/react';
import SpellsRepertoire from './SpellsRepertoire';

vi.mock('../../utils/SpellUtils', () => ({
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
  beforeEach(() => localStorage.clear());

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

  it('renders a read-only slot ledger for non-cantrip ranks', () => {
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
    expect(
      screen.getByRole('img', { name: /Rank 1 spell slots: 3 of 3 remaining/ })
    ).toBeInTheDocument();
  });

  it('reflects spent slots from the synced ledger (read-only, not clickable)', () => {
    localStorage.setItem('cnmh_slots_wiz', JSON.stringify({ '1': 1 }));
    const spells = [makeSpell('s1', 'Fireball', 1)];
    const character = { id: 'wiz', spellcasting: { bloodline: null } };
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
    // One slot spent → 2 of 3 remaining, and no interactive control exists.
    expect(
      screen.getByRole('img', { name: /Rank 1 spell slots: 2 of 3 remaining/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /spell slots:/ })).toBeNull();
  });

  it('does not render a slot ledger for cantrips', () => {
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
    expect(screen.queryByRole('img', { name: /spell slots:/ })).toBeNull();
    expect(screen.getByText('Detect Magic')).toBeInTheDocument();
  });

  it('no longer renders a Rest button (daily prep owns the refresh)', () => {
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
    expect(screen.queryByRole('button', { name: /Rest/i })).toBeNull();
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
