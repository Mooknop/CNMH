import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AnimalCompanionModal from './AnimalCompanionModal';
import { applyAbility } from '../../utils/applyAbility';

vi.mock('../../utils/CharacterUtils', () => ({
  getAbilityModifier: vi.fn((score) => Math.floor(((score || 10) - 10) / 2)),
  getAttackBonus: vi.fn(() => '+5/+0/-5'),
  formatModifier: vi.fn((n) => (n >= 0 ? `+${n}` : `${n}`)),
  getProficiencyBonus: vi.fn((prof, level) => (prof || 0) * 2 + (level || 0)),
}));

vi.mock('../../utils/applyAbility', () => ({ applyAbility: vi.fn() }));

// Mutable encounter the Support button reads; inactive by default so the rest of
// the suite (which renders out of combat) never shows the Support button.
const mockEnc = { active: false, phase: 'idle', order: [] };
const mockAppendLog = vi.fn();
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEnc, appendLog: mockAppendLog }),
}));

afterEach(() => {
  vi.clearAllMocks();
  mockEnc.active = false;
  mockEnc.phase = 'idle';
  mockEnc.order = [];
});

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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    expect(screen.queryByText('Support Benefit')).toBeNull();
  });

  // ── Support action (#223) ────────────────────────────────────────────────
  it('hides the Support button out of an encounter', () => {
    const companion = { ...baseCompanion, support: 'Shadows.' };
    render(
      <AnimalCompanionModal isOpen onClose={vi.fn()} animalCompanion={companion} character={baseCharacter} />
    );
    expect(screen.queryByRole('button', { name: 'Support' })).toBeNull();
  });

  it('applies the support self-effect until the start of the owner\'s next turn', () => {
    mockEnc.active = true;
    mockEnc.phase = 'in-progress';
    mockEnc.order = [{ kind: 'pc', charId: 'ash', entryId: 'e1' }];
    const companion = { ...baseCompanion, name: 'Zevira', support: 'Shadows.' };
    const owner = { id: 'ash', name: 'Ashka', level: 4 };
    render(
      <AnimalCompanionModal isOpen onClose={vi.fn()} animalCompanion={companion} character={owner} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Support' }));
    expect(applyAbility).toHaveBeenCalledTimes(1);
    const arg = applyAbility.mock.calls[0][0];
    expect(arg.casterEntryId).toBe('e1');
    expect(arg.ability.effects[0]).toEqual({
      effectId: 'shadow-hound-support',
      applyTo: 'self',
      duration: { until: 'caster-turn-start' },
    });
  });

  it('renders description when present', () => {
    const companion = { ...baseCompanion, description: 'A loyal wolf.' };
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
        animalCompanion={companion}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Special Abilities')).toBeInTheDocument();
    expect(screen.getByText('Pack Attack')).toBeInTheDocument();
  });

  it('uses characterColor when provided', () => {
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={vi.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
        characterColor="#cc0000"
      />
    );
    const modalContainer = document.querySelector('.modal-container');
    expect(modalContainer.style.getPropertyValue('--color-theme')).toBe('#cc0000');
    expect(document.querySelector('.modal-header--themed')).toBeInTheDocument();
  });

  it('uses default color when characterColor is absent', () => {
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={vi.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    const modalContainer = document.querySelector('.modal-container');
    expect(modalContainer.style.getPropertyValue('--color-theme')).toBe('var(--color-primary)');
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={onClose}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    fireEvent.click(document.querySelector('.modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when modal body is clicked', () => {
    const onClose = vi.fn();
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={onClose}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    fireEvent.click(document.querySelector('.modal-container'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders the Conditions button in the defenses row', () => {
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={vi.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('Conditions')).toBeInTheDocument();
  });

  it('shows em-dash when no conditions are active', () => {
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={vi.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('opens ConditionModal when Conditions button is clicked', () => {
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={vi.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    fireEvent.click(screen.getByText('Conditions').closest('button'));
    expect(screen.getByText('Condition Tracker')).toBeInTheDocument();
  });

  it('adds a condition and shows count in button', () => {
    render(
      <AnimalCompanionModal
        isOpen={true}
        onClose={vi.fn()}
        animalCompanion={baseCompanion}
        character={baseCharacter}
      />
    );
    // Open condition modal
    fireEvent.click(screen.getByText('Conditions').closest('button'));
    // Click Off-Guard in the browser grid (toggle condition)
    fireEvent.click(screen.getByText('Off-Guard').closest('button'));
    // The count badge should now show 1 instead of —
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('renders entity image when animalCompanion.image is set', () => {
    const companion = { ...baseCompanion, image: 'img_companion.jpg' };
    render(
      <AnimalCompanionModal isOpen={true} onClose={vi.fn()} animalCompanion={companion} character={baseCharacter} />
    );
    const img = document.querySelector('.entity-image');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', '/api/images/img_companion.jpg');
  });

  it('does not render entity image when animalCompanion.image is absent', () => {
    render(
      <AnimalCompanionModal isOpen={true} onClose={vi.fn()} animalCompanion={baseCompanion} character={baseCharacter} />
    );
    expect(document.querySelector('.entity-image')).toBeNull();
  });
});
