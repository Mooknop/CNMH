import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CharacterContext, CharacterProvider } from './CharacterContext';

// Mock ContentContext so the provider receives a fixed character roster
// without pulling in the real content layer (contentUtils + bundled data).
vi.mock('./ContentContext', () => ({
  useContent: () => ({
    characters: [
      { id: '1', name: 'Character 1', level: 1 },
      { id: '2', name: 'Character 2', level: 2 },
      { id: '3', name: 'Character 3', level: 3 }
    ]
  })
}));

vi.mock('../utils/CharacterUtils', () => ({
  getCharacterColor: (index) => {
    const colors = ['#7E8C9A', '#64b5f6', '#81c784'];
    return colors[index % colors.length];
  }
}));

// Test component that uses the context
const TestComponent = () => {
  const mockContext = React.useContext(CharacterContext);
  
  if (!mockContext) return <div>No context</div>;
  
  return (
    <div>
      <div data-testid="char-count">{mockContext.characters.length}</div>
      <div data-testid="active-id">{mockContext.activeCharacter?.id || 'none'}</div>
      <div data-testid="active-color">{mockContext.activeCharacterColor}</div>
      <button onClick={() => mockContext.setActiveCharacter(mockContext.characters[0])}>
        Set Active
      </button>
      <button onClick={() => {
        const char = mockContext.getCharacter('1');
        if (char) {
          document.getElementById('found-char').textContent = char.name;
        }
      }}>
        Get Character
      </button>
      <div id="found-char"></div>
    </div>
  );
};

describe('CharacterContext', () => {
  it('should provide initial characters', () => {
    render(
      <CharacterProvider>
        <TestComponent />
      </CharacterProvider>
    );
    
    expect(screen.getByTestId('char-count')).toHaveTextContent('3');
  });

  it('should initialize with null active character', () => {
    render(
      <CharacterProvider>
        <TestComponent />
      </CharacterProvider>
    );
    
    expect(screen.getByTestId('active-id')).toHaveTextContent('none');
  });

  it('should set active character', async () => {
    render(
      <CharacterProvider>
        <TestComponent />
      </CharacterProvider>
    );
    
    const button = screen.getByText('Set Active');
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(screen.getByTestId('active-id')).toHaveTextContent('1');
    });
  });

  it('should return default color for null active character', () => {
    render(
      <CharacterProvider>
        <TestComponent />
      </CharacterProvider>
    );
    
    expect(screen.getByTestId('active-color')).toHaveTextContent('var(--color-primary)');
  });

  it('should update color when active character changes', async () => {
    render(
      <CharacterProvider>
        <TestComponent />
      </CharacterProvider>
    );
    
    const button = screen.getByText('Set Active');
    fireEvent.click(button);
    
    // After setting active character to first in list (index 0)
    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('#7E8C9A');
    });
  });

  it('should getCharacter by id', () => {
    render(
      <CharacterProvider>
        <TestComponent />
      </CharacterProvider>
    );
    
    const button = screen.getByText('Get Character');
    fireEvent.click(button);
    
    expect(document.getElementById('found-char')).toHaveTextContent('Character 1');
  });

  it('should return null for non-existent character id', () => {
    const TestGetComponent = () => {
      const mockContext = React.useContext(CharacterContext);
      const char = mockContext.getCharacter('non-existent');
      return <div data-testid="result">{char ? 'found' : 'not-found'}</div>;
    };

    render(
      <CharacterProvider>
        <TestGetComponent />
      </CharacterProvider>
    );
    
    expect(screen.getAllByTestId('result')[0]).toHaveTextContent('not-found');
  });

  it('should handle multiple consumers of context', () => {
    const Consumer1 = () => {
      const mockContext = React.useContext(CharacterContext);
      return <div data-testid="consumer1">{mockContext.characters.length}</div>;
    };

    const Consumer2 = () => {
      const mockContext = React.useContext(CharacterContext);
      return <div data-testid="consumer2">{mockContext.characters.length}</div>;
    };

    render(
      <CharacterProvider>
        <Consumer1 />
        <Consumer2 />
      </CharacterProvider>
    );
    
    expect(screen.getByTestId('consumer1')).toHaveTextContent('3');
    expect(screen.getByTestId('consumer2')).toHaveTextContent('3');
  });
});
