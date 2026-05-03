import React from 'react';
import { render, screen } from '@testing-library/react';
import CharacterActionsList from './CharacterActionsList';

jest.mock('./ActionCardList', () => ({ items, type, emptyMessage }) => (
  <div data-testid="action-card-list">{emptyMessage}</div>
));
jest.mock('./ThaumaturgeExploitsDisplay', () => () => (
  <div data-testid="thaumaturge-exploits">Exploits</div>
));

jest.mock('../../hooks/useCharacter', () => ({
  useCharacter: (char) => char ? {
    actions: [],
    flags: { isThaumaturge: false },
    thaumaturge: null,
  } : null,
}));

const mockCharacter = { id: '1', name: 'Test' };

describe('CharacterActionsList', () => {
  it('renders without crashing', () => {
    expect(() => render(<CharacterActionsList character={mockCharacter} />)).not.toThrow();
  });

  it('renders ActionCardList', () => {
    render(<CharacterActionsList character={mockCharacter} />);
    expect(screen.getByTestId('action-card-list')).toBeInTheDocument();
  });

  it('does not show ThaumaturgeExploitsDisplay for non-thaumaturge', () => {
    render(<CharacterActionsList character={mockCharacter} />);
    expect(screen.queryByTestId('thaumaturge-exploits')).not.toBeInTheDocument();
  });

  it('shows ThaumaturgeExploitsDisplay for thaumaturge characters', () => {
    const { useCharacter } = require('../../hooks/useCharacter');
    jest.spyOn(require('../../hooks/useCharacter'), 'useCharacter').mockReturnValueOnce({
      actions: [],
      flags: { isThaumaturge: true },
      thaumaturge: { implements: [] },
    });

    render(<CharacterActionsList character={mockCharacter} />);
    expect(screen.getByTestId('thaumaturge-exploits')).toBeInTheDocument();
  });
});
