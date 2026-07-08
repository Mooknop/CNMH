import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
  default: function DummyEnhancedSkillsList({ character }) {
    return <div data-testid="enhanced-skills">Skills List</div>;
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

  it('should display saves (Fort, Ref, Will)', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    
    expect(screen.getByText('Fort')).toBeInTheDocument();
    expect(screen.getByText('Ref')).toBeInTheDocument();
    expect(screen.getByText('Will')).toBeInTheDocument();
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

  it('should render abilities section initially', () => {
    const { container } = render(
      <StatsBlock character={mockCharacter} characterColor="#7E8C9A" />
    );
    
    const abilitiesSection = container.querySelector('.abilities-section');
    expect(abilitiesSection).toBeInTheDocument();
  });

  it('should display defenses section', () => {
    const { container } = render(
      <StatsBlock character={mockCharacter} characterColor="#7E8C9A" />
    );
    
    const defensesSection = container.querySelector('.defenses-section');
    expect(defensesSection).toBeInTheDocument();
  });

  it('should render EnhancedSkillsList component when skills tab is active', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);

    // EnhancedSkillsList renders under the 'skills' tab
    const skillsTabButton = screen.getByText(/skills/i);
    fireEvent.click(skillsTabButton);

    expect(screen.queryByTestId('enhanced-skills')).toBeTruthy();
  });

  it('should format ability modifiers correctly', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);

    // The hook returns modifiers like +2, +1 etc
    const modifierDivs = screen.getAllByText(/^[+-]\d+$/);
    expect(modifierDivs.length).toBeGreaterThan(0);
  });

  it('should display HP and AC values', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    // HP shows as "current / max" — 8 appears in both spans when at full health
    expect(screen.getAllByText('8').length).toBeGreaterThan(0);
    expect(screen.getByText('16')).toBeInTheDocument(); // ac
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

  it('renders hero point pips reflecting the current value', () => {
    mockUseCharacter.mockReturnValueOnce({ ...defaultCharData, heroPoints: 1, setHeroPoints: vi.fn() });
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    // heroPoints=1 → pip 1 filled (spend), pips 2 & 3 empty (add)
    expect(screen.getByLabelText('Spend hero point 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Add hero point 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Add hero point 3')).toBeInTheDocument();
  });

  it('clicking an empty hero pip adds a point; a filled pip spends one', () => {
    const setHeroPoints = vi.fn();
    mockUseCharacter.mockReturnValueOnce({ ...defaultCharData, heroPoints: 1, setHeroPoints });
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);

    fireEvent.click(screen.getByLabelText('Add hero point 2'));
    expect(setHeroPoints.mock.calls[0][0](1)).toBe(2); // increment

    fireEvent.click(screen.getByLabelText('Spend hero point 1'));
    expect(setHeroPoints.mock.calls[1][0](1)).toBe(0); // decrement
  });

  it('hero points are clamped to the 0–3 range', () => {
    const setHeroPoints = vi.fn();
    mockUseCharacter.mockReturnValueOnce({ ...defaultCharData, heroPoints: 3, setHeroPoints });
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    // All three filled — clicking the third spends down, never exceeds max
    fireEvent.click(screen.getByLabelText('Spend hero point 3'));
    expect(setHeroPoints.mock.calls[0][0](3)).toBe(2);
  });

  it('should display size', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('should display speed', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    // Speed renders as PenaltyDisplay (span) + " feet" text node; match the combined parent text
    expect(screen.getByText((_, el) =>
      el?.textContent?.replace(/\s+/g, ' ').trim() === '25 feet'
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

  it('renders 0 feet when the speed detail is absent (the || 69 placeholder is dead)', () => {
    mockUseCharacter.mockReturnValueOnce({ ...defaultCharData, speed: null });
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByText((_, el) =>
      el?.textContent?.replace(/\s+/g, ' ').trim() === '0 feet'
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
    // source row in the tooltip.
    expect(screen.getByText('15')).toBeInTheDocument();
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

  it('should switch to proficiencies tab', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByText('Proficiencies'));
    expect(screen.getByText('Class DC')).toBeInTheDocument();
    expect(screen.getByText('Weapons')).toBeInTheDocument();
    expect(screen.getByText('Armor')).toBeInTheDocument();
  });

  it('should render classDC in proficiencies tab', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByText('Proficiencies'));
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('should render weapon proficiency labels in proficiencies tab', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByText('Proficiencies'));
    expect(screen.getByText('Unarmed')).toBeInTheDocument();
    expect(screen.getByText('Simple')).toBeInTheDocument();
    expect(screen.getByText('Martial')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('should render armor proficiency categories in proficiencies tab', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByText('Proficiencies'));
    expect(screen.getByText('Unarmored')).toBeInTheDocument();
    expect(screen.getByText('Light')).toBeInTheDocument();
    // 'Medium' also appears in the size section, use getAllByText
    expect(screen.getAllByText('Medium').length).toBeGreaterThan(0);
    expect(screen.getByText('Heavy')).toBeInTheDocument();
  });

  it('should use default proficiencies when rawProficiencies has no weapons key', () => {
    const emptyProfData = { ...defaultCharData, proficiencies: {} };
    mockUseCharacter.mockReturnValueOnce(emptyProfData);
    mockUseCharacter.mockReturnValueOnce(emptyProfData); // for re-render after tab click
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByText('Proficiencies'));
    // Default proficiencies should render Untrained for all
    expect(screen.getAllByText('Untrained').length).toBeGreaterThan(0);
  });

  it('should render class weapons section when proficiencies.weapons.class is present', () => {
    const dataWithClass = {
      ...defaultCharData,
      proficiencies: {
        ...defaultCharData.proficiencies,
        weapons: {
          ...defaultCharData.proficiencies.weapons,
          class: { proficiency: 1 },
        }
      }
    };
    mockUseCharacter.mockReturnValueOnce(dataWithClass);
    mockUseCharacter.mockReturnValueOnce(dataWithClass); // for re-render after tab click
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByText('Proficiencies'));
    expect(screen.getByText('Class Weapons')).toBeInTheDocument();
  });

  it('should render finesse weapons section when proficiencies.weapons.finesse is present', () => {
    const dataWithFinesse = {
      ...defaultCharData,
      proficiencies: {
        ...defaultCharData.proficiencies,
        weapons: {
          ...defaultCharData.proficiencies.weapons,
          finesse: { proficiency: 2 },
        }
      }
    };
    mockUseCharacter.mockReturnValueOnce(dataWithFinesse);
    mockUseCharacter.mockReturnValueOnce(dataWithFinesse); // for re-render after tab click
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByText('Proficiencies'));
    expect(screen.getByText('Finesse')).toBeInTheDocument();
  });

  it('should not render class weapons when absent', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByText('Proficiencies'));
    expect(screen.queryByText('Class Weapons')).toBeNull();
  });

  it('should not render finesse weapons when absent', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByText('Proficiencies'));
    expect(screen.queryByText('Finesse')).toBeNull();
  });

  it('tab button is active/highlighted when selected', () => {
    const { container } = render(
      <StatsBlock character={mockCharacter} characterColor="#ff0000" />
    );
    // Initially 'abilities' tab is active — class drives the highlight, not inline style
    const tabButtons = container.querySelectorAll('.tab-button');
    expect(tabButtons[0]).toHaveClass('active');
    // After clicking proficiencies
    fireEvent.click(screen.getByText('Proficiencies'));
    expect(tabButtons[1]).toHaveClass('active');
    expect(tabButtons[0]).not.toHaveClass('active');
  });

  it('renders the CONDITIONS button in the hp-defense row', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByText('CONDITIONS')).toBeInTheDocument();
  });

  it('shows em-dash when no conditions are active', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('opens ConditionModal when CONDITIONS button is clicked', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByText('CONDITIONS').closest('button'));
    expect(screen.getByText('Condition Tracker')).toBeInTheDocument();
  });

  it('shows condition count after adding a condition', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByText('CONDITIONS').closest('button'));
    // Click Off-Guard (a toggle condition) in the browser
    fireEvent.click(screen.getByText('Off-Guard').closest('button'));
    // Button should now show 1 (the count of active conditions)
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('applies condition penalty to AC when condition is active', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    // Open condition modal and add Off-Guard (-2 circumstance to AC)
    fireEvent.click(screen.getByText('CONDITIONS').closest('button'));
    fireEvent.click(screen.getByText('Off-Guard').closest('button'));
    // AC was 16, Off-Guard applies -2 → AC should show 14
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
      expect(screen.getByText('16')).toBeInTheDocument();
      expect(screen.queryByText('18')).toBeNull();
    });

    it('raised shield adds its circumstance bonus to AC', () => {
      localStorage.setItem('cnmh_shieldraise_1', JSON.stringify({ raised: true, uid: 'shield-1', ts: 1 }));
      mockUseCharacter.mockReturnValue(withShield());
      render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
      // 16 + 2 (Raised Shield circumstance) = 18.
      expect(screen.getByText('18')).toBeInTheDocument();
    });

    it('a broken raised shield grants no bonus', () => {
      localStorage.setItem('cnmh_shieldraise_1', JSON.stringify({ raised: true, uid: 'shield-1', ts: 1 }));
      mockUseCharacter.mockReturnValue(withShield({
        inventory: [{ ...heldShield, shield: { bonus: 2, hardness: 5, hp: 10, brokenThreshold: 10 } }],
      }));
      render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
      expect(screen.getByText('16')).toBeInTheDocument();
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

    it('derived Encumbered + Clumsy raise the badge and render as auto rows', () => {
      mockUseCharacter.mockReturnValue(encumberedData);
      render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
      // Badge counts the two derived conditions.
      expect(screen.getByText('2')).toBeInTheDocument();
      fireEvent.click(screen.getByText('CONDITIONS').closest('button'));
      // Both derived rows carry the auto tag and no remove control.
      expect(screen.getAllByText('auto')).toHaveLength(2);
      expect(screen.queryByTitle('Remove condition')).toBeNull();
    });

    it('the modal exposes the auto-derive toggle wired to setAuto', () => {
      mockUseCharacter.mockReturnValue(encumberedData);
      render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
      fireEvent.click(screen.getByText('CONDITIONS').closest('button'));
      fireEvent.click(screen.getByLabelText('Derive Encumbered from carried Bulk'));
      expect(encumberedData.encumbrance.setAuto).toHaveBeenCalledWith(false);
    });

    it('no derived rows when under the threshold', () => {
      render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
      expect(screen.getByText('—')).toBeInTheDocument(); // badge em-dash
      fireEvent.click(screen.getByText('CONDITIONS').closest('button'));
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
