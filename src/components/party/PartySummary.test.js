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
});
