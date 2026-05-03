import React from 'react';
import { render, screen } from '@testing-library/react';
import GemSpells from './GemSpells';

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

describe('GemSpells', () => {
  beforeEach(() => { capturedProps = {}; });

  it('renders SpellCategorySection with title "Spell Gems"', () => {
    render(<GemSpells {...baseProps} />);
    expect(screen.getByText('Spell Gems')).toBeInTheDocument();
  });

  it('passes infoBoxFirst prop as true', () => {
    render(<GemSpells {...baseProps} />);
    expect(capturedProps.infoBoxFirst).toBe(true);
  });

  it('passes GemInfoBox as infoBox', () => {
    render(<GemSpells {...baseProps} />);
    expect(capturedProps.infoBox).not.toBeNull();
  });

  it('uses spell.id + "-gem" via spellKeyFn', () => {
    render(<GemSpells {...baseProps} />);
    const spell = { id: 'g1' };
    expect(capturedProps.spellKeyFn(spell)).toBe('g1-gem');
  });

  it('passes containerClass "gems-container"', () => {
    render(<GemSpells {...baseProps} />);
    expect(capturedProps.containerClass).toBe('gems-container');
  });
});
