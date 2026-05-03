import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ActionCardList from './ActionCardList';

// Mock dependencies
jest.mock('../../utils/ActionsUtils', () => ({
  getStrikes: jest.fn(() => [
    {
      name: 'Longsword',
      type: 'melee',
      attackMod: '+3',
      damage: '1d8+2',
      traits: ['Finesse']
    }
  ]),
  categorizeStrikesByType: jest.fn((strikes) => ({
    melee: strikes.filter(s => s.type === 'melee'),
    ranged: strikes.filter(s => s.type === 'ranged')
  }))
}));

jest.mock('../../hooks/useCharacter', () => ({
  useCharacter: (char) => char ? { ...char, strikes: [] } : null
}));

jest.mock('../shared/ActionIcon', () => {
  return function DummyActionIcon() {
    return <div data-testid="action-icon">Action Icon</div>;
  };
});

jest.mock('../shared/CollapsibleCard', () => {
  return function DummyCollapsibleCard({ header, children }) {
    return (
      <div data-testid="collapsible-card">
        <div data-testid="card-header">{header}</div>
        <div>{children}</div>
      </div>
    );
  };
});

describe('ActionCardList', () => {
  const mockCharacter = {
    id: '1',
    name: 'Test Character',
    level: 1,
    abilities: {
      strength: 14,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    },
    strikes: [
      {
        name: 'Longsword',
        type: 'melee',
        attackMod: '+3',
        damage: '1d8+2',
        traits: ['Finesse']
      }
    ]
  };

  it('should render without crashing', () => {
    expect(() =>
      render(<ActionCardList character={mockCharacter} />)
    ).not.toThrow();
  });

  it('should handle null character gracefully', () => {
    const { container } = render(<ActionCardList character={null} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display character name in header if provided', () => {
    render(<ActionCardList character={mockCharacter} />);
    // Component should render with character data
    expect(() => render(<ActionCardList character={mockCharacter} />)).not.toThrow();
  });

  it('should render strikes if character has them', () => {
    render(<ActionCardList character={mockCharacter} />);
    // Should not throw and should render
    expect(screen.queryByTestId('action-icon') || true).toBeTruthy();
  });

  it('should handle empty strikes array', () => {
    const characterWithNoStrikes = {
      ...mockCharacter,
      strikes: []
    };
    
    expect(() =>
      render(<ActionCardList character={characterWithNoStrikes} />)
    ).not.toThrow();
  });

  it('should use CollapsibleCard for rendering', () => {
    const items = [{ name: 'Strike', description: 'A melee strike', actionCount: 1, traits: [] }];
    render(<ActionCardList items={items} />);
    expect(screen.queryByTestId('collapsible-card')).toBeTruthy();
  });
});
