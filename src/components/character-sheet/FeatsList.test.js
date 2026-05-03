import React from 'react';
import { render, screen } from '@testing-library/react';
import FeatsList from './FeatsList';

jest.mock('../shared/CollapsibleCard', () => {
  return function DummyCollapsibleCard({ header, children }) {
    return (
      <div data-testid="collapsible-card">
        <div>{header}</div>
        <div>{children}</div>
      </div>
    );
  };
});

describe('FeatsList', () => {
  const mockCharacter = {
    feats: [
      { id: '1', name: 'Power Attack', level: 1, description: 'Deal extra damage.', source: 'Core Rulebook' },
      { id: '2', name: 'Weapon Focus', level: 2, description: 'Bonus to attack rolls.' },
    ],
  };

  it('renders without crashing', () => {
    expect(() => render(<FeatsList character={mockCharacter} />)).not.toThrow();
  });

  it('renders a card for each feat', () => {
    render(<FeatsList character={mockCharacter} />);
    expect(screen.getAllByTestId('collapsible-card')).toHaveLength(2);
  });

  it('displays feat names', () => {
    render(<FeatsList character={mockCharacter} />);
    expect(screen.getByText('Power Attack')).toBeInTheDocument();
    expect(screen.getByText('Weapon Focus')).toBeInTheDocument();
  });

  it('displays feat levels', () => {
    render(<FeatsList character={mockCharacter} />);
    expect(screen.getByText('Level 1')).toBeInTheDocument();
    expect(screen.getByText('Level 2')).toBeInTheDocument();
  });

  it('displays feat source when provided', () => {
    render(<FeatsList character={mockCharacter} />);
    expect(screen.getByText('Core Rulebook')).toBeInTheDocument();
  });

  it('displays feat descriptions', () => {
    render(<FeatsList character={mockCharacter} />);
    expect(screen.getByText('Deal extra damage.')).toBeInTheDocument();
  });

  it('shows empty state when no feats', () => {
    render(<FeatsList character={{ feats: [] }} />);
    expect(screen.getByText('No feats or abilities.')).toBeInTheDocument();
  });

  it('handles missing feats array gracefully', () => {
    render(<FeatsList character={{}} />);
    expect(screen.getByText('No feats or abilities.')).toBeInTheDocument();
  });

  it('sorts feats by level', () => {
    const unsortedCharacter = {
      feats: [
        { id: '2', name: 'High Level', level: 5, description: 'desc' },
        { id: '1', name: 'Low Level', level: 1, description: 'desc' },
      ],
    };
    render(<FeatsList character={unsortedCharacter} />);
    const cards = screen.getAllByTestId('collapsible-card');
    expect(cards[0]).toHaveTextContent('Low Level');
    expect(cards[1]).toHaveTextContent('High Level');
  });
});
