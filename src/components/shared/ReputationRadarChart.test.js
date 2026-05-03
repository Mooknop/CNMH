import React from 'react';
import { render, screen } from '@testing-library/react';
import ReputationRadarChart from './ReputationRadarChart';

jest.mock('recharts', () => ({
  RadarChart: ({ children }) => <div data-testid="radar-chart">{children}</div>,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null,
  Radar: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  Tooltip: () => null,
}));

const factions = [
  {
    name: 'Pathfinder Society',
    reputation: 10,
    ranks: [
      { name: 'Recognized', min: 0, max: 15, effect: 'You may purchase Wayfinders.' },
      { name: 'Allied', min: 16, max: 30, effect: null },
    ],
  },
  {
    name: 'Absalom City Guard',
    reputation: -5,
    ranks: [
      { name: 'Suspicious', min: -10, max: -1, effect: 'Guards are wary.' },
      { name: 'Neutral', min: 0, max: 10, effect: null },
    ],
  },
];

describe('ReputationRadarChart', () => {
  it('renders without crashing', () => {
    expect(() => render(<ReputationRadarChart factions={factions} />)).not.toThrow();
  });

  it('renders the radar chart', () => {
    render(<ReputationRadarChart factions={factions} />);
    expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
  });

  it('renders active reputation effects', () => {
    render(<ReputationRadarChart factions={factions} />);
    expect(screen.getByText('Active Reputation Effects')).toBeInTheDocument();
    expect(screen.getByText('You may purchase Wayfinders.')).toBeInTheDocument();
  });

  it('renders faction names in effects section', () => {
    render(<ReputationRadarChart factions={factions} />);
    expect(screen.getByText(/Pathfinder Society/)).toBeInTheDocument();
  });

  it('renders standing labels', () => {
    render(<ReputationRadarChart factions={factions} />);
    expect(screen.getByText(/Recognized/)).toBeInTheDocument();
  });

  it('renders without active effects section when no effects exist', () => {
    const factionsNoEffects = [
      {
        name: 'Test Faction',
        reputation: 5,
        ranks: [{ name: 'Neutral', min: 0, max: 10, effect: null }],
      },
    ];
    render(<ReputationRadarChart factions={factionsNoEffects} />);
    expect(screen.queryByText('Active Reputation Effects')).not.toBeInTheDocument();
  });

  it('renders with empty factions array', () => {
    expect(() => render(<ReputationRadarChart factions={[]} />)).not.toThrow();
  });
});
