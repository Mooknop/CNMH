import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SpellsList from './SpellsList';

jest.mock('./SpellsHeader', () => () => <div data-testid="spells-header" />);
jest.mock('./ViewModeToggle', () => ({ viewMode, setViewMode, hasSpellcasting, hasScrolls, hasWands }) => (
  <div data-testid="view-mode-toggle">
    {hasSpellcasting && <button onClick={() => setViewMode('spells')}>Repertoire</button>}
    {hasScrolls && <button onClick={() => setViewMode('scrolls')}>Scrolls</button>}
    {hasWands && <button onClick={() => setViewMode('wands')}>Wands</button>}
  </div>
));
jest.mock('./SpellFilters', () => () => <div data-testid="spell-filters" />);
jest.mock('./SpellsRepertoire', () => () => <div data-testid="spells-repertoire" />);
jest.mock('./StaffSpells', () => () => <div data-testid="staff-spells" />);
jest.mock('./ScrollSpells', () => () => <div data-testid="scroll-spells" />);
jest.mock('./WandSpells', () => () => <div data-testid="wand-spells" />);
jest.mock('./FocusSpellsList', () => () => <div data-testid="focus-spells" />);
jest.mock('./InnateCastingList', () => () => <div data-testid="innate-spells" />);
jest.mock('./EldPowers', () => () => <div data-testid="eld-powers" />);
jest.mock('./Harrowing', () => () => <div data-testid="harrowing" />);

jest.mock('../../hooks/useCharacter', () => ({
  useCharacter: (char) => {
    if (!char) return null;
    return {
      spellcasting: char._spellcasting || { spells: [] },
      scrollSpells: char._scrollSpells || [],
      wandSpells: char._wandSpells || [],
      innateSpells: char._innateSpells || [],
      staffSpells: char._staffSpells || [],
      staff: char._staff || null,
      eldPowers: char._eldPowers || [],
      level: char.level || 1,
      flags: {
        hasSpellcasting: char._hasSpellcasting || false,
        hasFocusSpells: char._hasFocus || false,
        hasInnateSpells: char._hasInnate || false,
        hasScrolls: char._hasScrolls || false,
        hasWands: char._hasWands || false,
        hasStaff: char._hasStaff || false,
        hasEldPowers: char._hasEld || false,
        hasHarrowing: char._hasHarrowing || false,
      },
      champion: char.champion || null,
      monk: char.monk || null,
      characterClass: char.class || '',
    };
  },
}));

jest.mock('../../utils/SpellUtils', () => ({
  organizeSpellsByRank: (spells = []) => {
    const spellsByRank = { cantrips: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [], 10: [] };
    spells.forEach(spell => {
      const rank = spell.level === 0 ? 'cantrips' : spell.level;
      if (spellsByRank[rank]) {
        spellsByRank[rank].push(spell);
      }
    });
    return spellsByRank;
  },
  getAvailableRanks: (spellsByRank) => Object.keys(spellsByRank).filter(rank => spellsByRank[rank].length > 0),
  getDefenseTypes: () => ['all'],
  filterSpellsByRank: (spells) => spells,
  getSortedRankList: (ranks) => ranks.sort(),
}));

describe('SpellsList', () => {
  it('renders empty state when character has no spellcasting', async () => {
    await act(async () => {
      render(<SpellsList character={{ id: '1' }} characterColor="#ff0000" />);
    });
    expect(screen.getByText(/doesn't have spellcasting/i)).toBeInTheDocument();
  });

  it('renders view mode toggle when character has spellcasting', async () => {
    const char = { id: '1', _hasSpellcasting: true, _spellcasting: { spells: [] } };
    await act(async () => {
      render(<SpellsList character={char} characterColor="#ff0000" />);
    });
    expect(screen.getByTestId('view-mode-toggle')).toBeInTheDocument();
  });

  it('renders spell filters when character has spellcasting', async () => {
    const char = { id: '1', _hasSpellcasting: true, _spellcasting: { spells: [{ name: 'Fireball', level: 3 }] } };
    await act(async () => {
      render(<SpellsList character={char} characterColor="#ff0000" />);
    });
    // SpellFilters only renders after viewMode is set (via useEffect) and when there are available ranks
    // Check that we got past the loading state
    expect(screen.queryByText('Loading spells...')).not.toBeInTheDocument();
    expect(screen.getByTestId('spell-filters')).toBeInTheDocument();
  });

  it('renders spells header when character has spellcasting', async () => {
    const char = { id: '1', _hasSpellcasting: true, _spellcasting: { spells: [] } };
    await act(async () => {
      render(<SpellsList character={char} characterColor="#ff0000" />);
    });
    expect(screen.getByTestId('spells-header')).toBeInTheDocument();
  });

  it('renders scroll spells when view mode is scrolls', async () => {
    const char = { id: '1', _hasScrolls: true, _scrollSpells: [{ name: 'Fireball', level: 3 }] };
    await act(async () => {
      render(<SpellsList character={char} characterColor="#ff0000" />);
    });
    // The useEffect sets viewMode to 'scrolls' (first available)
    expect(screen.getByTestId('scroll-spells')).toBeInTheDocument();
  });

  it('renders wand spells when view mode is wands', async () => {
    const char = { id: '1', _hasWands: true, _wandSpells: [{ name: 'Fireball', level: 3 }] };
    await act(async () => {
      render(<SpellsList character={char} characterColor="#ff0000" />);
    });
    expect(screen.getByTestId('wand-spells')).toBeInTheDocument();
  });

  it('can switch to scroll view', async () => {
    const char = { id: '1', _hasSpellcasting: true, _hasScrolls: true, _spellcasting: { spells: [] } };
    await act(async () => {
      render(<SpellsList character={char} characterColor="#ff0000" />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Scrolls'));
    });
    expect(screen.getByTestId('scroll-spells')).toBeInTheDocument();
  });
});
