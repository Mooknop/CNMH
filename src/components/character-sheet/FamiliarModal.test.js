import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FamiliarModal from './FamiliarModal';

const baseCharacter = {
  name: 'Aria',
  saves: { fortitude: 8, reflex: 6, will: 5 },
};

const baseFamiliar = {
  name: 'Whiskers',
  type: 'Cat',
  size: 'Tiny',
  ac: 16,
  hp: 5,
  speed: '25 feet',
};

describe('FamiliarModal', () => {
  it('renders null when isOpen is false', () => {
    const { container } = render(
      <FamiliarModal
        isOpen={false}
        onClose={jest.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders familiar name when open', () => {
    render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Whiskers')).toBeInTheDocument();
  });

  it('renders type and size', () => {
    render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Cat')).toBeInTheDocument();
    expect(screen.getByText('Tiny')).toBeInTheDocument();
  });

  it('renders traits when familiarData.traits is present', () => {
    const familiar = { ...baseFamiliar, traits: ['Animal', 'Minion'] };
    render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={familiar}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Animal, Minion')).toBeInTheDocument();
  });

  it('does not render traits section when familiarData.traits is absent', () => {
    render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    expect(screen.queryByText('Traits:')).toBeNull();
  });

  it('renders skills section when familiarData.skills is present', () => {
    const familiar = { ...baseFamiliar, skills: ['Acrobatics', 'Stealth'] };
    render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={familiar}
        character={baseCharacter}
      />
    );
    expect(screen.getByText(/Acrobatics/)).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
  });

  it('does not render skills section when familiarData.skills is absent', () => {
    render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    expect(screen.queryByText('Skills')).toBeNull();
  });

  it('renders senses section when familiarData.senses is present', () => {
    const familiar = { ...baseFamiliar, senses: ['Low-light vision', 'Scent'] };
    render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={familiar}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Senses')).toBeInTheDocument();
    expect(screen.getByText(/Low-light vision/)).toBeInTheDocument();
  });

  it('does not render senses section when familiarData.senses is absent', () => {
    render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    expect(screen.queryByText('Senses')).toBeNull();
  });

  it('renders communication when familiarData.communication is present', () => {
    const familiar = { ...baseFamiliar, communication: 'Speech (Common)' };
    render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={familiar}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Communication')).toBeInTheDocument();
    expect(screen.getByText('Speech (Common)')).toBeInTheDocument();
  });

  it('does not render communication when absent', () => {
    render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    expect(screen.queryByText('Communication')).toBeNull();
  });

  it('renders familiar abilities when familiarData.abilities is present', () => {
    const familiar = {
      ...baseFamiliar,
      abilities: [{ name: 'Darkvision', description: 'See in dark.' }],
    };
    render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={familiar}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Familiar Abilities')).toBeInTheDocument();
    expect(screen.getByText('Darkvision')).toBeInTheDocument();
    expect(screen.getByText('See in dark.')).toBeInTheDocument();
  });

  it('does not render abilities section when familiarData.abilities is absent', () => {
    render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    expect(screen.queryByText('Familiar Abilities')).toBeNull();
  });

  it('renders description when present', () => {
    const familiar = { ...baseFamiliar, description: 'A sleek grey cat.' };
    render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={familiar}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('A sleek grey cat.')).toBeInTheDocument();
  });

  it('does not render description section when absent', () => {
    render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    expect(screen.queryByText('Description')).toBeNull();
  });

  it('shows character saves (fortitude, reflex, will)', () => {
    render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('+8')).toBeInTheDocument();
    expect(screen.getByText('+6')).toBeInTheDocument();
    expect(screen.getByText('+5')).toBeInTheDocument();
  });

  it('uses characterColor when provided', () => {
    const { container } = render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
        characterColor="#00cc99"
      />
    );
    expect(container.querySelector('.familiar-modal-header')).toHaveStyle(
      'background-color: #00cc99'
    );
  });

  it('uses default color when characterColor is absent', () => {
    const { container } = render(
      <FamiliarModal
        isOpen={true}
        onClose={jest.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    expect(container.querySelector('.familiar-modal-header')).toHaveStyle(
      'background-color: var(--color-primary)'
    );
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = jest.fn();
    const { container } = render(
      <FamiliarModal
        isOpen={true}
        onClose={onClose}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    fireEvent.click(container.querySelector('.familiar-modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when modal body is clicked', () => {
    const onClose = jest.fn();
    const { container } = render(
      <FamiliarModal
        isOpen={true}
        onClose={onClose}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    fireEvent.click(container.querySelector('.familiar-modal'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
