import React from 'react';
import { render, screen } from '@testing-library/react';
import FocusSpellsList from './FocusSpellsList';

jest.mock('../shared/CollapsibleCard', () => ({ header, children, className }) => (
  <div data-testid="spell-card" className={className}>
    <div>{header}</div>
    <div>{children}</div>
  </div>
));

jest.mock('../shared/TraitTag', () => ({ trait }) => <span>{trait}</span>);
jest.mock('../shared/ActionIcon', () => ({ actionText }) => <span>{actionText}</span>);

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
    focus: { max: 2 },
  },
  focus_spells: [baseFocusSpell],
};

describe('FocusSpellsList', () => {
  it('renders empty state when no focus spells', () => {
    render(<FocusSpellsList character={{ id: '1', level: 1 }} />);
    expect(screen.getByText(/doesn't have any focus spells/i)).toBeInTheDocument();
  });

  it('renders focus spells label and spells', () => {
    render(<FocusSpellsList character={baseCharacter} />);
    expect(screen.getByText('Focus Spells')).toBeInTheDocument();
    expect(screen.getByText('Divine Lance')).toBeInTheDocument();
  });

  it('renders focus points when available', () => {
    render(<FocusSpellsList character={baseCharacter} />);
    expect(screen.getByText('Focus Points:')).toBeInTheDocument();
    expect(document.querySelector('.focus-points-value')).toBeInTheDocument();
  });

  it('renders spell description', () => {
    render(<FocusSpellsList character={baseCharacter} />);
    expect(screen.getByText('You unleash divine energy.')).toBeInTheDocument();
  });

  it('renders spell traits', () => {
    render(<FocusSpellsList character={baseCharacter} />);
    expect(screen.getByText('divine')).toBeInTheDocument();
    expect(screen.getByText('evocation')).toBeInTheDocument();
  });

  it('renders spell range', () => {
    render(<FocusSpellsList character={baseCharacter} />);
    expect(screen.getByText('30 feet')).toBeInTheDocument();
  });

  it('shows "Devotion Spells" for champion characters', () => {
    const char = {
      ...baseCharacter,
      champion: {
        devotion_spells: [baseFocusSpell],
        focus_points: 1,
      },
      focus_spells: undefined,
      spellcasting: undefined,
    };
    render(<FocusSpellsList character={char} />);
    expect(screen.getByText('Devotion Spells')).toBeInTheDocument();
  });

  it('shows "Qi Spells" for monk characters', () => {
    const char = {
      id: '1', level: 3,
      monk: {
        ki_spells: [baseFocusSpell],
        focus_points: 1,
      },
    };
    render(<FocusSpellsList character={char} />);
    expect(screen.getByText('Qi Spells')).toBeInTheDocument();
  });

  it('shows "Compositions" for bard characters', () => {
    const char = {
      id: '1', level: 3,
      class: 'Bard',
      spellcasting: { focus: { max: 1 } },
      focus_spells: [baseFocusSpell],
    };
    render(<FocusSpellsList character={char} />);
    expect(screen.getByText('Compositions')).toBeInTheDocument();
  });

  it('shows bloodline name for sorcerer characters', () => {
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
    render(<FocusSpellsList character={char} />);
    expect(screen.getByText('Draconic Bloodline Spells')).toBeInTheDocument();
  });

  it('renders spell trigger when present', () => {
    const spellWithTrigger = { ...baseFocusSpell, trigger: 'An enemy casts a spell.' };
    const char = { ...baseCharacter, focus_spells: [spellWithTrigger] };
    render(<FocusSpellsList character={char} />);
    expect(screen.getByText('An enemy casts a spell.')).toBeInTheDocument();
  });

  it('renders heightened effects when present', () => {
    const spellWithHeightened = { ...baseFocusSpell, heightened: { '+2': 'Damage increases.' } };
    const char = { ...baseCharacter, focus_spells: [spellWithHeightened] };
    render(<FocusSpellsList character={char} />);
    expect(screen.getByText('+2:')).toBeInTheDocument();
  });

  it('renders empty focus spells list message', () => {
    const char = {
      ...baseCharacter,
      focus_spells: [],
      spellcasting: { focus: { max: 1 } },
    };
    render(<FocusSpellsList character={char} />);
    expect(screen.getByText(/No focus spells available/i)).toBeInTheDocument();
  });
});
