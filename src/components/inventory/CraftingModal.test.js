import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CraftingModal from './CraftingModal';

jest.mock('../../utils/CharacterUtils', () => ({
  getProficiencyLabel: () => 'Trained',
  getSkillModifier: () => 5,
  formatModifier: (n) => (n >= 0 ? `+${n}` : `${n}`),
}));

jest.mock('../../utils/InventoryUtils', () => ({
  getLevelBasedDc: (level) => 15 + level,
  formatBulk: (b) => (b === 0 ? '—' : String(b)),
}));

const baseCharacter = {
  name: 'Aria',
  level: 5,
  skills: { crafting: { proficiency: 1 } },
  crafting: [],
};

describe('CraftingModal', () => {
  it('renders null when isOpen is false', () => {
    const { container } = render(
      <CraftingModal isOpen={false} onClose={jest.fn()} character={baseCharacter} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal when isOpen is true', () => {
    render(<CraftingModal isOpen={true} onClose={jest.fn()} character={baseCharacter} />);
    expect(screen.getByText('Crafting')).toBeInTheDocument();
  });

  it('shows Crafting Rules tab content by default', () => {
    render(<CraftingModal isOpen={true} onClose={jest.fn()} character={baseCharacter} />);
    expect(screen.getByText('Craft Activity')).toBeInTheDocument();
  });

  it('switches to Known Recipes tab on click', () => {
    render(<CraftingModal isOpen={true} onClose={jest.fn()} character={baseCharacter} />);
    fireEvent.click(screen.getByText(/Known Recipes/));
    expect(screen.getByText('No known crafting recipes.')).toBeInTheDocument();
    expect(screen.queryByText('Craft Activity')).toBeNull();
  });

  it('switches back to Crafting Rules tab on click', () => {
    render(<CraftingModal isOpen={true} onClose={jest.fn()} character={baseCharacter} />);
    fireEvent.click(screen.getByText(/Known Recipes/));
    fireEvent.click(screen.getByText('Crafting Rules'));
    expect(screen.getByText('Craft Activity')).toBeInTheDocument();
  });

  it('shows recipe count in Known Recipes tab button', () => {
    render(<CraftingModal isOpen={true} onClose={jest.fn()} character={baseCharacter} />);
    expect(screen.getByText(/Known Recipes \(0\)/)).toBeInTheDocument();
  });

  it('shows recipe count > 0 when character has recipes', () => {
    const char = {
      ...baseCharacter,
      crafting: [{ name: 'Healing Potion', description: 'Heals.', weight: 0, types: [] }],
    };
    render(<CraftingModal isOpen={true} onClose={jest.fn()} character={char} />);
    expect(screen.getByText(/Known Recipes \(1\)/)).toBeInTheDocument();
  });

  it('shows "No known crafting recipes" empty state when crafting is empty', () => {
    render(<CraftingModal isOpen={true} onClose={jest.fn()} character={baseCharacter} />);
    fireEvent.click(screen.getByText(/Known Recipes/));
    expect(screen.getByText('No known crafting recipes.')).toBeInTheDocument();
  });

  it('renders recipe cards when character.crafting is non-empty', () => {
    const char = {
      ...baseCharacter,
      crafting: [{ name: 'Healing Potion', description: 'A restorative draught.', weight: 0, types: [] }],
    };
    render(<CraftingModal isOpen={true} onClose={jest.fn()} character={char} />);
    fireEvent.click(screen.getByText(/Known Recipes/));
    expect(screen.getByText('Healing Potion')).toBeInTheDocument();
    expect(screen.getByText('A restorative draught.')).toBeInTheDocument();
  });

  it('renders recipe Variants section when recipe.types is non-empty', () => {
    const char = {
      ...baseCharacter,
      crafting: [
        {
          name: 'Alchemist Fire',
          description: 'Burns things.',
          weight: 0,
          types: [{ type: 'Lesser', level: 1, price: 3, effect: 'Burn.' }],
        },
      ],
    };
    render(<CraftingModal isOpen={true} onClose={jest.fn()} character={char} />);
    fireEvent.click(screen.getByText(/Known Recipes/));
    expect(screen.getByText('Variants')).toBeInTheDocument();
    expect(screen.getByText('Lesser')).toBeInTheDocument();
  });

  it('does not render Variants section when recipe.types is empty', () => {
    const char = {
      ...baseCharacter,
      crafting: [{ name: 'Simple Recipe', description: 'Simple.', weight: 0, types: [] }],
    };
    render(<CraftingModal isOpen={true} onClose={jest.fn()} character={char} />);
    fireEvent.click(screen.getByText(/Known Recipes/));
    expect(screen.queryByText('Variants')).toBeNull();
  });

  it('does not render Variants section when recipe.types is absent', () => {
    const char = {
      ...baseCharacter,
      crafting: [{ name: 'Simple Recipe', description: 'Simple.', weight: 0 }],
    };
    render(<CraftingModal isOpen={true} onClose={jest.fn()} character={char} />);
    fireEvent.click(screen.getByText(/Known Recipes/));
    expect(screen.queryByText('Variants')).toBeNull();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = jest.fn();
    const { container } = render(
      <CraftingModal isOpen={true} onClose={onClose} character={baseCharacter} />
    );
    fireEvent.click(container.querySelector('.modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not propagate click from modal body to overlay', () => {
    const onClose = jest.fn();
    const { container } = render(
      <CraftingModal isOpen={true} onClose={onClose} character={baseCharacter} />
    );
    fireEvent.click(container.querySelector('.modal-container'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses characterColor when provided', () => {
    const { container } = render(
      <CraftingModal
        isOpen={true}
        onClose={jest.fn()}
        character={baseCharacter}
        characterColor="#ff0000"
      />
    );
    expect(container.querySelector('.modal-header')).toHaveStyle(
      'background-color: #ff0000'
    );
  });

  it('uses default color when characterColor is absent', () => {
    const { container } = render(
      <CraftingModal isOpen={true} onClose={jest.fn()} character={baseCharacter} />
    );
    expect(container.querySelector('.modal-header')).toHaveStyle(
      'background-color: var(--color-primary)'
    );
  });

  it('renders proficiency label in skill stat area', () => {
    render(<CraftingModal isOpen={true} onClose={jest.fn()} character={baseCharacter} />);
    expect(screen.getByText(/Trained/)).toBeInTheDocument();
  });

  it('handles character with no skills.crafting gracefully', () => {
    const char = { ...baseCharacter, skills: {} };
    expect(() =>
      render(<CraftingModal isOpen={true} onClose={jest.fn()} character={char} />)
    ).not.toThrow();
  });

  it('handles character.crafting being undefined gracefully', () => {
    const char = { ...baseCharacter, crafting: undefined };
    expect(() =>
      render(<CraftingModal isOpen={true} onClose={jest.fn()} character={char} />)
    ).not.toThrow();
  });
});
