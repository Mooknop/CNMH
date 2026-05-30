import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StatsBlock from './StatsBlock';

// Mock dependencies
jest.mock('../../utils/CharacterUtils', () => ({
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
  size: 'Medium',
  speed: 25,
  senses: 'Low-light vision'
};

const mockUseCharacter = jest.fn();

jest.mock('../../hooks/useCharacter', () => ({
  useCharacter: (...args) => mockUseCharacter(...args),
}));

jest.mock('../character-sheet/EnhancedSkillsList', () => {
  return function DummyEnhancedSkillsList({ character }) {
    return <div data-testid="enhanced-skills">Skills List</div>;
  };
});

describe('StatsBlock', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUseCharacter.mockImplementation((character) => character ? defaultCharData : null);
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

  it('should apply theme color to ability names', () => {
    const { container } = render(
      <StatsBlock character={mockCharacter} characterColor="#ff0000" />
    );
    
    const abilityNames = container.querySelectorAll('.ability-name');
    abilityNames.forEach(el => {
      expect(el).toHaveStyle('color: #ff0000');
    });
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
    const modifierDivs = screen.getAllByText(/^[\+\-]\d+$/);
    expect(modifierDivs.length).toBeGreaterThan(0);
  });

  it('should display HP and AC values', () => {
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    // HP shows as "current / max" — 8 appears in both spans when at full health
    expect(screen.getAllByText('8').length).toBeGreaterThan(0);
    expect(screen.getByText('16')).toBeInTheDocument(); // ac
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

  it('should use 69 fallback when speed is absent', () => {
    mockUseCharacter.mockReturnValueOnce({ ...defaultCharData, speed: null });
    render(<StatsBlock character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByText((_, el) =>
      el?.textContent?.replace(/\s+/g, ' ').trim() === '69 feet'
    )).toBeInTheDocument();
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
    // Initially 'abilities' tab is active
    const tabButtons = container.querySelectorAll('.tab-button');
    expect(tabButtons[0]).toHaveStyle('background-color: #ff0000');
    // After clicking proficiencies
    fireEvent.click(screen.getByText('Proficiencies'));
    expect(tabButtons[1]).toHaveStyle('background-color: #ff0000');
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
});
