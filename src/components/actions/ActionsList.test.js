import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ActionsList from './ActionsList';

jest.mock('./StrikesList', () => () => <div data-testid="strikes-list" />);
jest.mock('./CharacterActionsList', () => () => <div data-testid="character-actions-list" />);
jest.mock('./ReactionsList', () => () => <div data-testid="reactions-list" />);
jest.mock('./FreeActionsList', () => () => <div data-testid="free-actions-list" />);

const mockCharacter = { id: '1', name: 'Test', level: 1, strikes: [], actions: [], reactions: [], freeActions: [] };

describe('ActionsList', () => {
  it('renders without crashing', () => {
    expect(() => render(<ActionsList character={mockCharacter} />)).not.toThrow();
  });

  it('shows Strikes section by default', () => {
    render(<ActionsList character={mockCharacter} />);
    expect(screen.getByTestId('strikes-list')).toBeInTheDocument();
  });

  it('does not show other sections by default', () => {
    render(<ActionsList character={mockCharacter} />);
    expect(screen.queryByTestId('character-actions-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reactions-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('free-actions-list')).not.toBeInTheDocument();
  });

  it('switches to Actions section on click', () => {
    render(<ActionsList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByTestId('character-actions-list')).toBeInTheDocument();
    expect(screen.queryByTestId('strikes-list')).not.toBeInTheDocument();
  });

  it('switches to Reactions section on click', () => {
    render(<ActionsList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reactions' }));
    expect(screen.getByTestId('reactions-list')).toBeInTheDocument();
  });

  it('switches to Free Actions section on click', () => {
    render(<ActionsList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Free Actions' }));
    expect(screen.getByTestId('free-actions-list')).toBeInTheDocument();
  });

  it('renders Actions heading', () => {
    render(<ActionsList character={mockCharacter} />);
    // The heading "Actions" is an h2 element
    expect(screen.getByRole('heading', { name: 'Actions' })).toBeInTheDocument();
  });

  it('renders all tab buttons', () => {
    render(<ActionsList character={mockCharacter} />);
    expect(screen.getByRole('button', { name: 'Strikes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Free Actions' })).toBeInTheDocument();
  });
});
