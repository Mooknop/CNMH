import React from 'react';
import { render, screen } from '@testing-library/react';
import StrikesList from './StrikesList';

jest.mock('../shared/CollapsibleCard', () => ({ header, children, className }) => (
  <div data-testid="collapsible-card" className={className}>
    <div>{header}</div>
    <div>{children}</div>
  </div>
));

jest.mock('../shared/TraitTag', () => ({ trait }) => (
  <span data-testid="trait-tag">{trait}</span>
));

jest.mock('../shared/ActionIcon', () => ({ actionText }) => (
  <span data-testid="action-icon">{actionText}</span>
));

jest.mock('./ThaumaturgeImplementsDisplay', () => ({ thaumaturge, themeColor }) => (
  <div data-testid="thaumaturge-implements">Implements</div>
));

jest.mock('../../hooks/useCharacter', () => ({
  useCharacter: (char) => {
    if (!char) return null;
    return {
      strikes: char._strikes || [],
      flags: { isThaumaturge: char._isThaumaturge || false },
      thaumaturge: char._thaumaturge || null,
    };
  },
}));

const mockCharacter = { id: '1', name: 'Fighter' };

describe('StrikesList', () => {
  it('renders empty state when no strikes', () => {
    render(<StrikesList character={mockCharacter} themeColor="#ff0000" />);
    expect(screen.getByText('No strikes available for this character.')).toBeInTheDocument();
  });

  it('renders melee strikes section', () => {
    const char = {
      ...mockCharacter,
      _strikes: [
        { name: 'Longsword', type: 'melee', attackMod: '+7', damage: '1d8+4', traits: ['versatile P'] },
      ],
    };
    render(<StrikesList character={char} themeColor="#ff0000" />);
    expect(screen.getByText('Melee Strikes')).toBeInTheDocument();
    expect(screen.getByText('Longsword')).toBeInTheDocument();
    expect(screen.getByText('+7')).toBeInTheDocument();
    expect(screen.getByText('1d8+4')).toBeInTheDocument();
  });

  it('renders ranged strikes section', () => {
    const char = {
      ...mockCharacter,
      _strikes: [
        { name: 'Shortbow', type: 'ranged', attackMod: '+5', damage: '1d6', range: '60 feet', traits: [] },
      ],
    };
    render(<StrikesList character={char} themeColor="#ff0000" />);
    expect(screen.getByText('Ranged Strikes')).toBeInTheDocument();
    expect(screen.getByText('Shortbow')).toBeInTheDocument();
    expect(screen.getByText('60 feet')).toBeInTheDocument();
  });

  it('renders strike range default when not specified', () => {
    const char = {
      ...mockCharacter,
      _strikes: [
        { name: 'Sling', type: 'ranged', attackMod: '+3', damage: '1d6', traits: [] },
      ],
    };
    render(<StrikesList character={char} themeColor="#ff0000" />);
    expect(screen.getByText('30 feet')).toBeInTheDocument();
  });

  it('renders traits for strikes', () => {
    const char = {
      ...mockCharacter,
      _strikes: [
        { name: 'Dagger', type: 'melee', attackMod: '+5', damage: '1d4', traits: ['agile', 'finesse'] },
      ],
    };
    render(<StrikesList character={char} themeColor="#ff0000" />);
    expect(screen.getAllByTestId('trait-tag')).toHaveLength(2);
  });

  it('renders strike description when present', () => {
    const char = {
      ...mockCharacter,
      _strikes: [
        { name: 'Unarmed', type: 'melee', attackMod: '+3', damage: '1d4', traits: [], description: 'A basic punch.' },
      ],
    };
    render(<StrikesList character={char} themeColor="#ff0000" />);
    expect(screen.getByText('A basic punch.')).toBeInTheDocument();
  });

  it('renders strike source when different from name', () => {
    const char = {
      ...mockCharacter,
      _strikes: [
        { name: 'Vine Strike', type: 'melee', attackMod: '+3', damage: '1d4', traits: [], source: 'Wild Shape' },
      ],
    };
    render(<StrikesList character={char} themeColor="#ff0000" />);
    expect(screen.getByText('From: Wild Shape')).toBeInTheDocument();
  });

  it('renders Thaumaturge implements when isThaumaturge', () => {
    const char = {
      ...mockCharacter,
      _isThaumaturge: true,
      _thaumaturge: { passives: [] },
      _strikes: [],
    };
    render(<StrikesList character={char} themeColor="#ff0000" />);
    expect(screen.getByTestId('thaumaturge-implements')).toBeInTheDocument();
  });

  it('disables an item strike whose weapon is not in hand', () => {
    const char = {
      ...mockCharacter,
      _strikes: [
        { name: 'Longsword', type: 'melee', attackMod: '+7', damage: '1d8+4', traits: [], source: 'Longsword', active: false },
      ],
    };
    render(<StrikesList character={char} themeColor="#ff0000" />);
    expect(screen.getByText(/Not in hand/)).toBeInTheDocument();
    expect(screen.getByTestId('collapsible-card').className).toContain('is-inactive');
  });

  it('does not disable a held or non-item strike', () => {
    const char = {
      ...mockCharacter,
      _strikes: [
        { name: 'Longsword', type: 'melee', attackMod: '+7', damage: '1d8+4', traits: [], source: 'Longsword', active: true },
      ],
    };
    render(<StrikesList character={char} themeColor="#ff0000" />);
    expect(screen.queryByText(/Not in hand/)).not.toBeInTheDocument();
    expect(screen.getByTestId('collapsible-card').className).not.toContain('is-inactive');
  });

  it('renders action icon for variable action count strikes', () => {
    const char = {
      ...mockCharacter,
      _strikes: [
        {
          name: 'Snap Shot',
          type: 'ranged',
          attackMod: '+4',
          damage: '1d6',
          traits: [],
          variableActionCount: { min: 1, max: 3 },
        },
      ],
    };
    render(<StrikesList character={char} themeColor="#ff0000" />);
    expect(screen.getByTestId('action-icon')).toBeInTheDocument();
  });
});
