import React from 'react';
import { render, screen } from '@testing-library/react';
import PartySummary from './PartySummary';

jest.mock('recharts', () => ({
  RadarChart: ({ children }) => <div data-testid="radar-chart">{children}</div>,
  PolarGrid: () => <div />,
  PolarAngleAxis: () => <div />,
  PolarRadiusAxis: () => <div />,
  Radar: () => <div />,
  Legend: () => <div />,
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
}));

jest.mock('../../contexts/CharacterContext', () => {
  const React = require('react');
  const MockContext = React.createContext({ characters: [] });
  return { CharacterContext: MockContext };
});

jest.mock('../../utils/CharacterUtils', () => ({
  getAbilityModifier: (score) => Math.floor((score - 10) / 2),
  formatModifier: (mod) => mod >= 0 ? `+${mod}` : `${mod}`,
  getSkillModifier: () => 3,
  SKILL_ABILITY_MAP: {
    acrobatics: 'dexterity',
    athletics: 'strength',
    perception: 'wisdom',
  },
  getCharacterColor: (i) => ['#ff0000', '#00ff00', '#0000ff'][i % 3],
}));

const renderWithContext = (characters = []) => {
  const { CharacterContext } = require('../../contexts/CharacterContext');
  return render(
    <CharacterContext.Provider value={{ characters }}>
      <PartySummary />
    </CharacterContext.Provider>
  );
};

describe('PartySummary', () => {
  it('renders without crashing with no characters', () => {
    expect(() => renderWithContext([])).not.toThrow();
  });

  it('renders Party Members heading', () => {
    renderWithContext([]);
    expect(screen.getByText('Party Members')).toBeInTheDocument();
  });

  it('renders radar chart', () => {
    renderWithContext([]);
    expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
  });

  it('renders character names in party grid', () => {
    renderWithContext([
      { id: '1', name: 'Tharivol', class: 'Wizard', level: 5, abilities: { strength: 10, dexterity: 16, constitution: 12, intelligence: 18, wisdom: 12, charisma: 10 } },
    ]);
    expect(screen.getAllByText('Tharivol').length).toBeGreaterThan(0);
  });

  it('renders skill specialists section', () => {
    renderWithContext([
      { id: '1', name: 'Tharivol', class: 'Wizard', level: 5, abilities: { strength: 10, dexterity: 16, constitution: 12, intelligence: 18, wisdom: 12, charisma: 10 } },
    ]);
    expect(screen.getByText('Party Skill Specialists')).toBeInTheDocument();
  });

  it('displays positive and negative modifiers correctly', () => {
    renderWithContext([
      { id: '1', name: 'Strong Character', class: 'Fighter', abilities: { strength: 18, dexterity: 8, constitution: 16, intelligence: 10, wisdom: 12, charisma: 14 } },
    ]);
    // Check for positive modifier (+4 for strength 18)
    expect(screen.getByText('+4')).toBeInTheDocument();
    // Check for negative modifier (-1 for dexterity 8)
    expect(screen.getByText('-1')).toBeInTheDocument();
  });

  it('shows "No skill data available" when characters have no skills', () => {
    // Temporarily override the mock
    const originalGetSkillModifier = require('../../utils/CharacterUtils').getSkillModifier;
    require('../../utils/CharacterUtils').getSkillModifier = jest.fn(() => -Infinity);

    renderWithContext([
      { id: '1', name: 'No Skills', class: 'Commoner', abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 } },
    ]);

    expect(screen.getByText('No skill data available for the party.')).toBeInTheDocument();

    // Restore original mock
    require('../../utils/CharacterUtils').getSkillModifier = originalGetSkillModifier;
  });

  it('renders multiple characters in the party grid', () => {
    renderWithContext([
      { id: '1', name: 'Tharivol', class: 'Wizard', abilities: { strength: 10, dexterity: 16, constitution: 12, intelligence: 18, wisdom: 12, charisma: 10 } },
      { id: '2', name: 'Borogar', class: 'Fighter', abilities: { strength: 18, dexterity: 12, constitution: 16, intelligence: 8, wisdom: 10, charisma: 14 } },
    ]);
    expect(screen.getAllByText('Tharivol').length).toBeGreaterThan(0);
    expect(screen.getByText('Borogar')).toBeInTheDocument();
    expect(screen.getAllByText('Wizard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fighter').length).toBeGreaterThan(0);
  });

  it('handles characters with missing abilities gracefully', () => {
    renderWithContext([
      { id: '1', name: 'Incomplete', class: 'Rogue', abilities: {} },
    ]);
    // Should default to +0 for missing abilities
    expect(screen.getAllByText('+0')).toBeTruthy();
  });
});
