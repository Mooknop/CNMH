import React from 'react';
import { render, screen } from '@testing-library/react';
import SpellCategorySection from './SpellCategorySection';

vi.mock('./SpellCard', () => ({ default: ({ spell, themeColor }) => (
  <div data-testid="spell-card" data-name={spell.name}>{spell.name}</div>
) }));

vi.mock('../../utils/SpellUtils', () => ({
  filterSpellsByDefense: (spells, filter) => {
    if (!filter || filter === 'all') return spells;
    return spells.filter(s => s.defense === filter);
  },
}));

const baseSpell = (id, name) => ({ id, name, level: 1 });

describe('SpellCategorySection', () => {
  it('renders the title', () => {
    render(
      <SpellCategorySection title="Gem Spells" spells={[]} activeSpellRank="all" defenseFilter="all" />
    );
    expect(screen.getByText('Gem Spells')).toBeInTheDocument();
  });

  it('renders spell cards for each spell', () => {
    const spells = [baseSpell('s1', 'Fireball'), baseSpell('s2', 'Ice Storm')];
    render(
      <SpellCategorySection title="Scrolls" spells={spells} activeSpellRank="all" defenseFilter="all" />
    );
    expect(screen.getAllByTestId('spell-card')).toHaveLength(2);
    expect(screen.getByText('Fireball')).toBeInTheDocument();
    expect(screen.getByText('Ice Storm')).toBeInTheDocument();
  });

  it('renders empty state when no spells match filter', () => {
    const spells = [{ id: 's1', name: 'Lightning Bolt', level: 1, defense: 'reflex' }];
    render(
      <SpellCategorySection
        title="Scrolls"
        spells={spells}
        activeSpellRank="all"
        defenseFilter="fortitude"
      />
    );
    expect(screen.getByText(/No scrolls matching your current filters/i)).toBeInTheDocument();
  });

  it('renders default empty message when no active filter', () => {
    render(
      <SpellCategorySection title="Wand Spells" spells={[]} activeSpellRank="all" defenseFilter="all" />
    );
    expect(screen.getByText(/No wand spells found/i)).toBeInTheDocument();
  });

  it('renders custom emptyMessage when provided', () => {
    render(
      <SpellCategorySection
        title="Focus"
        spells={[]}
        activeSpellRank="all"
        defenseFilter="all"
        emptyMessage="No focus spells prepared."
      />
    );
    expect(screen.getByText('No focus spells prepared.')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <SpellCategorySection
        title="Gems"
        spells={[]}
        activeSpellRank="all"
        defenseFilter="all"
        description="These are gem spells."
      />
    );
    expect(screen.getByText('These are gem spells.')).toBeInTheDocument();
  });

  it('renders infoBox after spell list by default', () => {
    const { container } = render(
      <SpellCategorySection
        title="Scrolls"
        spells={[baseSpell('s1', 'Fireball')]}
        activeSpellRank="all"
        defenseFilter="all"
        infoBox={<div data-testid="info-box">Info</div>}
      />
    );
    const infoBox = container.querySelector('[data-testid="info-box"]');
    expect(infoBox).toBeInTheDocument();
  });

  it('renders infoBox before spell list when infoBoxFirst is true', () => {
    const { container } = render(
      <SpellCategorySection
        title="Scrolls"
        spells={[baseSpell('s1', 'Fireball')]}
        activeSpellRank="all"
        defenseFilter="all"
        infoBox={<div data-testid="info-box">Info</div>}
        infoBoxFirst
      />
    );
    expect(container.querySelector('[data-testid="info-box"]')).toBeInTheDocument();
  });

  it('uses custom spellKeyFn when provided', () => {
    const spellKeyFn = vi.fn((spell) => `custom-${spell.id}`);
    render(
      <SpellCategorySection
        title="Test"
        spells={[baseSpell('s1', 'Fireball')]}
        activeSpellRank="all"
        defenseFilter="all"
        spellKeyFn={spellKeyFn}
      />
    );
    expect(spellKeyFn).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });

  it('applies containerClass to outer div', () => {
    const { container } = render(
      <SpellCategorySection
        title="Test"
        spells={[]}
        activeSpellRank="all"
        defenseFilter="all"
        containerClass="my-custom-class"
      />
    );
    expect(container.querySelector('.my-custom-class')).toBeInTheDocument();
  });
});
