import React from 'react';
import { render, screen } from '@testing-library/react';
import WandSpells from './WandSpells';

let capturedProps = {};

jest.mock('./SpellCategorySection', () => {
  return function DummySpellCategorySection(props) {
    capturedProps = props;
    return <div data-testid="spell-category-section"><span>{props.title}</span></div>;
  };
});

const baseProps = {
  spells: [],
  themeColor: '#4a90d9',
  characterLevel: 5,
  defenseFilter: 'all',
  activeSpellRank: 'all',
};

describe('WandSpells', () => {
  beforeEach(() => { capturedProps = {}; });

  it('renders SpellCategorySection with title "Wands"', () => {
    render(<WandSpells {...baseProps} />);
    expect(screen.getByText('Wands')).toBeInTheDocument();
  });

  it('passes WandInfoBox as infoBox', () => {
    render(<WandSpells {...baseProps} />);
    expect(capturedProps.infoBox).not.toBeNull();
  });

  it('uses spell.id + "-wand" as key via spellKeyFn', () => {
    render(<WandSpells {...baseProps} />);
    const spell = { id: 'abc', name: 'Magic Missile' };
    expect(capturedProps.spellKeyFn(spell)).toBe('abc-wand');
  });

  it('passes fromWand: true via spellPropsFn', () => {
    render(<WandSpells {...baseProps} />);
    const spell = { id: 'abc', name: 'Magic Missile' };
    expect(capturedProps.spellPropsFn(spell).fromWand).toBe(true);
  });

  it('uses spell.wandName when present via spellPropsFn', () => {
    render(<WandSpells {...baseProps} />);
    const spell = { id: 'abc', wandName: 'Wand of Fire' };
    expect(capturedProps.spellPropsFn(spell).wandName).toBe('Wand of Fire');
  });

  it('defaults wandName to "Wand" when spell.wandName is absent', () => {
    render(<WandSpells {...baseProps} />);
    const spell = { id: 'abc' };
    expect(capturedProps.spellPropsFn(spell).wandName).toBe('Wand');
  });
});
