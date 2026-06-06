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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
        characterColor="#00cc99"
      />
    );
    const modalContainer = container.querySelector('.modal-container');
    expect(modalContainer.style.getPropertyValue('--color-theme')).toBe('#00cc99');
    expect(container.querySelector('.modal-header--themed')).toBeInTheDocument();
  });

  it('uses default color when characterColor is absent', () => {
    const { container } = render(
      <FamiliarModal
        isOpen={true}
        onClose={vi.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    const modalContainer = container.querySelector('.modal-container');
    expect(modalContainer.style.getPropertyValue('--color-theme')).toBe('var(--color-primary)');
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <FamiliarModal
        isOpen={true}
        onClose={onClose}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    fireEvent.click(container.querySelector('.modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when modal body is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <FamiliarModal
        isOpen={true}
        onClose={onClose}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    fireEvent.click(container.querySelector('.modal-container'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders the Conditions button', () => {
    render(
      <FamiliarModal
        isOpen={true}
        onClose={vi.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Conditions')).toBeInTheDocument();
  });

  it('shows em-dash when no conditions are active', () => {
    render(
      <FamiliarModal
        isOpen={true}
        onClose={vi.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('opens ConditionModal when Conditions button is clicked', () => {
    render(
      <FamiliarModal
        isOpen={true}
        onClose={vi.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    fireEvent.click(screen.getByText('Conditions').closest('button'));
    expect(screen.getByText('Condition Tracker')).toBeInTheDocument();
  });

  it('shows condition count after adding a condition', () => {
    render(
      <FamiliarModal
        isOpen={true}
        onClose={vi.fn()}
        familiar={baseFamiliar}
        character={baseCharacter}
      />
    );
    fireEvent.click(screen.getByText('Conditions').closest('button'));
    fireEvent.click(screen.getByText('Off-Guard').closest('button'));
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('renders entity image when familiar.image is set', () => {
    const familiar = { ...baseFamiliar, image: 'img_familiar.jpg' };
    const { container } = render(
      <FamiliarModal isOpen={true} onClose={vi.fn()} familiar={familiar} character={baseCharacter} />
    );
    const img = container.querySelector('.entity-image');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', '/api/images/img_familiar.jpg');
  });

  it('does not render entity image when familiar.image is absent', () => {
    const { container } = render(
      <FamiliarModal isOpen={true} onClose={vi.fn()} familiar={baseFamiliar} character={baseCharacter} />
    );
    expect(container.querySelector('.entity-image')).toBeNull();
  });
});
