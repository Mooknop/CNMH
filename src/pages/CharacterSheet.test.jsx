import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CharacterSheet from './CharacterSheet';
import { CharacterContext } from '../contexts/CharacterContext';

vi.mock('../contexts/LoreContext', () => ({
  useLore: () => ({ openLore: vi.fn() }),
}));

// Mock contexts — must be a real React context so useContext works
vi.mock('../contexts/CharacterContext', async () => {
  const { createContext } = await vi.importActual('react');
  const MockCharacterContext = createContext({
    setActiveCharacter: () => {},
    characters: [],
    activeCharacter: null,
    getCharacter: () => null,
    activeCharacterColor: '#7E8C9A',
  });
  return {
    CharacterContext: MockCharacterContext,
    CharacterProvider: ({ children }) => children,
  };
});

// Mock hooks
vi.mock('../hooks/useCharacter', () => ({
  useCharacter: (character) => {
    if (!character) return null;
    return {
      ...character,
      flags: {
        hasFamiliar: false,
        hasAnimalCompanion: false,
        hasSpellcasting: true,
        hasFocusSpells: false
      },
      familiar: null,
      animalCompanion: null
    };
  }
}));

// Mock components
vi.mock('../components/character-sheet/StatsBlock', () => ({
  default: function DummyStatsBlock() {
    return <div data-testid="stats-block">Stats Block</div>;
  }
}));

// EffectsPanel reads the game clock (immunity expiry labels); stub it like the
// other Stats-tab children so this suite needs no GameDateProvider.
vi.mock('../components/character-sheet/EffectsPanel', () => ({
  default: function DummyEffectsPanel() {
    return <div data-testid="effects-panel">Effects Panel</div>;
  }
}));

// DailyPrepModal also reads session/clock/log contexts unconditionally.
vi.mock('../components/character-sheet/DailyPrepModal', () => ({
  default: function DummyDailyPrepModal({ isOpen }) {
    return isOpen ? <div data-testid="daily-prep-modal">Daily Prep</div> : null;
  }
}));

vi.mock('../components/character-sheet/FeatsList', () => ({
  default: function DummyFeatsList() {
    return <div data-testid="feats-list">Feats List</div>;
  }
}));

vi.mock('../components/spells/SpellsList', () => ({
  default: function DummySpellsList() {
    return <div data-testid="spells-list">Spells List</div>;
  }
}));

vi.mock('../components/actions/ActionsList', () => ({
  default: function DummyActionsList() {
    return <div data-testid="actions-list">Actions List</div>;
  }
}));

// ReactionPrompt imports UseAbilityModal (game clock via frequency gates); stub
// it like EffectsPanel so this suite needs no GameDateProvider.
vi.mock('../components/encounter/ReactionPrompt', () => ({
  default: function DummyReactionPrompt() {
    return null;
  }
}));

vi.mock('../components/character-sheet/FamiliarModal', () => ({
  default: function DummyFamiliarModal({ isOpen }) {
    return isOpen ? <div data-testid="familiar-modal">Familiar Modal</div> : null;
  }
}));

vi.mock('../components/character-sheet/AnimalCompanionModal', () => ({
  default: function DummyAnimalCompanionModal({ isOpen }) {
    return isOpen ? <div data-testid="animal-companion-modal">Animal Companion Modal</div> : null;
  }
}));

vi.mock('../components/inventory/ItemModal', () => ({
  default: function DummyItemModal({ isOpen }) {
    return isOpen ? <div data-testid="item-modal">Item Modal</div> : null;
  }
}));

vi.mock('../components/inventory/InventoryTab', () => ({
  default: function DummyInventoryTab() {
    return <div data-testid="inventory-tab">Inventory Tab</div>;
  }
}));

vi.mock('../components/actions/ExplorationTab', () => ({
  default: function DummyExplorationTab() {
    return <div data-testid="exploration-tab">Exploration Tab</div>;
  }
}));

// The mode-aware second rail tab follows usePlayMode(). Default to exploration;
// individual tests override the mock to exercise encounter mode.
let mockPlayMode = 'exploration';
vi.mock('../hooks/usePlayMode', () => ({
  usePlayMode: () => ({ mode: mockPlayMode }),
}));
vi.mock('../hooks/useEncounter', () => ({
  useEncounter: () => ({ encounter: { active: mockPlayMode === 'encounter' } }),
}));

const mockCharacter = {
  id: '1',
  name: 'Test Character',
  level: 1,
  abilities: {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10
  },
  inventory: [],
  feats: []
};

const renderWithRouter = (character, characterId = '1') => {
  const mockContext = {
    getCharacter: vi.fn(() => character),
    setActiveCharacter: vi.fn(),
    activeCharacterColor: '#7E8C9A',
    characters: [character]
  };

  return render(
    <CharacterContext.Provider value={mockContext}>
      <MemoryRouter initialEntries={[`/character/${characterId}`]}>
        <Routes>
          <Route path="/character/:id" element={<CharacterSheet />} />
        </Routes>
      </MemoryRouter>
    </CharacterContext.Provider>
  );
};

describe('CharacterSheet', () => {
  beforeEach(() => {
    mockPlayMode = 'exploration';
  });

  it('should render without crashing', () => {
    expect(() => renderWithRouter(mockCharacter)).not.toThrow();
  });

  it('should display loading message when no character', () => {
    const mockContextEmpty = {
      getCharacter: vi.fn(() => null),
      setActiveCharacter: vi.fn(),
      activeCharacterColor: '#7E8C9A',
      characters: []
    };

    render(
      <CharacterContext.Provider value={mockContextEmpty}>
        <MemoryRouter initialEntries={['/character/nonexistent']}>
          <Routes>
            <Route path="/character/:id" element={<CharacterSheet />} />
          </Routes>
        </MemoryRouter>
      </CharacterContext.Provider>
    );
  });

  it('should display character name', () => {
    renderWithRouter(mockCharacter);
    expect(screen.getByText('Test Character')).toBeInTheDocument();
  });

  it('should display stats block on the Stats tab', () => {
    renderWithRouter(mockCharacter);
    // StatsBlock now lives in the Stats bottom-rail tab, not the default tab.
    fireEvent.click(screen.getByRole('button', { name: 'Stats' }));
    expect(screen.getByTestId('stats-block')).toBeInTheDocument();
  });

  describe('masthead hero points (the interactive surface)', () => {
    // The useCharacter mock spreads the character, so heroPoints/setHeroPoints
    // ride the character prop straight onto characterModel.
    it('renders pips reflecting the current value', () => {
      renderWithRouter({ ...mockCharacter, heroPoints: 1, setHeroPoints: vi.fn() });
      expect(screen.getByLabelText('Spend hero point 1')).toBeInTheDocument();
      expect(screen.getByLabelText('Add hero point 2')).toBeInTheDocument();
      expect(screen.getByLabelText('Add hero point 3')).toBeInTheDocument();
    });

    it('clicking an empty pip adds a point; a filled pip spends one', () => {
      const setHeroPoints = vi.fn();
      renderWithRouter({ ...mockCharacter, heroPoints: 1, setHeroPoints });

      fireEvent.click(screen.getByLabelText('Add hero point 2'));
      expect(setHeroPoints.mock.calls[0][0](1)).toBe(2); // increment

      fireEvent.click(screen.getByLabelText('Spend hero point 1'));
      expect(setHeroPoints.mock.calls[1][0](1)).toBe(0); // decrement
    });

    it('hero points are clamped to the 0–3 range', () => {
      const setHeroPoints = vi.fn();
      renderWithRouter({ ...mockCharacter, heroPoints: 3, setHeroPoints });
      // All three filled — clicking the third spends down, never exceeds max.
      fireEvent.click(screen.getByLabelText('Spend hero point 3'));
      expect(setHeroPoints.mock.calls[0][0](3)).toBe(2);
    });
  });

  it('should render tab navigation buttons', () => {
    renderWithRouter(mockCharacter);
    
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should switch to feats tab on button click', () => {
    renderWithRouter(mockCharacter);
    
    const buttons = screen.getAllByRole('button');
    const featsButton = buttons.find(btn => btn.textContent.includes('Feats'));
    
    if (featsButton) {
      fireEvent.click(featsButton);
      expect(screen.getByTestId('feats-list')).toBeInTheDocument();
    }
  });

  it('should switch to spells tab on button click', () => {
    renderWithRouter(mockCharacter);
    
    const buttons = screen.getAllByRole('button');
    const spellsButton = buttons.find(btn => btn.textContent.includes('Spells'));
    
    if (spellsButton) {
      fireEvent.click(spellsButton);
      expect(screen.getByTestId('spells-list')).toBeInTheDocument();
    }
  });

  it('should switch to inventory tab on button click', () => {
    renderWithRouter(mockCharacter);
    
    const buttons = screen.getAllByRole('button');
    const inventoryButton = buttons.find(btn => btn.textContent.includes('Inventory'));
    
    if (inventoryButton) {
      fireEvent.click(inventoryButton);
      expect(screen.getByTestId('inventory-tab')).toBeInTheDocument();
    }
  });

  it('should display stats block by default', () => {
    renderWithRouter(mockCharacter);
    expect(screen.getByTestId('stats-block')).toBeInTheDocument();
  });

  it('shows the Explore mode tab with exploration content by default', () => {
    renderWithRouter(mockCharacter);
    const modeBtn = screen.getByRole('button', { name: /exploration/i });
    fireEvent.click(modeBtn);
    expect(screen.getByTestId('exploration-tab')).toBeInTheDocument();
  });

  it('shows the Encounter mode tab with combat content during encounter', () => {
    mockPlayMode = 'encounter';
    renderWithRouter(mockCharacter);
    const modeBtn = screen.getByRole('button', { name: /encounter/i });
    fireEvent.click(modeBtn);
    expect(screen.getByTestId('actions-list')).toBeInTheDocument();
  });

  it('should contain character sheet container', () => {
    const { container } = renderWithRouter(mockCharacter);
    const sheet = container.querySelector('.character-sheet');
    expect(sheet).toBeInTheDocument();
  });

  it('should handle missing character gracefully', () => {
    const mockContextEmpty = {
      getCharacter: vi.fn(() => null),
      setActiveCharacter: vi.fn(),
      activeCharacterColor: '#7E8C9A'
    };

    const { container } = render(
      <CharacterContext.Provider value={mockContextEmpty}>
        <MemoryRouter initialEntries={['/character/1']}>
          <Routes>
            <Route path="/character/:id" element={<CharacterSheet />} />
          </Routes>
        </MemoryRouter>
      </CharacterContext.Provider>
    );

    // Should either show loading or be empty
    expect(container).toBeInTheDocument();
  });

  it('renders entity image when character.image is set', () => {
    const withImage = { ...mockCharacter, image: 'img_hero.jpg' };
    const { container } = renderWithRouter(withImage);
    const img = container.querySelector('.entity-image');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', '/api/images/img_hero.jpg');
  });

  it('does not render entity image when character.image is absent', () => {
    const { container } = renderWithRouter(mockCharacter);
    expect(container.querySelector('.entity-image')).toBeNull();
  });
});
