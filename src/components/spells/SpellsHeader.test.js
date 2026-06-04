import React from 'react';
import { render, screen } from '@testing-library/react';
import SpellsHeader from './SpellsHeader';

let mockCharacterModel;
jest.mock('../../hooks/useCharacter', () => ({
  useCharacter: () => mockCharacterModel,
}));

// Read-only synced focus state — return [spent, setter]
let mockFocusSpent = 0;
jest.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: () => [mockFocusSpent, jest.fn()],
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
});
