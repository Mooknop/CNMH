import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AnimalCompanionModal from './AnimalCompanionModal';

jest.mock('../../utils/CharacterUtils', () => ({
  getAbilityModifier: jest.fn((score) => Math.floor(((score || 10) - 10) / 2)),
  getAttackBonus: jest.fn(() => '+5/+0/-5'),
  formatModifier: jest.fn((n) => (n >= 0 ? `+${n}` : `${n}`)),
}));

const baseCharacter = { name: 'Aria', level: 5 };

const baseCompanion = {
  name: 'Rex',
  type: 'Animal',
  size: 'Medium',
  ac: 18,
  hp: 32,
  speed: 30,
  saves: { fortitude: 8, reflex: 6, will: 4 },
  abilities: { strength: 16, dexterity: 14, constitution: 14, intelligence: 2, wisdom: 10, charisma: 6 },
};

describe('AnimalCompanionModal', () => {
  it('renders null when isOpen is false', () => {
    const { container } = render(
      <AnimalCompanionModal
        isOpen={false}
        onClose={jest.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders companion name when open', () => {
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Rex')).toBeInTheDocument();
  });

  it('renders type and size', () => {
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Animal')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('renders senses when present', () => {
    const companion = { ...baseCompanion, senses: 'Low-light vision, Scent' };
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={companion}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Low-light vision, Scent')).toBeInTheDocument();
  });

  it('does not render senses when absent', () => {
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    expect(screen.queryByText('Senses:')).toBeNull();
  });

  it('renders skills section when companionData.skills is present', () => {
    const companion = { ...baseCompanion, skills: ['Athletics', 'Stealth'] };
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={companion}
        character={baseCharacter}
      />
    );
    expect(screen.getByText(/Athletics/)).toBeInTheDocument();
  });

  it('does not render skills section when absent', () => {
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    expect(screen.queryByText('Skills')).toBeNull();
  });

  it('renders strikes section when strikes is non-empty', () => {
    const companion = {
      ...baseCompanion,
      strikes: [
        { name: 'Jaws', damage: '1d8', proficiency: 2, traits: ['Finesse'] },
      ],
    };
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={companion}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Jaws')).toBeInTheDocument();
    expect(screen.getByText('Finesse')).toBeInTheDocument();
  });

  it('does not render strikes section when absent', () => {
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    expect(screen.queryByText('Strikes')).toBeNull();
  });

  it('does not render strikes section when strikes is empty array', () => {
    const companion = { ...baseCompanion, strikes: [] };
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={companion}
        character={baseCharacter}
      />
    );
    expect(screen.queryByText('Strikes')).toBeNull();
  });

  it('does not render strike traits when strike.traits is absent', () => {
    const companion = {
      ...baseCompanion,
      strikes: [{ name: 'Claws', damage: '1d6', proficiency: 2 }],
    };
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={companion}
        character={baseCharacter}
      />
    );
    expect(screen.queryByTestId('trait-tag')).toBeNull();
  });

  it('renders support benefit section when support is present', () => {
    const companion = { ...baseCompanion, support: 'Flanking bonus.' };
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={companion}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Support Benefit')).toBeInTheDocument();
    expect(screen.getByText('Flanking bonus.')).toBeInTheDocument();
  });

  it('does not render support section when absent', () => {
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    expect(screen.queryByText('Support Benefit')).toBeNull();
  });

  it('renders description when present', () => {
    const companion = { ...baseCompanion, description: 'A loyal wolf.' };
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={companion}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('A loyal wolf.')).toBeInTheDocument();
  });

  it('does not render description when absent', () => {
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    expect(screen.queryByText('Description')).toBeNull();
  });

  it('does not render Special Abilities when abilities is an object (not array)', () => {
    // abilities is an object of scores — .length is undefined, so the section does not render
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    expect(screen.queryByText('Special Abilities')).toBeNull();
  });

  it('renders Special Abilities when abilities is an array', () => {
    const companion = {
      ...baseCompanion,
      abilities: [{ name: 'Pack Attack', description: 'Gains flanking.' }],
    };
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={companion}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Special Abilities')).toBeInTheDocument();
    expect(screen.getByText('Pack Attack')).toBeInTheDocument();
  });

  it('uses characterColor when provided', () => {
    const { container } = render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
        characterColor="#cc0000"
      />
    );
    expect(container.querySelector('.animal-companion-modal-header')).toHaveStyle(
      'background-color: #cc0000'
    );
  });

  it('uses default color when characterColor is absent', () => {
    const { container } = render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={jest.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    expect(container.querySelector('.animal-companion-modal-header')).toHaveStyle(
      'background-color: var(--color-primary)'
    );
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = jest.fn();
    const { container } = render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={onClose}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    fireEvent.click(container.querySelector('.animal-companion-modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when modal body is clicked', () => {
    const onClose = jest.fn();
    const { container } = render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={onClose}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    fireEvent.click(container.querySelector('.animal-companion-modal'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
