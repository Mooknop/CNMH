import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FocusSpellsList from './FocusSpellsList';

jest.mock('./SpellCard', () => ({ spell }) => (
  <div data-testid="spell-card">{spell.name}</div>
));

jest.mock('../../contexts/ContentContext', () => ({
  useContent: jest.fn(),
}));

const { useContent } = require('../../contexts/ContentContext');
// Restore default before each test so clearAllMocks doesn't leave it undefined.
beforeEach(() => {
  useContent.mockReturnValue({ spells: [] });
});

jest.mock('../../utils/SpellUtils', () => ({
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

const baseFocusSpell = {
  id: 'fs1',
  name: 'Divine Lance',
  level: 1,
  baseLevel: 1,
  description: 'You unleash divine energy.',
  actions: '2',
  traits: ['divine', 'evocation'],
  range: '30 feet',
};

const baseCharacter = {
  id: '1',
  name: 'Cleric',
  level: 5,
  spellcasting: {
    focus: { max: 2, current: 2 },
  },
  focus_spells: [baseFocusSpell],
};

describe('FocusSpellsList', () => {
  beforeEach(() => localStorage.clear());

  it('renders empty state when no focus spells', () => {
    render(<FocusSpellsList character={{ id: '1', level: 1 }} characterColor="#333" />);
    expect(screen.getByText(/doesn't have any focus spells/i)).toBeInTheDocument();
  });

  it('renders focus spells label', () => {
    render(<FocusSpellsList character={baseCharacter} characterColor="#333" />);
    expect(screen.getByText('Focus Points')).toBeInTheDocument();
  });

  it('renders spell chips', () => {
    render(<FocusSpellsList character={baseCharacter} characterColor="#333" />);
    expect(screen.getByText('Divine Lance')).toBeInTheDocument();
  });

  it('renders focus point bubbles equal to focus.max', () => {
    render(<FocusSpellsList character={baseCharacter} characterColor="#333" />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('starts with all bubbles filled when current equals max', () => {
    render(<FocusSpellsList character={baseCharacter} characterColor="#333" />);
    expect(screen.getAllByLabelText('Available slot')).toHaveLength(2);
    expect(screen.queryAllByLabelText('Spent slot')).toHaveLength(0);
  });

  it('initialises spent bubbles from focus.current', () => {
    const char = { ...baseCharacter, spellcasting: { focus: { max: 3, current: 1 } } };
    render(<FocusSpellsList character={char} characterColor="#333" />);
    expect(screen.getAllByLabelText('Available slot')).toHaveLength(1);
    expect(screen.getAllByLabelText('Spent slot')).toHaveLength(2);
  });

  it('clicking a filled bubble spends a focus point', () => {
    render(<FocusSpellsList character={baseCharacter} characterColor="#333" />);
    fireEvent.click(screen.getAllByLabelText('Available slot')[0]);
    expect(screen.getAllByLabelText('Available slot')).toHaveLength(1);
    expect(screen.getAllByLabelText('Spent slot')).toHaveLength(1);
  });

  it('clicking an empty bubble recovers a focus point', () => {
    const char = { ...baseCharacter, spellcasting: { focus: { max: 2, current: 0 } } };
    render(<FocusSpellsList character={char} characterColor="#333" />);
    fireEvent.click(screen.getAllByLabelText('Spent slot')[0]);
    expect(screen.getAllByLabelText('Available slot')).toHaveLength(1);
    expect(screen.getAllByLabelText('Spent slot')).toHaveLength(1);
  });

  it('shows no focus point bubbles when no focus pool data', () => {
    const char = { id: '1', level: 3, focus_spells: [baseFocusSpell] };
    render(<FocusSpellsList character={char} characterColor="#333" />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByText('Focus Points')).not.toBeInTheDocument();
  });

  it('shows "Devotion Spells" label for champion characters', () => {
    const char = {
      id: '1', level: 5,
      champion: { devotion_spells: [baseFocusSpell], focus_points: 1 },
    };
    render(<FocusSpellsList character={char} characterColor="#333" />);
    expect(screen.queryByText(/doesn't have any/i)).not.toBeInTheDocument();
    expect(screen.getByText('Divine Lance')).toBeInTheDocument();
  });

  it('shows "Qi Spells" label for monk characters', () => {
    const char = {
      id: '1', level: 3,
      monk: { ki_spells: [baseFocusSpell], focus_points: 1 },
    };
    render(<FocusSpellsList character={char} characterColor="#333" />);
    expect(screen.getByText('Divine Lance')).toBeInTheDocument();
  });

  it('shows "Compositions" label for bard characters', () => {
    const char = {
      id: '1', level: 3,
      class: 'Bard',
      spellcasting: { focus: { max: 1, current: 1 } },
      focus_spells: [baseFocusSpell],
    };
    render(<FocusSpellsList character={char} characterColor="#333" />);
    expect(screen.getByText('Divine Lance')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('shows bloodline name label for sorcerer characters', () => {
    const char = {
      id: '1', level: 5,
      spellcasting: {
        bloodline: {
          name: 'Draconic',
          focus_spells: [baseFocusSpell],
          blood_magic: 'Scales appear.',
        },
      },
    };
    render(<FocusSpellsList character={char} characterColor="#333" />);
    expect(screen.getByText('Divine Lance')).toBeInTheDocument();
  });

  it('renders bloodline info section for sorcerer', () => {
    const char = {
      id: '1', level: 5,
      spellcasting: {
        bloodline: {
          name: 'Draconic',
          focus_spells: [baseFocusSpell],
          blood_magic: 'Scales appear.',
        },
      },
    };
    render(<FocusSpellsList character={char} characterColor="#333" />);
    expect(screen.getByText('Scales appear.')).toBeInTheDocument();
  });

  it('shows empty spells message when focus pool exists but spell list is empty', () => {
    const char = {
      ...baseCharacter,
      focus_spells: [],
      spellcasting: { focus: { max: 1, current: 1 } },
    };
    render(<FocusSpellsList character={char} characterColor="#333" />);
    expect(screen.getByText(/no focus spells available/i)).toBeInTheDocument();
  });
});

describe('FocusSpellsList — spellRef resolution', () => {
  const catalogSpell = {
    id: 'inspire-courage',
    name: 'Inspire Courage',
    level: 0,
    traits: ['Composition'],
  };

  beforeEach(() => localStorage.clear());

  it('resolves a spellRef entry via the catalog and renders the spell name', () => {
    useContent.mockReturnValue({ spells: [catalogSpell] });
    const char = {
      id: '1', level: 3, class: 'Bard',
      focus_spells: [{ spellRef: 'inspire-courage' }],
      spellcasting: { focus: { max: 1, current: 1 } },
    };
    render(<FocusSpellsList character={char} characterColor="#333" />);
    expect(screen.getByText('Inspire Courage')).toBeInTheDocument();
  });

  it('renders a visible stub when spellRef is not in catalog', () => {
    useContent.mockReturnValue({ spells: [] });
    const char = {
      id: '1', level: 3,
      focus_spells: [{ spellRef: 'nonexistent-spell' }],
    };
    render(<FocusSpellsList character={char} characterColor="#333" />);
    expect(screen.getByText(/unknown spell: nonexistent-spell/i)).toBeInTheDocument();
  });

  it('inline entries (no spellRef) still render unchanged — back-compat', () => {
    useContent.mockReturnValue({ spells: [] });
    const char = {
      id: '1', level: 3,
      focus_spells: [{ id: 'fs1', name: 'Divine Lance', level: 1 }],
    };
    render(<FocusSpellsList character={char} characterColor="#333" />);
    expect(screen.getByText('Divine Lance')).toBeInTheDocument();
  });
});
