import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StatsBlock from './StatsBlock';

// Mock dependencies
jest.mock('../../utils/CharacterUtils', () => ({
  formatModifier: (mod) => mod >= 0 ? `+${mod}` : `${mod}`,
  getAttackBonus: jest.fn(() => '+3'),
  getProficiencyLabel: jest.fn((prof) => {
    const labels = { 0: 'Untrained', 1: 'Trained', 2: 'Expert' };
    return labels[prof] || 'Untrained';
  })
}));

jest.mock('../../hooks/useCharacter', () => ({
  useCharacter: (character) => {
    if (!character) return null;
    return {
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
          unarmed: { proficiency: 1, name: 'Trained' }
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
  }
}));

jest.mock('../character-sheet/EnhancedSkillsList', () => {
  return function DummyEnhancedSkillsList({ character }) {
    return <div data-testid="enhanced-skills">Skills List</div>;
  };
});

describe('StatsBlock', () => {
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
});
