import React from 'react';
import { render, screen } from '@testing-library/react';
import ReactionsList from './ReactionsList';

vi.mock('./ActionCardList', () => ({ default: ({ items, type, emptyMessage }) => (
  <div data-testid="action-card-list" data-type={type}>{emptyMessage}</div>
) }));

vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (char) => char ? { reactions: [] } : null,
}));

describe('ReactionsList', () => {
  const mockCharacter = { id: '1', name: 'Test' };

  it('renders without crashing', () => {
    expect(() => render(<ReactionsList character={mockCharacter} />)).not.toThrow();
  });

  it('renders ActionCardList with reaction type', () => {
    render(<ReactionsList character={mockCharacter} />);
    const list = screen.getByTestId('action-card-list');
    expect(list).toBeInTheDocument();
    expect(list.dataset.type).toBe('reaction');
  });

  it('passes empty message to ActionCardList', () => {
    render(<ReactionsList character={mockCharacter} />);
    expect(screen.getByText('No reactions available for this character.')).toBeInTheDocument();
  });
});
