import React from 'react';
import { render, screen } from '@testing-library/react';
import FreeActionsList from './FreeActionsList';

jest.mock('./ActionCardList', () => ({ items, type, emptyMessage }) => (
  <div data-testid="action-card-list" data-type={type}>{emptyMessage}</div>
));

jest.mock('../../hooks/useCharacter', () => ({
  useCharacter: (char) => char ? { freeActions: [] } : null,
}));

describe('FreeActionsList', () => {
  const mockCharacter = { id: '1', name: 'Test' };

  it('renders without crashing', () => {
    expect(() => render(<FreeActionsList character={mockCharacter} />)).not.toThrow();
  });

  it('renders ActionCardList with free-action type', () => {
    render(<FreeActionsList character={mockCharacter} />);
    const list = screen.getByTestId('action-card-list');
    expect(list).toBeInTheDocument();
    expect(list.dataset.type).toBe('free-action');
  });

  it('passes empty message to ActionCardList', () => {
    render(<FreeActionsList character={mockCharacter} />);
    expect(screen.getByText('No free actions available for this character.')).toBeInTheDocument();
  });
});
