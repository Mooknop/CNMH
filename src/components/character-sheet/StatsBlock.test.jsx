import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import StatsBlock from './StatsBlock';

// Mock dependencies
vi.mock('../../utils/CharacterUtils', () => ({
  formatModifier: (mod) => mod >= 0 ? `+${mod}` : `${mod}`,
  getAttackBonus: () => '+3',
  getProficiencyBonus: (prof) => (prof || 0) * 2,
  getProficiencyLabel: (prof) => {
    const labels = { 0: 'Untrained', 1: 'Trained', 2: 'Expert' };
    return labels[prof] || 'Untrained';
  }
}));

const defaultCharData = {
  abilityModifiers: {
    strength: 2,
    dexterity: 1,
    constitution: 0,
    intelligence: -1,
    wisdom: 1,
    charisma: 2
  },
  saves: {
    fortitude: 3,
    reflex: 2,
    will: 2
  },
  proficiencies: {
    weapons: {
      unarmed: { proficiency: 1, name: 'Trained' },
      simple: { proficiency: 0 },
      martial: { proficiency: 0 },
      advanced: { proficiency: 0 },
    },
    armor: {
      unarmored: { proficiency: 1 },
      light: { proficiency: 0 },
      medium: { proficiency: 0 },
      heavy: { proficiency: 0 },
    }
  },
  classDC: 15,
  level: 1,
  maxHp: 8,
  ac: 16,
  armorClass: { value: 16, derived: true, source: 'armor', category: 'light', armorName: 'Leather' },
  size: 'Medium',
  // Speed spine (SP1, #1220): useCharacter exposes the derived object.
  speed: {
    base: 25,
    total: 25,
    derived: true,
    breakdown: [{ label: 'Base Speed', amount: 25, type: 'base' }],
  },
  // Bulk-derived encumbrance (SP3, #1222) — not over Bulk by default.
  encumbrance: { overBulk: false, auto: true, derived: false, setAuto: vi.fn() },
  totalBulk: 3,
  bulkStats: { bulkLimit: 10, encumberedThreshold: 5 },
  senses: 'Low-light vision'
};

const mockUseCharacter = vi.fn();

vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (...args) => mockUseCharacter(...args),
}));

vi.mock('../character-sheet/EnhancedSkillsList', () => ({
  default: function DummyEnhancedSkillsList({ filterAbility }) {
    return <div data-testid="enhanced-skills">Skills List ({filterAbility})</div>;
  }
}));

// Active effects + the effect catalog feed the conditional save-line hints (#338).
// Default to empty so the rest of the suite (which relied on the defensive real
// hooks returning nothing) is unaffected.
const mockUseEffects = vi.fn(() => ({ effects: [], removeEffect: vi.fn() }));
vi.mock('../../hooks/useEffects', () => ({
  useEffects: (...args) => mockUseEffects(...args),
}));
const mockUseContent = vi.fn(() => ({ effects: [] }));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: (...args) => mockUseContent(...args),
}));

describe('StatsBlock', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUseCharacter.mockImplementation((character) => character ? defaultCharData : null);
    mockUseEffects.mockReturnValue({ effects: [], removeEffect: vi.fn() });
    mockUseContent.mockReturnValue({ effects: [] });
  });

  const mockCharacter = {
    id: '1',
    name: 'Test Character',
    level: 1,
    abilities: {
      strength: 14,
      dexterity: 12,
      constitution: 10,
      intelligence: 8,
      wisdom: 12,
      charisma: 14
    },
    maxHp: 8,
    ac: 16,
    speed: 25,
    size: 'Medium'
  };

  it('should render without crashing', () => {
    expect(() =>
      render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />)
    ).not.toThrow();
  });

  it('should handle null character gracefully', () => {
    expect(() =>
      render(<StatsBlock character={null} characterColor="#7E8C9A" />)
    ).not.toThrow();
  });

  it('should display ability modifiers', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    
    expect(screen.getByText('STR')).toBeInTheDocument();
    expect(screen.getByText('DEX')).toBeInTheDocument();
    expect(screen.getByText('CON')).toBeInTheDocument();
    expect(screen.getByText('INT')).toBeInTheDocument();
    expect(screen.getByText('WIS')).toBeInTheDocument();
    expect(screen.getByText('CHA')).toBeInTheDocument();
  });

  it('shows all three saves as rank rings in the Defense panel', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);

    fireEvent.click(screen.getByRole('button', { name: 'Defense' }));
    // fort 3, CON +0, level 1 → proficiency part 3 → round((3−1)/2) = 1 → Trained.
    expect(screen.getByLabelText('Fortitude, Trained')).toHaveClass('rank-1');
    expect(screen.getByLabelText('Reflex, Trained')).toBeInTheDocument();
    expect(screen.getByLabelText('Will, Trained')).toBeInTheDocument();
    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  it('derives higher save ranks from bigger modifiers', () => {
    mockUseCharacter.mockReturnValue({
      ...defaultCharData,
      level: 4,
      // will 9, WIS +1 → proficiency part 8 → round((8−4)/2) = 2 → Expert.
      saves: { ...defaultCharData.saves, will: 9 },
    });
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByRole('button', { name: 'Defense' }));
    expect(screen.getByLabelText('Will, Expert')).toHaveClass('rank-2');
  });

  it('rims the AC core with the worn armor category rank', () => {
    mockUseCharacter.mockReturnValue({
      ...defaultCharData,
      // armorClass.category is 'light' on the default mock.
      armorProficiencies: {
        unarmored: { rank: 1, bonus: 3 },
        light: { rank: 2, bonus: 5 },
        medium: { rank: 0, bonus: 0 },
        heavy: { rank: 0, bonus: 0 },
      },
    });
    const { container } = render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(container.querySelector('.dial-center')).toHaveClass('rank-2');
  });

  it('AC core rim falls back to rank-0 without armor proficiency data', () => {
    const { container } = render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(container.querySelector('.dial-center')).toHaveClass('rank-0');
  });

  it('ability panels are skills-only (no saves or proficiency rings)', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    // STR default panel: no weapon rings, no saves.
    expect(screen.queryByText('Unarmed')).toBeNull();
    expect(screen.queryByText('Fortitude')).toBeNull();
    fireEvent.click(screen.getByLabelText('Constitution +0'));
    expect(screen.queryByText('Fortitude')).toBeNull();
    fireEvent.click(screen.getByLabelText('Dexterity +1'));
    expect(screen.queryByText('Unarmored')).toBeNull();
    expect(screen.queryByText('Reflex')).toBeNull();
  });

  it('should apply theme color via CSS custom property on the stats-block container', () => {
    const { container } = render(
      <StatsBlock character={mockCharacter} characterColor="#ff0000" />
    );
    const statsBlock = container.querySelector('.stats-block');
    expect(statsBlock).toHaveStyle('--color-theme: #ff0000');
  });

  it('should use default theme color if not provided', () => {
    expect(() =>
      render(<StatsBlock character={mockCharacter} />)
    ).not.toThrow();
  });

  it('should allow switching between tabs', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    
    // Find and click a tab button (if any exist)
    const buttons = screen.queryAllByRole('button');
    if (buttons.length > 0) {
      fireEvent.click(buttons[0]);
      // Should not throw
      expect(true).toBe(true);
    }
  });

  it('renders the dial with six ability nodes and the AC core', () => {
    const { container } = render(
      <StatsBlock character={mockCharacter} characterColor="#7E8C9A" />
    );

    expect(container.querySelector('.dial')).toBeInTheDocument();
    expect(container.querySelectorAll('.node')).toHaveLength(6);
    expect(container.querySelector('.dial-center')).toBeInTheDocument();
  });

  it('the default node panel shows the ability header and its skill cluster', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);

    // No keyAbility on the mock character → STR is the default node.
    expect(screen.getByText((_, el) =>
      el?.className === 'panel-title' && el?.textContent === 'STR · +2'
    )).toBeInTheDocument();
    // The skill cluster is EnhancedSkillsList narrowed to the node's ability.
    expect(screen.getByTestId('enhanced-skills')).toHaveTextContent('strength');
  });

  it("defaults the selected node to the character's key ability", () => {
    const { container } = render(
      <StatsBlock
        character={{ ...mockCharacter, keyAbility: 'dexterity' }}
        characterColor="#7E8C9A"
      />
    );
    expect(container.querySelector('.node--dex')).toHaveClass('sel');
    expect(screen.getByTestId('enhanced-skills')).toHaveTextContent('dexterity');
  });

  it('selecting a node swaps the panel to that ability', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);

    fireEvent.click(screen.getByLabelText('Dexterity +1'));
    expect(screen.getByText((_, el) =>
      el?.className === 'panel-title' && el?.textContent === 'DEX · +1'
    )).toBeInTheDocument();
    expect(screen.getByTestId('enhanced-skills')).toHaveTextContent('dexterity');
  });

  it('should format ability modifiers correctly', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);

    // The hook returns modifiers like +2, +1 etc
    const modifierDivs = screen.getAllByText(/^[+-]\d+$/);
    expect(modifierDivs.length).toBeGreaterThan(0);
  });

  it('shows AC in the dial core only (HP and hero points live in the masthead)', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByText('16')).toBeInTheDocument(); // core AC, single occurrence
    expect(screen.queryByLabelText(/hero point/)).toBeNull();
    expect(screen.queryByText('HP')).toBeNull();
  });

  it('shows the derived armorClass value, not the raw scalar (AC4)', () => {
    // armorClass.value (18) wins over the legacy ac scalar (16).
    mockUseCharacter.mockReturnValueOnce({
      ...defaultCharData,
      ac: 16,
      armorClass: { value: 18, derived: true, source: 'armor', category: 'heavy', armorName: 'Full Plate' },
    });
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.queryByText('16')).not.toBeInTheDocument();
  });

  it('falls back to the ac scalar when armorClass is absent (AC4)', () => {
    const noArmorClass = { ...defaultCharData };
    delete noArmorClass.armorClass;
    mockUseCharacter.mockReturnValueOnce(noArmorClass);
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByText('16')).toBeInTheDocument();
  });

  it('should display size', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('should display speed', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    // Speed chip: label + PenaltyDisplay + " ft" — match the chip's text.
    expect(screen.getByText((_, el) =>
      el?.className === 'tchip' && /25\s*ft$/.test(el?.textContent || '')
    )).toBeInTheDocument();
  });

  it('should display senses when present', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByText('Low-light vision')).toBeInTheDocument();
  });

  it('should use "teeny weeny" fallback when size is absent', () => {
    mockUseCharacter.mockReturnValueOnce({ ...defaultCharData, size: null });
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByText('teeny weeny')).toBeInTheDocument();
  });

  it('renders 0 ft when the speed detail is absent (the || 69 placeholder is dead)', () => {
    mockUseCharacter.mockReturnValueOnce({ ...defaultCharData, speed: null });
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByText((_, el) =>
      el?.className === 'tchip' && /(^|\D)0\s*ft$/.test(el?.textContent || '')
    )).toBeInTheDocument();
  });

  it('shows the derived speed total with its breakdown delta (SP1 #1220)', () => {
    mockUseCharacter.mockReturnValueOnce({
      ...defaultCharData,
      speed: {
        base: 25,
        total: 15,
        derived: true,
        breakdown: [
          { label: 'Base Speed', amount: 25, type: 'base' },
          { label: 'Encumbered', amount: -10, type: 'penalty' },
        ],
      },
    });
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    // PenaltyDisplay renders the adjusted total (15), the delta (-10), and the
    // source row in the tooltip. Match inside the speed chip — Class DC in the
    // default STR panel also reads 15.
    expect(screen.getByText((_, el) =>
      el?.className === 'tchip'
        && (el?.textContent || '').startsWith('Speed')
        && (el?.textContent || '').includes('15')
    )).toBeInTheDocument();
    // '-10' appears twice: the inline delta and the tooltip source row.
    expect(screen.getAllByText('-10').length).toBeGreaterThan(0);
    expect(screen.getByText('Encumbered')).toBeInTheDocument();
  });

  it('does not double-count an active speed effect on top of the derived total', () => {
    // Quicksilver Mutagen (+10 status speed) is active AND already folded into
    // the derived total by useCharacter. The sheet must show 35 — never 45.
    mockUseEffects.mockReturnValue({
      effects: [{ id: 'e1', effectId: 'quicksilver-mutagen' }],
      removeEffect: vi.fn(),
    });
    mockUseContent.mockReturnValue({
      effects: [{
        id: 'quicksilver-mutagen',
        name: 'Quicksilver Mutagen',
        modifiers: [{ stat: 'speed', kind: 'status', amount: 10 }],
      }],
    });
    mockUseCharacter.mockReturnValue({
      ...defaultCharData,
      speed: {
        base: 25,
        total: 35,
        derived: true,
        breakdown: [
          { label: 'Base Speed', amount: 25, type: 'base' },
          { label: 'Quicksilver Mutagen', amount: 10, type: 'bonus' },
        ],
      },
    });
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByText('35')).toBeInTheDocument();
    expect(screen.queryByText('45')).toBeNull();
  });

  it('should not display senses section when senses is absent', () => {
    mockUseCharacter.mockReturnValueOnce({ ...defaultCharData, senses: null });
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.queryByText('Senses')).toBeNull();
  });

  it('the Offense and Armor bubbles swap the panel between their groups', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByRole('button', { name: 'Offense' }));
    expect(screen.getByText('Unarmed')).toBeInTheDocument();
    expect(screen.queryByText('Unarmored')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Armor' }));
    expect(screen.getByText('Unarmored')).toBeInTheDocument();
    expect(screen.queryByText('Unarmed')).toBeNull();
  });

  it('renders the three proficiency sigils flanking the dial (Defense/Offense left, Armor right)', () => {
    const { container } = render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    const left = container.querySelector('.prof-flank--left');
    const right = container.querySelector('.prof-flank--right');
    // Each sigil is a label-less glyph button named via aria-label.
    expect(within(left).getByRole('button', { name: 'Defense' }).querySelector('svg.game-glyph')).toBeTruthy();
    expect(within(left).getByRole('button', { name: 'Offense' })).toBeInTheDocument();
    expect(within(right).getByRole('button', { name: 'Armor' })).toBeInTheDocument();
    // Labels are not rendered as visible text.
    expect(within(left).queryByText('Defense')).toBeNull();
    // Armor is not on the left flank; Defense/Offense are not on the right.
    expect(within(left).queryByRole('button', { name: 'Armor' })).toBeNull();
    expect(within(right).queryByRole('button', { name: 'Defense' })).toBeNull();
  });

  it('renders Class DC in the Defense panel', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByRole('button', { name: 'Defense' }));
    expect(screen.getByText('Class DC')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders weapon proficiency rings in the Offense panel', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByRole('button', { name: 'Offense' }));
    expect(screen.getByText('Unarmed')).toBeInTheDocument();
    expect(screen.getByText('Simple')).toBeInTheDocument();
    expect(screen.getByText('Martial')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('renders armor proficiency rings in the Armor panel', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByRole('button', { name: 'Armor' }));
    expect(screen.getByText('Unarmored')).toBeInTheDocument();
    expect(screen.getByText('Light')).toBeInTheDocument();
    // 'Medium' also appears in the size chip, use getAllByText
    expect(screen.getAllByText('Medium').length).toBeGreaterThan(0);
    expect(screen.getByText('Heavy')).toBeInTheDocument();
  });

  it('adds no Perception ring under WIS (the skill cluster already shows it)', () => {
    mockUseCharacter.mockReturnValue({
      ...defaultCharData,
      skillModifiers: { perception: 5 },
      skillProficiencies: { perception: 2 },
    });
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByLabelText('Wisdom +1'));
    // Perception lives in EnhancedSkillsList (mocked here); StatsBlock adds
    // no duplicate proficiency ring — and no Checks heading — under WIS.
    expect(screen.queryByText('Perception')).toBeNull();
    expect(screen.queryByText('Checks')).toBeNull();
  });

  it('shows the Spell Attack ring in the Offense panel for casters (S2)', () => {
    mockUseCharacter.mockReturnValue({
      ...defaultCharData,
      flags: { hasSpellcasting: true },
      spellStats: { spellAttackMod: 7, spellDC: 17 },
    });
    render(
      <StatsBlock
        character={{ ...mockCharacter, spellcasting: { proficiency: 2 } }}
        characterColor="#7E8C9A"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Offense' }));
    expect(screen.getByLabelText('Spell Attack, Expert')).toBeInTheDocument();
    expect(screen.getByText('+7')).toBeInTheDocument();
  });

  it('omits the Spell Attack ring for non-casters (S2)', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByRole('button', { name: 'Offense' }));
    expect(screen.queryByText('Spell Attack')).toBeNull();
  });

  it('should use default proficiencies when rawProficiencies has no weapons key', () => {
    mockUseCharacter.mockReturnValue({ ...defaultCharData, proficiencies: {} });
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    // Armor rings caption their rank — all default to Untrained.
    fireEvent.click(screen.getByRole('button', { name: 'Armor' }));
    expect(screen.getAllByText('Untrained').length).toBeGreaterThan(0);
  });

  it('should render class weapons section when proficiencies.weapons.class is present', () => {
    mockUseCharacter.mockReturnValue({
      ...defaultCharData,
      proficiencies: {
        ...defaultCharData.proficiencies,
        weapons: {
          ...defaultCharData.proficiencies.weapons,
          class: { proficiency: 1 },
        }
      }
    });
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByRole('button', { name: 'Offense' }));
    expect(screen.getByText('Class Weapons')).toBeInTheDocument();
  });

  it('should render finesse weapons section when proficiencies.weapons.finesse is present', () => {
    mockUseCharacter.mockReturnValue({
      ...defaultCharData,
      proficiencies: {
        ...defaultCharData.proficiencies,
        weapons: {
          ...defaultCharData.proficiencies.weapons,
          finesse: { proficiency: 2 },
        }
      }
    });
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByRole('button', { name: 'Offense' }));
    expect(screen.getByText('Finesse')).toBeInTheDocument();
  });

  it('should not render class weapons when absent', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByRole('button', { name: 'Offense' }));
    expect(screen.queryByText('Class Weapons')).toBeNull();
  });

  it('should not render finesse weapons when absent', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByRole('button', { name: 'Offense' }));
    expect(screen.queryByText('Finesse')).toBeNull();
  });

  it('selection classes: node .sel, core .sel + node .dim', () => {
    const { container } = render(
      <StatsBlock character={mockCharacter} characterColor="#ff0000" />
    );
    // Default node (STR) carries the selected class; nothing is dimmed.
    expect(container.querySelector('.node--str')).toHaveClass('sel');
    expect(container.querySelectorAll('.node.dim')).toHaveLength(0);

    // Activating the core steps the ring back: core .sel, every node .dim.
    fireEvent.click(screen.getByLabelText('Character feats and conditions'));
    expect(container.querySelector('.dial-center')).toHaveClass('sel');
    expect(container.querySelector('.node--str')).not.toHaveClass('sel');
    expect(container.querySelectorAll('.node.dim')).toHaveLength(6);

    // A proficiency bubble also steps out of the ring…
    fireEvent.click(screen.getByRole('button', { name: 'Defense' }));
    expect(screen.getByRole('button', { name: 'Defense' })).toHaveClass('sel');
    expect(container.querySelector('.dial-center')).not.toHaveClass('sel');
    expect(container.querySelectorAll('.node.dim')).toHaveLength(6);

    // …and re-selecting a node restores it.
    fireEvent.click(screen.getByLabelText('Strength +2'));
    expect(container.querySelectorAll('.node.dim')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Defense' })).not.toHaveClass('sel');
  });

  it('the core panel toggles between Feats and Conditions', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByLabelText('Character feats and conditions'));
    // Feats is the default core view
    expect(screen.getByText('No feats or abilities.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Conditions/ }));
    expect(screen.getByText('No active conditions.')).toBeInTheDocument();
    expect(screen.queryByText('No feats or abilities.')).toBeNull();
  });

  it('re-selecting a node from the core restores the ability panel', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByLabelText('Character feats and conditions'));
    fireEvent.click(screen.getByLabelText('Charisma +2'));
    expect(screen.getByText((_, el) =>
      el?.className === 'panel-title' && el?.textContent === 'CHA · +2'
    )).toBeInTheDocument();
    expect(screen.getByTestId('enhanced-skills')).toHaveTextContent('charisma');
  });

  it('renders no conditions chip in the status strip (tracker lives in the core)', () => {
    const { container } = render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(container.querySelector('.status-strip button')).toBeNull();
    expect(screen.queryByRole('button', { name: /Conditions/ })).toBeNull();
  });

  it('surfaces Dying/Wounded as status chips when present, hides them otherwise', () => {
    // No hp on the default mock → no chips.
    const { rerender } = render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.queryByText(/Dying/)).toBeNull();
    expect(screen.queryByText(/Wounded/)).toBeNull();

    mockUseCharacter.mockReturnValue({
      ...defaultCharData,
      hp: { current: 0, dying: 2, wounded: 1 },
    });
    rerender(<StatsBlock character={mockCharacter} characterColor="#FF0000" />);
    expect(screen.getByText('Dying 2')).toBeInTheDocument();
    expect(screen.getByText('Wounded 1')).toBeInTheDocument();
  });

  it('opens ConditionModal from the Add Condition chip', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByLabelText('Character feats and conditions'));
    fireEvent.click(screen.getByRole('button', { name: /^Conditions/ }));
    fireEvent.click(screen.getByText('+ Add Condition'));
    expect(screen.getByText('Condition Tracker')).toBeInTheDocument();
  });

  it('shows the toggle count and inline row after adding a condition', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByLabelText('Character feats and conditions'));
    fireEvent.click(screen.getByRole('button', { name: /^Conditions/ }));
    fireEvent.click(screen.getByText('+ Add Condition'));
    // Click Off-Guard (a toggle condition) in the browser
    fireEvent.click(screen.getByText('Off-Guard').closest('button'));
    // The toggle badge counts the active condition…
    expect(screen.getByRole('button', { name: /Conditions 1/ })).toBeInTheDocument();
    // …and the inline tracker lists it (browser card + inline row).
    expect(screen.getAllByText('Off-Guard').length).toBeGreaterThan(1);
  });

  it('removes a condition from the inline tracker', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByLabelText('Character feats and conditions'));
    fireEvent.click(screen.getByRole('button', { name: /^Conditions/ }));
    fireEvent.click(screen.getByText('+ Add Condition'));
    fireEvent.click(screen.getByText('Off-Guard').closest('button'));
    fireEvent.click(screen.getByLabelText('Remove Off-Guard'));
    // Both the inline tracker and the still-open modal show the empty state.
    expect(screen.getAllByText('No active conditions.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Conditions 1/ })).toBeNull();
  });

  it('applies condition penalty to AC when condition is active', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    // Add Off-Guard (-2 circumstance to AC) via the core Conditions view
    fireEvent.click(screen.getByLabelText('Character feats and conditions'));
    fireEvent.click(screen.getByRole('button', { name: /^Conditions/ }));
    fireEvent.click(screen.getByText('+ Add Condition'));
    fireEvent.click(screen.getByText('Off-Guard').closest('button'));
    // AC was 16, Off-Guard applies -2 → the dial core shows 14
    expect(screen.getByText('14')).toBeInTheDocument();
  });

  describe('raised shield', () => {
    const heldShield = {
      uid: 'shield-1',
      name: 'Steel Shield',
      state: 'held1',
      shield: { bonus: 2, hardness: 5, hp: 20, brokenThreshold: 10 },
    };
    const withShield = (extra = {}) => ({ ...defaultCharData, inventory: [heldShield], ...extra });

    it('un-raised shield does not change AC (base AC excludes the shield)', () => {
      mockUseCharacter.mockReturnValue(withShield());
      render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
      // AC still 16 — identical to a character holding no shield.
      expect(screen.getAllByText('16').length).toBeGreaterThan(0);
      expect(screen.queryByText('18')).toBeNull();
    });

    it('raised shield adds its circumstance bonus to AC', () => {
      localStorage.setItem('cnmh_shieldraise_1', JSON.stringify({ raised: true, uid: 'shield-1', ts: 1 }));
      mockUseCharacter.mockReturnValue(withShield());
      render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
      // 16 + 2 (Raised Shield circumstance) = 18.
      expect(screen.getAllByText('18').length).toBeGreaterThan(0);
    });

    it('a broken raised shield grants no bonus', () => {
      localStorage.setItem('cnmh_shieldraise_1', JSON.stringify({ raised: true, uid: 'shield-1', ts: 1 }));
      mockUseCharacter.mockReturnValue(withShield({
        inventory: [{ ...heldShield, shield: { bonus: 2, hardness: 5, hp: 10, brokenThreshold: 10 } }],
      }));
      render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
      expect(screen.getAllByText('16').length).toBeGreaterThan(0);
      expect(screen.queryByText('18')).toBeNull();
    });
    // Stacking of the raised shield with another circumstance AC bonus
    // (Take Cover / Shield cantrip) — only the highest applies — is unit-tested
    // directly against bestOfKind in EffectUtils.test.js.
  });

  describe('kinetic aura badge (#228)', () => {
    const kineticist = {
      ...mockCharacter,
      feats: [{
        name: 'Kineticist Dedication',
        actions: [{ name: 'Channel Elements', traits: ['Aura', 'Kineticist'] }],
      }],
    };

    it('non-kineticists render no aura row', () => {
      render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
      expect(screen.queryByText('Kinetic Aura')).toBeNull();
    });

    it('a kineticist shows the row, Inactive by default, no Dismiss', () => {
      render(<StatsBlock character={kineticist} characterColor="#7E8C9A" />);
      expect(screen.getByText('Kinetic Aura')).toBeInTheDocument();
      expect(screen.getByText('Inactive')).toBeInTheDocument();
      expect(screen.queryByLabelText('Dismiss kinetic aura')).toBeNull();
    });

    it('an active aura shows the pill and Dismiss deactivates it', () => {
      localStorage.setItem('cnmh_aura_1', JSON.stringify({ active: true, ts: 1 }));
      render(<StatsBlock character={kineticist} characterColor="#7E8C9A" />);
      expect(screen.getByText('◈ Active')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('Dismiss kinetic aura'));
      expect(screen.getByText('Inactive')).toBeInTheDocument();
      expect(screen.queryByText('◈ Active')).toBeNull();
    });
  });

  describe('Bulk-derived encumbrance (SP3 #1222)', () => {
    const encumberedData = {
      ...defaultCharData,
      encumbrance: { overBulk: true, auto: true, derived: true, setAuto: vi.fn() },
      totalBulk: 8,
      speed: {
        base: 25,
        total: 15,
        derived: true,
        breakdown: [
          { label: 'Base Speed', amount: 25, type: 'base' },
          { label: 'Encumbered', amount: -10, type: 'penalty' },
        ],
      },
    };

    it('derived Encumbered + Clumsy raise the toggle count and render as auto rows', () => {
      mockUseCharacter.mockReturnValue(encumberedData);
      render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
      fireEvent.click(screen.getByLabelText('Character feats and conditions'));
      // The toggle badge counts the two derived conditions.
      fireEvent.click(screen.getByRole('button', { name: /Conditions 2/ }));
      // Both derived rows carry the auto tag and no remove control.
      expect(screen.getAllByText('auto')).toHaveLength(2);
      expect(screen.queryByLabelText(/^Remove /)).toBeNull();
    });

    it('the modal exposes the auto-derive toggle wired to setAuto', () => {
      mockUseCharacter.mockReturnValue(encumberedData);
      render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
      fireEvent.click(screen.getByLabelText('Character feats and conditions'));
      fireEvent.click(screen.getByRole('button', { name: /^Conditions/ }));
      fireEvent.click(screen.getByText('+ Add Condition'));
      fireEvent.click(screen.getByLabelText('Derive Encumbered from carried Bulk'));
      expect(encumberedData.encumbrance.setAuto).toHaveBeenCalledWith(false);
    });

    it('no derived rows when under the threshold', () => {
      render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
      fireEvent.click(screen.getByLabelText('Character feats and conditions'));
      fireEvent.click(screen.getByRole('button', { name: /^Conditions/ }));
      expect(screen.getByText('No active conditions.')).toBeInTheDocument();
      expect(screen.queryByText('auto')).toBeNull();
    });
  });

  describe('conditional effect modifier hints on saves (#338)', () => {
    it('shows a "vs" hint under the relevant save without changing the netted number', () => {
      mockUseEffects.mockReturnValue({ effects: [{ id: 'e1', effectId: 'antidote' }], removeEffect: vi.fn() });
      mockUseContent.mockReturnValue({
        effects: [{ id: 'antidote', name: 'Antidote', modifiers: [{ stat: 'fort', kind: 'item', amount: 2, vs: 'poison' }] }],
      });
      render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
      // Fortitude lives in the Defense panel now; the hint rides its ring.
      fireEvent.click(screen.getByRole('button', { name: 'Defense' }));
      // Hint text appears…
      expect(screen.getByText(/vs poison/)).toBeInTheDocument();
      expect(screen.getByText(/Antidote/)).toBeInTheDocument();
      // …and the Reflex/Will lines get no spurious hint.
      expect(screen.queryByText(/vs electricity/)).toBeNull();
    });

    it('shows no hint when there are no conditional modifiers', () => {
      render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
      expect(screen.queryByText(/ vs /)).toBeNull();
    });
  });
});
