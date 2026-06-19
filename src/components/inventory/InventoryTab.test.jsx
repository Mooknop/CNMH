import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import InventoryTab from './InventoryTab';

vi.mock('../../utils/InventoryUtils', async () => ({
  // Real isConsumable / remainingQuantity — the consumed-overlay wiring below
  // exercises the genuine #217 behavior (scrolls AND consumable-tagged items).
  ...(await vi.importActual('../../utils/InventoryUtils')),
  formatBulk: (bulk) => {
    if (bulk === 0) return '—';
    if (bulk < 1) return 'L';
    return bulk.toString();
  },
  getBulkStatus: (used, limit, threshold) => ({
    percentage: limit > 0 ? (used / limit) * 100 : 0,
    isEncumbered: used > threshold && used <= limit,
    isOverencumbered: used > limit
  }),
}));

// Consumed-consumables overlay (cnmh_consumed_<charId>); gold key gets its default.
let mockConsumed = {};
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, initialValue) =>
    key.startsWith('cnmh_consumed_') ? [mockConsumed, vi.fn()] : [initialValue, vi.fn()],
}));

vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (character) => {
    if (!character) return null;
    if (character.id === 'empty') {
      return {
        id: 'empty',
        bulkStats: { bulkLimit: 10, encumberedThreshold: 7 },
        totalBulk: 0,
        inventory: [],
        skillProficiencies: { crafting: 0 },
      };
    }
    if (character.id === 'potions') {
      return {
        id: 'potions',
        bulkStats: { bulkLimit: 10, encumberedThreshold: 7 },
        totalBulk: 1,
        inventory: [
          { uid: 's1', id: 's1', name: 'Longsword', weight: 1, state: 'held2' },
          {
            uid: 'p1', id: 'p1', name: 'Minor Healing Potion', weight: 0.1, quantity: 3,
            state: 'worn', consumable: { kind: 'healing' },
          },
        ],
        skillProficiencies: { crafting: 0 },
      };
    }
    if (character.id === 'enc' || character.id === 'over') {
      return {
        id: character.id,
        bulkStats: { bulkLimit: 10, encumberedThreshold: 7 },
        totalBulk: character.id === 'over' ? 15 : 8,
        inventory: [{ uid: 'x', id: 'x', name: 'Anvil', weight: 8, state: 'worn' }],
        skillProficiencies: { crafting: 0 },
      };
    }
    return {
      id: 'hero',
      bulkStats: { bulkLimit: 10, encumberedThreshold: 7 },
      totalBulk: 5,
      inventory: [
        { uid: 'u1', id: '1', name: 'Longsword', weight: 1, state: 'held2' },
        { uid: 'u2', id: '2', name: 'Leather Armor', weight: 1, state: 'dropped' },
        { uid: 'u3', id: '3', name: 'Worn Cloak', weight: 0.5, state: 'worn' },
        {
          uid: 'u4', id: '4', name: 'Backpack', weight: 0.1, state: 'worn',
          container: { capacity: 4, ignored: 1, contents: [] },
        },
      ],
      skillProficiencies: { crafting: 1 },
    };
  }
}));

// ItemCard internals are tested separately; here we just verify the list wiring.
vi.mock('./ItemCard', () => ({
  default: function DummyItemCard({ item, onClick }) {
    return (
      <button data-testid={`item-card-${item.uid}`} onClick={() => onClick(item)}>
        {item.name}
      </button>
    );
  }
}));

vi.mock('./ContainersList', () => ({
  default: function DummyContainersList() {
    return <div data-testid="containers-list">Containers List</div>;
  }
}));

const mockCharacter = { id: '1', name: 'Test Character', level: 1 };

beforeEach(() => {
  mockConsumed = {};
});

describe('InventoryTab', () => {
  it('renders without crashing', () => {
    expect(() => render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />)).not.toThrow();
  });

  it('handles null character gracefully', () => {
    expect(() => render(<InventoryTab character={null} characterColor="#7E8C9A" />)).not.toThrow();
  });

  it('displays the inventory header', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByText('Inventory')).toBeInTheDocument();
  });

  it('displays the character personal gold', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByText(/💰\s*0 gp/)).toBeInTheDocument();
  });

  it('displays bulk information', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByText(/Bulk Used:/)).toBeInTheDocument();
    expect(screen.getByText(/Encumbered at:/)).toBeInTheDocument();
    expect(screen.getByText(/Maximum:/)).toBeInTheDocument();
  });

  it('renders an item card for each inventory entry', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByTestId('item-card-u1')).toBeInTheDocument();
    expect(screen.getByTestId('item-card-u2')).toBeInTheDocument();
    expect(screen.getByTestId('item-card-u3')).toBeInTheDocument();
    expect(screen.getByTestId('item-card-u4')).toBeInTheDocument();
  });

  it('sorts items alphabetically by name', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    const cards = screen.getAllByTestId(/^item-card-/);
    const names = cards.map((c) => c.textContent);
    expect(names).toEqual(['Backpack', 'Leather Armor', 'Longsword', 'Worn Cloak']);
  });

  it('calls onItemClick when an item card is tapped', () => {
    const onItemClick = vi.fn();
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" onItemClick={onItemClick} />);
    fireEvent.click(screen.getByTestId('item-card-u3'));
    expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u3', name: 'Worn Cloak' }));
  });

  it('no longer renders a Crafting button (moved to the Downtime tab)', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.queryByText('Crafting')).not.toBeInTheDocument();
  });

  it('renders the bulk progress bar at the correct width', () => {
    const { container } = render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    const progressBar = container.querySelector('.bulk-progress-bar');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveStyle('width: 50%'); // 5 / 10
  });

  it('renders the ContainersList', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByTestId('containers-list')).toBeInTheDocument();
  });

  it('shows the empty message when inventory is empty', () => {
    render(<InventoryTab character={{ id: 'empty' }} characterColor="#7E8C9A" />);
    expect(screen.getByText('No items in inventory')).toBeInTheDocument();
  });

  it('shows the encumbered warning and an amber bar when over the threshold', () => {
    const { container } = render(<InventoryTab character={{ id: 'enc' }} characterColor="#7E8C9A" />);
    expect(screen.getByText(/^Encumbered:/)).toBeInTheDocument();
    // Assert the inline CSS variable directly: happy-dom doesn't surface an
    // unresolved var() through toHaveStyle (getComputedStyle), but preserves it
    // on element.style — which is what we actually set.
    expect(container.querySelector('.bulk-progress-bar').style.backgroundColor).toBe('var(--color-warning)');
  });

  it('shows the overencumbered warning and a danger bar when over the limit', () => {
    const { container } = render(<InventoryTab character={{ id: 'over' }} characterColor="#7E8C9A" />);
    expect(screen.getByText(/^Overencumbered:/)).toBeInTheDocument();
    expect(container.querySelector('.bulk-warning.severe')).toBeInTheDocument();
    expect(container.querySelector('.bulk-progress-bar').style.backgroundColor).toBe('var(--color-danger)');
  });

  // #217: consumable-tagged items honor the consumed overlay like scrolls do.
  describe('consumed-consumables overlay', () => {
    it('passes the reduced remaining quantity to a partially-consumed item', () => {
      mockConsumed = { 'Minor Healing Potion': 2 };
      const onItemClick = vi.fn();
      render(<InventoryTab character={{ id: 'potions' }} characterColor="#7E8C9A" onItemClick={onItemClick} />);
      fireEvent.click(screen.getByTestId('item-card-p1'));
      expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ name: 'Minor Healing Potion', quantity: 1 }));
    });

    it('hides a fully-consumed consumable but keeps other items', () => {
      mockConsumed = { 'Minor Healing Potion': 3 };
      render(<InventoryTab character={{ id: 'potions' }} characterColor="#7E8C9A" />);
      expect(screen.queryByTestId('item-card-p1')).not.toBeInTheDocument();
      expect(screen.getByTestId('item-card-s1')).toBeInTheDocument();
    });

    it('leaves non-consumables untouched by the overlay', () => {
      mockConsumed = { Longsword: 1 };
      render(<InventoryTab character={{ id: 'potions' }} characterColor="#7E8C9A" />);
      expect(screen.getByTestId('item-card-s1')).toBeInTheDocument();
    });
  });
});
