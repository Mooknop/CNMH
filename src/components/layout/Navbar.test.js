import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';

jest.mock('../../contexts/CharacterContext', () => {
  const React = require('react');
  const MockContext = React.createContext({
    characters: [],
    activeCharacter: null,
  });
  return { CharacterContext: MockContext };
});

const renderNavbar = (contextValue = { characters: [], activeCharacter: null }) => {
  const { CharacterContext } = require('../../contexts/CharacterContext');
  return render(
    <CharacterContext.Provider value={contextValue}>
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    </CharacterContext.Provider>
  );
};

describe('Navbar', () => {
  it('renders without crashing', () => {
    expect(() => renderNavbar()).not.toThrow();
  });

  it('shows the brand name link', () => {
    renderNavbar();
    expect(screen.getByText('Chaotic Neutral Milk Hotel')).toBeInTheDocument();
  });

  it('renders the Characters button', () => {
    renderNavbar();
    expect(screen.getByText(/Characters/)).toBeInTheDocument();
  });

  it('does not show dropdown by default', () => {
    renderNavbar();
    expect(screen.queryByText('No characters')).not.toBeInTheDocument();
  });

  it('shows dropdown when Characters button is clicked', () => {
    renderNavbar();
    fireEvent.click(screen.getByText(/Characters/));
    expect(screen.getByText('No characters')).toBeInTheDocument();
  });

  it('shows character links when characters exist', () => {
    renderNavbar({
      characters: [
        { id: '1', name: 'Tharivol' },
        { id: '2', name: 'Seline' },
      ],
      activeCharacter: null,
    });
    fireEvent.click(screen.getByText(/Characters/));
    expect(screen.getByText('Tharivol')).toBeInTheDocument();
    expect(screen.getByText('Seline')).toBeInTheDocument();
  });

  it('closes dropdown when a character link is clicked', () => {
    renderNavbar({
      characters: [{ id: '1', name: 'Tharivol' }],
      activeCharacter: null,
    });
    fireEvent.click(screen.getByText(/Characters/));
    fireEvent.click(screen.getByText('Tharivol'));
    expect(screen.queryByText('Tharivol')).not.toBeInTheDocument();
  });

  it('marks the active character link', () => {
    renderNavbar({
      characters: [{ id: '1', name: 'Tharivol' }],
      activeCharacter: { id: '1', name: 'Tharivol' },
    });
    fireEvent.click(screen.getByText(/Characters/));
    // The active character's name now also appears in the navbar chip, so
    // scope the assertion to the dropdown anchor specifically.
    const link = screen
      .getAllByText('Tharivol')
      .map((el) => el.closest('a'))
      .find(Boolean);
    expect(link).toHaveClass('active');
  });
});
