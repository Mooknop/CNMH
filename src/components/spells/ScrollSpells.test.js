import React from 'react';
import { render, screen } from '@testing-library/react';
import ScrollSpells from './ScrollSpells';

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

describe('ScrollSpells', () => {
  beforeEach(() => { capturedProps = {}; });

  it('renders SpellCategorySection with title "Spell Scrolls"', () => {
    render(<ScrollSpells {...baseProps} />);
    expect(screen.getByText('Spell Scrolls')).toBeInTheDocument();
  });

  it('passes containerClass "scrolls-container"', () => {
    render(<ScrollSpells {...baseProps} />);
    expect(capturedProps.containerClass).toBe('scrolls-container');
  });

  it('uses spell.id + "-scroll" via spellKeyFn', () => {
    render(<ScrollSpells {...baseProps} />);
    const spell = { id: 'xyz' };
    expect(capturedProps.spellKeyFn(spell)).toBe('xyz-scroll');
  });

  it('passes spells prop through', () => {
    const spells = [{ id: 's1', name: 'Fireball' }];
    render(<ScrollSpells {...baseProps} spells={spells} />);
    expect(capturedProps.spells).toEqual(spells);
  });
});
