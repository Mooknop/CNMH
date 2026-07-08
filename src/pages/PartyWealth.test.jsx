import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharacterContext } from '../contexts/CharacterContext';
import PartyWealth from './PartyWealth';

// Mock portal so modal renders inline
vi.mock('react-dom', async () => {
  const ReactDOM = await vi.importActual('react-dom');
  return {
    ...ReactDOM,
    createPortal: (children) => children,
  };
});

vi.mock('../components/party/CharacterInventorySection', () => ({
  default: function DummyCharacterInventorySection({ character, onItemClick, items }) {
    return (
      <div data-testid={`char-section-${character.id}`}>
        <span>{character.name}</span>
        {/* Expose a button so tests can trigger onItemClick */}
        {items.length > 0 && (
          <button
            data-testid={`click-item-${character.id}`}
            onClick={() => onItemClick(items[0])}
          >
            Click Item
          </button>
        )}
      </div>
    );
  }
}));

vi.mock('../components/inventory/ItemModal', () => ({
  default: function DummyItemModal({ isOpen, item, onClose }) {
    if (!isOpen || !item) return null;
    return (
      <div data-testid="item-modal">
        <span>{item.name}</span>
        <button onClick={onClose}>Close</button>
      </div>
    );
  }
}));

vi.mock('../utils/CharacterUtils', () => ({
  getCharacterColor: vi.fn((i) => `#color${i}`),
}));

vi.mock('../utils/InventoryUtils', () => ({
  calculateItemsBulk: vi.fn(() => 1),
  formatBulk: vi.fn((b) => (b === 0 ? '—' : String(b))),
  baseSpellItemArt: () => null,
}));

vi.mock('../hooks/usePartyGold', () => ({
  usePartyGold: vi.fn(() => ({ goldById: {}, total: 1500 })),
}));

const makeCharacter = (id, name, inventory = []) => ({
  id,
  name,
  inventory,
});

const renderWithContext = (characters) => {
  return render(
    <CharacterContext.Provider value={{ characters }}>
      <PartyWealth />
    </CharacterContext.Provider>
  );
};

describe('PartyWealth', () => {
  it('renders page header', () => {
    renderWithContext([]);
    expect(screen.getByText('Party Wealth & Inventory')).toBeInTheDocument();
  });

  it('renders the party gold total', () => {
    renderWithContext([]);
    expect(screen.getByText(/1500 gp/)).toBeInTheDocument();
  });

  it('renders search input', () => {
    renderWithContext([]);
    expect(screen.getByPlaceholderText('Filter by item name...')).toBeInTheDocument();
  });

  it('renders sort select with all options', () => {
    renderWithContext([]);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByText('Item Name')).toBeInTheDocument();
    expect(screen.getByText('Bulk (Heaviest First)')).toBeInTheDocument();
    expect(screen.getByText('Value (Highest First)')).toBeInTheDocument();
  });

  it('renders a CharacterInventorySection for each character', () => {
    const characters = [
      makeCharacter('c1', 'Aria'),
      makeCharacter('c2', 'Bob'),
    ];
    renderWithContext(characters);
    expect(screen.getByTestId('char-section-c1')).toBeInTheDocument();
    expect(screen.getByTestId('char-section-c2')).toBeInTheDocument();
  });

  it('renders no CharacterInventorySections when characters is empty', () => {
    renderWithContext([]);
    expect(screen.queryByTestId(/char-section/)).toBeNull();
  });

  it('ItemModal is not rendered when no item is selected', () => {
    renderWithContext([makeCharacter('c1', 'Aria')]);
    expect(screen.queryByTestId('item-modal')).toBeNull();
  });

  it('opens ItemModal when onItemClick is triggered', () => {
    const item = { id: 'i1', name: 'Iron Sword', price: 5, quantity: 1, weight: 1 };
    const characters = [makeCharacter('c1', 'Aria', [item])];
    renderWithContext(characters);
    fireEvent.click(screen.getByTestId('click-item-c1'));
    expect(screen.getByTestId('item-modal')).toBeInTheDocument();
    expect(screen.getByText('Iron Sword')).toBeInTheDocument();
  });

  it('closes ItemModal when closeItemModal is called', () => {
    const item = { id: 'i1', name: 'Iron Sword', price: 5, quantity: 1, weight: 1 };
    const characters = [makeCharacter('c1', 'Aria', [item])];
    renderWithContext(characters);
    fireEvent.click(screen.getByTestId('click-item-c1'));
    expect(screen.getByTestId('item-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('item-modal')).toBeNull();
  });

  it('changes sortBy when sort select changes', () => {
    renderWithContext([]);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'bulk' } });
    expect(select.value).toBe('bulk');
  });

  it('updates search term when input changes', () => {
    renderWithContext([]);
    const input = screen.getByPlaceholderText('Filter by item name...');
    fireEvent.change(input, { target: { value: 'sword' } });
    expect(input.value).toBe('sword');
  });

  it('extracts items from character inventory into allPartyItems', () => {
    const item = { id: 'i1', name: 'Shield', price: 3, quantity: 1, weight: 1 };
    const characters = [makeCharacter('c1', 'Aria', [item])];
    renderWithContext(characters);
    // CharacterInventorySection mock receives items — if it receives 1 item, button appears
    expect(screen.getByTestId('click-item-c1')).toBeInTheDocument();
  });

  it('handles character with no inventory gracefully', () => {
    const characters = [makeCharacter('c1', 'Aria')]; // no inventory property set
    expect(() => renderWithContext(characters)).not.toThrow();
  });

  it('extracts container contents (item.container.contents, the resolved model shape)', () => {
    // Regression: extractAllItems used to read item.contents, which never
    // exists on resolved inventory items — container contents were silently
    // dropped from the item list and totals.
    const nestedItem = { id: 'i2', name: 'Potion', price: 2, quantity: 1, weight: 0 };
    const container = {
      id: 'c1',
      name: 'Backpack',
      price: 1,
      quantity: 1,
      weight: 1,
      container: { capacity: 4, contents: [nestedItem] },
    };
    const characters = [makeCharacter('c1', 'Aria', [container])];
    renderWithContext(characters);
    // Both the container and its contents count toward the party totals
    expect(screen.getByText(/2 items/)).toBeInTheDocument();
    // Value total includes the nested item: 1 gp (backpack) + 2 gp (potion)
    expect(screen.getByText(/📦 3 gp/)).toBeInTheDocument();
  });

  it('counts multi-quantity container contents into the value total', () => {
    const arrows = { id: 'i3', name: 'Arrows', price: 0.1, quantity: 20, weight: 0.1 };
    const quiver = {
      id: 'c2',
      name: 'Quiver',
      price: 1,
      quantity: 1,
      weight: 0.1,
      container: { capacity: 1, contents: [arrows] },
    };
    const characters = [makeCharacter('c1', 'Aria', [quiver])];
    renderWithContext(characters);
    // 1 gp (quiver) + 0.1 * 20 (arrows) = 3 gp
    expect(screen.getByText(/📦 3 gp/)).toBeInTheDocument();
    expect(screen.getByText(/2 items/)).toBeInTheDocument();
  });

  it('shows party item count in totals', () => {
    const item = { id: 'i1', name: 'Sword', price: 5, quantity: 1, weight: 1 };
    const characters = [makeCharacter('c1', 'Aria', [item])];
    renderWithContext(characters);
    expect(screen.getByText(/1 items/)).toBeInTheDocument();
  });

  it('shows 0 items when characters have no inventory', () => {
    renderWithContext([makeCharacter('c1', 'Aria')]);
    expect(screen.getByText(/0 items/)).toBeInTheDocument();
  });
});
