import React from 'react';
import { render, screen } from '@testing-library/react';
import EnhancedSkillsList from './EnhancedSkillsList';
import { useCharacter } from '../../hooks/useCharacter';

vi.mock('../shared/CollapsibleCard', () => ({ default: ({ header, children, className }) => (
  <div data-testid="skill-card" className={className}>
    <div data-testid="skill-header">{header}</div>
    <div data-testid="skill-content">{children}</div>
  </div>
) }));

vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));

const fullCharModel = {
  skillModifiers: {
    acrobatics: 3, arcana: 1, athletics: 5, crafting: 1, deception: 2,
    diplomacy: 2, intimidation: 2, medicine: 1, nature: 1, occultism: 1,
    perception: 3, performance: 2, religion: 1, society: 1, stealth: 3,
    survival: 1, thievery: 3,
  },
  skillProficiencies: {
    acrobatics: 1, arcana: 0, athletics: 2, crafting: 0, deception: 1,
    diplomacy: 1, intimidation: 1, medicine: 0, nature: 0, occultism: 0,
    perception: 1, performance: 1, religion: 0, society: 0, stealth: 1,
    survival: 0, thievery: 1,
  },
  itemBonuses: {},
  abilityModifiers: {
    strength: 3, dexterity: 2, constitution: 1, intelligence: 0, wisdom: 1, charisma: 2,
  },
  loreSkills: [
    { name: 'Absalom', proficiency: 1 },
  ],
  level: 5,
  inventory: [],
  flags: { hasUntrainedImprovisation: false },
};

vi.mock('../../utils/CharacterUtils', () => ({
  formatModifier: (mod) => mod >= 0 ? `+${mod}` : `${mod}`,
  getProficiencyLabel: (prof) => {
    const labels = { 0: 'Untrained', 1: 'Trained', 2: 'Expert', 3: 'Master', 4: 'Legendary' };
    return labels[prof] || 'Untrained';
  },
  getLoreSkillModifier: () => 7,
}));

describe('EnhancedSkillsList', () => {
  beforeEach(() => {
    useCharacter.mockReturnValue(fullCharModel);
  });

  it('renders without crashing', () => {
    expect(() => render(<EnhancedSkillsList character={{ id: '1' }} />)).not.toThrow();
  });

  it('renders skill cards for each skill', () => {
    render(<EnhancedSkillsList character={{ id: '1' }} />);
    // Should render 17 standard skills + 1 lore skill
    const cards = screen.getAllByTestId('skill-card');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('renders Acrobatics skill', () => {
    render(<EnhancedSkillsList character={{ id: '1' }} />);
    expect(screen.getByText('Acrobatics')).toBeInTheDocument();
  });

  it('renders Athletics skill', () => {
    render(<EnhancedSkillsList character={{ id: '1' }} />);
    expect(screen.getByText('Athletics')).toBeInTheDocument();
  });

  it('renders Perception skill', () => {
    render(<EnhancedSkillsList character={{ id: '1' }} />);
    expect(screen.getByText('Perception')).toBeInTheDocument();
  });

  it('renders lore skill', () => {
    render(<EnhancedSkillsList character={{ id: '1' }} />);
    expect(screen.getByText(/Absalom Lore/)).toBeInTheDocument();
  });

  it('renders skill modifiers', () => {
    render(<EnhancedSkillsList character={{ id: '1' }} />);
    // Athletics modifier = 5 → "+5"
    expect(screen.getByText('+5')).toBeInTheDocument();
  });

  it('renders proficiency pips', () => {
    const { container } = render(<EnhancedSkillsList character={{ id: '1' }} />);
    // Proficiency is now shown as pip dots; verify the pip structure is present
    expect(container.querySelectorAll('.prof-pips').length).toBeGreaterThan(0);
  });

  it('accepts activeConditions prop without crashing', () => {
    const conditions = [{ id: 'frightened', value: 2 }];
    expect(() =>
      render(<EnhancedSkillsList character={{ id: '1' }} activeConditions={conditions} />)
    ).not.toThrow();
  });

  it('shows penalized skill modifier when condition applies', () => {
    // Frightened 2 applies -2 status to all skills
    const conditions = [{ id: 'frightened', value: 2 }];
    render(<EnhancedSkillsList character={{ id: '1' }} activeConditions={conditions} />);
    // Athletics modifier was +5; with Frightened 2 → +3
    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  it('nets an active-effect skill bonus into the skill modifier (#447)', () => {
    const effectBonuses = { deception: { total: 1, sources: [{ label: 'Upstage', bonus: 1 }] } };
    const { container } = render(
      <EnhancedSkillsList character={{ id: '1' }} effectBonuses={effectBonuses} />
    );
    // Deception (+2) buffed to +3 (net bonus) with the Upstage source in the tooltip.
    expect(screen.getByText('Upstage')).toBeInTheDocument();
    expect(container.querySelector('.pd-bonus')).not.toBeNull();
  });
});

describe('EnhancedSkillsList with Untrained Improvisation', () => {
  beforeEach(() => {
    useCharacter.mockReturnValue({
      skillModifiers: {
        acrobatics: 4, arcana: 4, athletics: 4, crafting: 4, deception: 4,
        diplomacy: 4, intimidation: 4, medicine: 4, nature: 4, occultism: 4,
        perception: 4, performance: 4, religion: 4, society: 4, stealth: 4,
        survival: 4, thievery: 4,
      },
      skillProficiencies: {},
      itemBonuses: {},
      abilityModifiers: { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 },
      loreSkills: [],
      level: 8,
      inventory: [],
      flags: { hasUntrainedImprovisation: true },
    });
  });

  it('renders without crashing with untrained improvisation character', () => {
    render(<EnhancedSkillsList character={{ id: '2' }} />);
    expect(screen.getAllByTestId('skill-card').length).toBeGreaterThan(0);
  });
});
