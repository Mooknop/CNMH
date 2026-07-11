import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EnhancedSkillsList from './EnhancedSkillsList';
import { useCharacter } from '../../hooks/useCharacter';
import { useEffects } from '../../hooks/useEffects';
import { useContent } from '../../contexts/ContentContext';

vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));
vi.mock('../../hooks/useEffects', () => ({ useEffects: vi.fn(() => ({ effects: [] })) }));
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn(() => ({ effects: [] })) }));

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
    useEffects.mockReturnValue({ effects: [] });
    useContent.mockReturnValue({ effects: [] });
  });

  it('renders without crashing', () => {
    expect(() => render(<EnhancedSkillsList character={{ id: '1' }} />)).not.toThrow();
  });

  it('renders a rank-ring snode for every skill + lore (17 + 1)', () => {
    const { container } = render(<EnhancedSkillsList character={{ id: '1' }} />);
    expect(container.querySelectorAll('.snode')).toHaveLength(18);
  });

  it('narrows to one ability with filterAbility', () => {
    const { container } = render(
      <EnhancedSkillsList character={{ id: '1' }} filterAbility="dexterity" />
    );
    // DEX governs Acrobatics, Stealth, Thievery — and no lore rides along.
    expect(container.querySelectorAll('.snode')).toHaveLength(3);
    expect(screen.getByText('Acrobatics')).toBeInTheDocument();
    expect(screen.queryByText(/Absalom Lore/)).toBeNull();
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

  it('routes proficiency rank into the ring class (rank → ring color)', () => {
    const { container } = render(<EnhancedSkillsList character={{ id: '1' }} />);
    // Athletics is Expert (rank 2); its snode carries rank-2.
    const athletics = [...container.querySelectorAll('.snode')]
      .find((n) => n.textContent.includes('Athletics'));
    expect(athletics).toHaveClass('rank-2');
    // Arcana is Untrained (rank 0).
    const arcana = [...container.querySelectorAll('.snode')]
      .find((n) => n.textContent.includes('Arcana'));
    expect(arcana).toHaveClass('rank-0');
  });

  it('pressing a snode opens the detail strip with the skill actions', () => {
    const { container } = render(<EnhancedSkillsList character={{ id: '1' }} />);
    expect(container.querySelector('.snode-detail')).toBeNull();

    fireEvent.click(screen.getByLabelText('Stealth, Trained'));
    expect(container.querySelector('.snode-detail')).toBeInTheDocument();
    expect(screen.getByText('Hide')).toBeInTheDocument();
    expect(screen.getByText('Sneak')).toBeInTheDocument();

    // Pressing again closes it.
    fireEvent.click(screen.getByLabelText('Stealth, Trained'));
    expect(container.querySelector('.snode-detail')).toBeNull();
  });

  it('a lore snode opens a meta-only detail strip', () => {
    const { container } = render(<EnhancedSkillsList character={{ id: '1' }} />);
    fireEvent.click(screen.getByLabelText('Absalom Lore, Trained'));
    expect(container.querySelector('.snode-detail')).toBeInTheDocument();
    expect(screen.getByText(/Intelligence · Trained/)).toBeInTheDocument();
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

  describe('conditional skill/perception modifier hints (#510)', () => {
    const hintTexts = (container) =>
      [...container.querySelectorAll('.skill-conditional-hint')].map((h) => h.textContent);

    it('renders a hint only on the skill(s) the vs-modifier targets', () => {
      // Gecko Potion: +1 vs Climb (Athletics) and +1 vs Palm an Object (Thievery).
      const gecko = { id: 'gecko', name: 'Gecko Potion', modifiers: [
        { stat: 'athletics', kind: 'item', amount: 1, vs: 'Climb' },
        { stat: 'thievery',  kind: 'item', amount: 1, vs: 'Palm an Object' },
      ] };
      useEffects.mockReturnValue({ effects: [{ effectId: 'gecko' }] });
      useContent.mockReturnValue({ effects: [gecko] });
      const { container } = render(<EnhancedSkillsList character={{ id: '1' }} />);
      const hints = hintTexts(container);
      // Exactly the two targeted skills get a hint — not every card.
      expect(hints).toHaveLength(2);
      expect(hints.some((t) => /\+1 vs Climb.*Gecko Potion/.test(t))).toBe(true);
      expect(hints.some((t) => /\+1 vs Palm an Object.*Gecko Potion/.test(t))).toBe(true);
    });

    it('renders a conditional perception hint', () => {
      const eagle = { id: 'eagle', name: 'Eagle-eye Elixir', modifiers: [
        { stat: 'perception', kind: 'item', amount: 2, vs: 'find secret doors and traps' },
      ] };
      useEffects.mockReturnValue({ effects: [{ effectId: 'eagle' }] });
      useContent.mockReturnValue({ effects: [eagle] });
      const { container } = render(<EnhancedSkillsList character={{ id: '1' }} />);
      const hints = hintTexts(container);
      expect(hints).toHaveLength(1);
      expect(hints[0]).toMatch(/\+2 vs find secret doors and traps.*Eagle-eye Elixir/);
    });

    it('renders no hint when the actor has no conditional modifiers', () => {
      const { container } = render(<EnhancedSkillsList character={{ id: '1' }} />);
      expect(container.querySelectorAll('.skill-conditional-hint')).toHaveLength(0);
    });
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
    const { container } = render(<EnhancedSkillsList character={{ id: '2' }} />);
    expect(container.querySelectorAll('.snode').length).toBeGreaterThan(0);
    expect(screen.getByText(/Untrained Improvisation/)).toBeInTheDocument();
  });
});
