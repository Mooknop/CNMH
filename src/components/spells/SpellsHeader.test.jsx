import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SpellsHeader from './SpellsHeader';

let mockCharacterModel;
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: () => mockCharacterModel,
}));

// Read-only synced focus state — return [spent, setter]
let mockFocusSpent = 0;
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: () => [mockFocusSpent, vi.fn()],
}));

// Veracious Spell (#967 R7) — controllable per test.
let mockVeracious;
vi.mock('../../hooks/useVeracious', () => ({
  useVeracious: () => mockVeracious,
}));

describe('SpellsHeader', () => {
  const mockCharacter = {
    name: 'Arcanist',
    level: 1,
    spellcasting: { focus: { max: 3, current: 3 } },
  };

  beforeEach(() => {
    mockFocusSpent = 0;
    mockCharacterModel = {
      spellStats: { spellAttackMod: 6, spellDC: 16 },
      flags: { hasFocusSpells: true },
    };
    mockVeracious = { itemBonus: 0, imbuedRunes: [], imbuedRiders: [], armed: false, arm: vi.fn(), disarm: vi.fn() };
  });

  it('renders without crashing', () => {
    expect(() => render(<SpellsHeader character={mockCharacter} />)).not.toThrow();
  });

  it('renders the three slab labels: Atk · DC · Focus', () => {
    render(<SpellsHeader character={mockCharacter} />);
    expect(screen.getByText('Atk')).toBeInTheDocument();
    expect(screen.getByText('DC')).toBeInTheDocument();
    expect(screen.getByText('Focus')).toBeInTheDocument();
  });

  it('does not render Tradition or Proficiency slabs', () => {
    render(<SpellsHeader character={mockCharacter} />);
    expect(screen.queryByText('Tradition')).not.toBeInTheDocument();
    expect(screen.queryByText('Proficiency')).not.toBeInTheDocument();
  });

  it('displays spell attack modifier with plus sign', () => {
    render(<SpellsHeader character={mockCharacter} />);
    expect(screen.getByText('+6')).toBeInTheDocument();
  });

  it('displays a negative spell attack modifier as-is', () => {
    mockCharacterModel.spellStats.spellAttackMod = -1;
    render(<SpellsHeader character={mockCharacter} />);
    expect(screen.getByText('-1')).toBeInTheDocument();
  });

  it('displays spell DC', () => {
    render(<SpellsHeader character={mockCharacter} />);
    expect(screen.getByText('16')).toBeInTheDocument();
  });

  it('renders focus pips equal to the focus max', () => {
    const { container } = render(<SpellsHeader character={mockCharacter} />);
    expect(container.querySelectorAll('.slot-pip')).toHaveLength(3);
  });

  it('marks remaining focus pips filled based on spent count', () => {
    mockFocusSpent = 1; // 3 max - 1 spent = 2 remaining
    const { container } = render(<SpellsHeader character={mockCharacter} />);
    expect(container.querySelectorAll('.slot-pip.filled')).toHaveLength(2);
  });

  it('omits the Focus slab when the character has no focus spells', () => {
    mockCharacterModel.flags.hasFocusSpells = false;
    render(<SpellsHeader character={{ name: 'Wizard', level: 1 }} />);
    expect(screen.queryByText('Focus')).not.toBeInTheDocument();
    expect(screen.getByText('Atk')).toBeInTheDocument();
    expect(screen.getByText('DC')).toBeInTheDocument();
  });

  describe('Veracious Spell (#967 R7)', () => {
    it('shows no Veracious control without an invested power ring', () => {
      render(<SpellsHeader character={mockCharacter} />);
      expect(screen.queryByTestId('veracious-control')).not.toBeInTheDocument();
      expect(screen.getByText('+6')).toBeInTheDocument(); // unboosted Atk
    });

    it('offers an arm control when a power ring is invested', () => {
      mockVeracious.itemBonus = 2;
      render(<SpellsHeader character={mockCharacter} />);
      expect(screen.getByRole('button', { name: 'Arm Veracious Spell' })).toBeInTheDocument();
      expect(screen.getByText('+6')).toBeInTheDocument(); // not boosted until armed
    });

    it('boosts the shown Atk (not the DC) while armed, with an imbued reminder', () => {
      mockVeracious = { ...mockVeracious, itemBonus: 2, armed: true, imbuedRunes: ['Energy', 'Calling'] };
      render(<SpellsHeader character={mockCharacter} />);
      expect(screen.getByText('+8')).toBeInTheDocument(); // 6 + 2
      expect(screen.getByText('16')).toBeInTheDocument(); // DC unchanged
      expect(screen.getByRole('button', { name: /Veracious Spell armed · \+2/ })).toBeInTheDocument();
      expect(screen.getByText(/Imbued: Energy, Calling/)).toBeInTheDocument();
    });

    it('renders imbued-rune rider text while armed (#974)', () => {
      mockVeracious = {
        ...mockVeracious, itemBonus: 2, armed: true, imbuedRunes: ['Immobilizing'],
        imbuedRiders: [{ rune: 'Immobilizing', text: 'On a critical spell attack, the target is immobilized.' }],
      };
      render(<SpellsHeader character={mockCharacter} />);
      expect(screen.getByText(/On a critical spell attack, the target is immobilized\./)).toBeInTheDocument();
      expect(screen.getByText('Immobilizing:')).toBeInTheDocument();
    });

    it('hides rider text while disarmed', () => {
      mockVeracious = {
        ...mockVeracious, itemBonus: 2, armed: false,
        imbuedRiders: [{ rune: 'Immobilizing', text: 'On a critical spell attack, the target is immobilized.' }],
      };
      render(<SpellsHeader character={mockCharacter} />);
      expect(screen.queryByText(/target is immobilized/)).not.toBeInTheDocument();
    });

    it('arm and disarm are wired to the toggle', () => {
      mockVeracious.itemBonus = 1;
      const { rerender } = render(<SpellsHeader character={mockCharacter} />);
      fireEvent.click(screen.getByRole('button', { name: 'Arm Veracious Spell' }));
      expect(mockVeracious.arm).toHaveBeenCalled();

      mockVeracious = { ...mockVeracious, armed: true };
      rerender(<SpellsHeader character={mockCharacter} />);
      fireEvent.click(screen.getByRole('button', { name: /Veracious Spell armed/ }));
      expect(mockVeracious.disarm).toHaveBeenCalled();
    });
  });
});
