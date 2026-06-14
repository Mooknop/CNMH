import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';
import { GameDateProvider } from '../../contexts/GameDateContext';
import { CharacterContext } from '../../contexts/CharacterContext';

vi.mock('../../contexts/CharacterContext', async () => {
  const { createContext } = await vi.importActual('react');
  const MockContext = createContext({
    characters: [],
    activeCharacter: null,
  });
  return { CharacterContext: MockContext };
});

const renderNavbar = (contextValue = { characters: [], activeCharacter: null }) => {
  return render(
    <CharacterContext.Provider value={contextValue}>
      <GameDateProvider>
        <MemoryRouter>
          <Navbar />
        </MemoryRouter>
      </GameDateProvider>
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

  it('no longer renders the Characters selector (carousel replaces it)', () => {
    renderNavbar();
    expect(screen.queryByText('Characters')).not.toBeInTheDocument();
  });

  it('shows the active-character pill when one is set', () => {
    renderNavbar({
      characters: [{ id: '1', name: 'Tharivol' }],
      activeCharacter: { id: '1', name: 'Tharivol' },
    });
    expect(screen.getByText('Tharivol')).toBeInTheDocument();
  });

  it('omits the active-character pill when none is set', () => {
    renderNavbar();
    expect(screen.queryByText('Tharivol')).not.toBeInTheDocument();
  });
});
