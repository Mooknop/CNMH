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

// Consumed overlay (cnmh_consumed_<charId>) + affix overlay (cnmh_affixed_<id>);
// gold key gets its default.
let mockConsumed = {};
let mockAffixed = {};
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, initialValue) => {
    if (key.startsWith('cnmh_consumed_')) return [mockConsumed, vi.fn()];
    if (key.startsWith('cnmh_affixed_')) return [mockAffixed, vi.fn()];
    return [initialValue, vi.fn()];
  },
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
    if (character.id === 'talisman') {
      return {
        id: 'talisman',
        bulkStats: { bulkLimit: 10, encumberedThreshold: 7 },
        totalBulk: 1,
        inventory: [
          { uid: 'w1', id: 'w1', name: 'Longsword', weight: 1, state: 'held1', strikes: [{ damage: '1d8' }] },
          { uid: 't1', id: 't1', name: 'Wolf Fang', weight: 0, state: 'worn', traits: ['Talisman'], talisman: { affixTo: 'weapon' } },
        ],
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

// Give-gold flow (#655): play mode drives whether the button shows; the modal
// itself is exercised in GiveGoldModal.test.jsx, so stub it here.
let mockMode = 'exploration';
vi.mock('../../hooks/usePlayMode', () => ({
  usePlayMode: () => ({ mode: mockMode }),
}));
vi.mock('./GiveGoldModal', () => ({
  default: function DummyGiveGoldModal({ isOpen }) {
    return isOpen ? <div data-testid="give-gold-modal">Give Gold</div> : null;
  },
}));

const mockCharacter = { id: '1', name: 'Test Character', level: 1 };

beforeEach(() => {
  mockConsumed = {};
  mockAffixed = {};
  mockMode = 'exploration';
});

describe('InventoryTab — affixed talismans (#254/#339)', () => {
  it('shows an affixed talisman as an indented child line, not its own card', () => {
    mockAffixed = { t1: 'w1' };
    const { container } = render(<InventoryTab character={{ id: 'talisman' }} characterColor="#7E8C9A" />);
    // Host still has its card; the talisman is no longer a standalone card.
    expect(screen.getByTestId('item-card-w1')).toBeInTheDocument();
    expect(screen.queryByTestId('item-card-t1')).not.toBeInTheDocument();
    // It renders as the indented affixed line instead.
    const line = container.querySelector('.affixed-talisman-line');
    expect(line).toBeInTheDocument();
    expect(line).toHaveTextContent('Wolf Fang');
  });

  it('shows the talisman as a normal card when not affixed', () => {
    mockAffixed = {};
    const { container } = render(<InventoryTab character={{ id: 'talisman' }} characterColor="#7E8C9A" />);
    expect(screen.getByTestId('item-card-t1')).toBeInTheDocument();
    expect(container.querySelector('.affixed-talisman-line')).toBeNull();
  });
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
    const bar = screen.getByTestId('inventory-bulkbar');
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveTextContent('5/10'); // used / limit
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

  // #655: give-gold is an out-of-combat affordance.
  describe('Give gold button (#655)', () => {
    it('shows the button in exploration and opens the modal on tap', () => {
      mockMode = 'exploration';
      render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
      const btn = screen.getByTestId('give-gold-open');
      expect(btn).toBeInTheDocument();
      expect(screen.queryByTestId('give-gold-modal')).not.toBeInTheDocument();
      fireEvent.click(btn);
      expect(screen.getByTestId('give-gold-modal')).toBeInTheDocument();
    });

    it('shows the button in downtime', () => {
      mockMode = 'downtime';
      render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
      expect(screen.getByTestId('give-gold-open')).toBeInTheDocument();
    });

    it('hides the button in encounter mode', () => {
      mockMode = 'encounter';
      render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
      expect(screen.queryByTestId('give-gold-open')).not.toBeInTheDocument();
    });
  });

  it('renders the bulk fill at the correct width', () => {
    const { container } = render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    const fill = container.querySelector('.bulkbar-fill');
    expect(fill).toBeInTheDocument();
    // 5 / 10 = 50%, bridged through the CSS custom property.
    expect(fill.style.getPropertyValue('--bulk-fill-w')).toBe('50%');
  });

  it('renders the ContainersList', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByTestId('containers-list')).toBeInTheDocument();
  });

  it('shows the empty message when inventory is empty', () => {
    render(<InventoryTab character={{ id: 'empty' }} characterColor="#7E8C9A" />);
    expect(screen.getByText('No items in inventory')).toBeInTheDocument();
  });

  it('shows the encumbered warning and flags the bar when over the threshold', () => {
    render(<InventoryTab character={{ id: 'enc' }} characterColor="#7E8C9A" />);
    expect(screen.getByText(/^Encumbered:/)).toBeInTheDocument();
    expect(screen.getByTestId('inventory-bulkbar')).toHaveClass('is-encumbered');
  });

  it('shows the overencumbered warning and flags the bar when over the limit', () => {
    const { container } = render(<InventoryTab character={{ id: 'over' }} characterColor="#7E8C9A" />);
    expect(screen.getByText(/^Overencumbered:/)).toBeInTheDocument();
    expect(container.querySelector('.bulk-warning.severe')).toBeInTheDocument();
    expect(screen.getByTestId('inventory-bulkbar')).toHaveClass('is-over');
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
