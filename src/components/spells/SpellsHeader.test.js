import React from 'react';
import { render, screen } from '@testing-library/react';
import SpellsHeader from './SpellsHeader';

jest.mock('../../hooks/useCharacter', () => ({
  useCharacter: () => ({
    spellcasting: { tradition: 'Arcane', proficiency: 'trained' },
    spellStats: { spellAttackMod: 6, spellDC: 16 },
  }),
}));

jest.mock('../../utils/CharacterUtils', () => ({
  getProficiencyLabel: (prof) => prof.charAt(0).toUpperCase() + prof.slice(1),
}));

describe('SpellsHeader', () => {
  const mockCharacter = { name: 'Arcanist', level: 1 };

  it('renders without crashing', () => {
    expect(() => render(<SpellsHeader character={mockCharacter} themeColor="#7E8C9A" />)).not.toThrow();
  });

  it('displays the tradition', () => {
    render(<SpellsHeader character={mockCharacter} themeColor="#7E8C9A" />);
    expect(screen.getByText('Arcane')).toBeInTheDocument();
  });

  it('displays the proficiency label', () => {
    render(<SpellsHeader character={mockCharacter} themeColor="#7E8C9A" />);
    expect(screen.getByText('Trained')).toBeInTheDocument();
  });

  it('displays spell attack modifier with plus sign', () => {
    render(<SpellsHeader character={mockCharacter} themeColor="#7E8C9A" />);
    expect(screen.getByText('+6')).toBeInTheDocument();
  });

  it('displays spell DC', () => {
    render(<SpellsHeader character={mockCharacter} themeColor="#7E8C9A" />);
    expect(screen.getByText('16')).toBeInTheDocument();
  });

  it('renders the stat labels', () => {
    render(<SpellsHeader character={mockCharacter} themeColor="#7E8C9A" />);
    expect(screen.getByText('Tradition')).toBeInTheDocument();
    expect(screen.getByText('Proficiency')).toBeInTheDocument();
    expect(screen.getByText('Spell Attack')).toBeInTheDocument();
    expect(screen.getByText('Spell DC')).toBeInTheDocument();
  });
});
