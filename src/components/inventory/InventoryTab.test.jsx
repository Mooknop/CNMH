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
let mockInvested = {};
let mockItemEffects = [];
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, initialValue) => {
    if (key.startsWith('cnmh_consumed_')) return [mockConsumed, vi.fn()];
    if (key.startsWith('cnmh_affixed_')) return [mockAffixed, vi.fn()];
    if (key.startsWith('cnmh_invested_')) return [mockInvested, vi.fn()];
    if (key.startsWith('cnmh_itemeffects_')) return [mockItemEffects, vi.fn()];
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
          { uid: 's1', id: 's1', name: 'Longsword', weight: 1, state: 'worn' },
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
    if (character.id === 'attune') {
      return {
        id: 'attune',
        bulkStats: { bulkLimit: 10, encumberedThreshold: 7 },
        totalBulk: 1,
        inventory: [
          { uid: 'amulet', id: 'amulet', name: "Mother's Amulet", weight: 0.1, state: 'worn', traits: ['Magical', 'Invested'] },
          { uid: 'sword', id: 'sword', name: 'Longsword', weight: 1, state: 'worn', strikes: [{ damage: '1d8' }] },
        ],
        skillProficiencies: { crafting: 0 },
      };
    }
    if (character.id === 'hands') {
      return {
        id: 'hands',
        bulkStats: { bulkLimit: 10, encumberedThreshold: 7 },
        totalBulk: 2,
        inventory: [
          { uid: 'h1', id: 'h1', name: 'Longsword', weight: 1, state: 'held1', hand: 1, strikes: [{ damage: '1d8' }] },
          { uid: 'sh', id: 'sh', name: 'Buckler', weight: 0.5, state: 'held1', hand: 2, shield: { bonus: 1 } },
          { uid: 'wc', id: 'wc', name: 'Cloak', weight: 0.1, state: 'worn' },
        ],
        skillProficiencies: { crafting: 0 },
      };
    }
    if (character.id === 'talisman') {
      return {
        id: 'talisman',
        bulkStats: { bulkLimit: 10, encumberedThreshold: 7 },
        totalBulk: 1,
        inventory: [
          { uid: 'w1', id: 'w1', name: 'Longsword', weight: 1, state: 'worn', strikes: [{ damage: '1d8' }] },
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
        { uid: 'u1', id: '1', name: 'Longsword', weight: 1, state: 'worn' },
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

// Grid tiles are draggable buttons: a pointer-down with no movement followed by
// a pointer-up is treated as a tap (opens the ItemModal). A real tap also emits
// a trailing synthetic click, which the dnd hook swallows so it can't pass
// through to the freshly-opened modal (#871) — simulate the full gesture so the
// one-shot suppressor is consumed and never leaks into the next interaction.
const tapTile = (el) => {
  fireEvent.pointerDown(el, { clientX: 0, clientY: 0 });
  window.dispatchEvent(new Event('pointerup'));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};

beforeEach(() => {
  mockConsumed = {};
  mockAffixed = {};
  mockInvested = {};
  mockItemEffects = [];
  mockMode = 'exploration';
});

describe('InventoryTab — affixed talismans (#254/#339)', () => {
  it('hides an affixed talisman from the grid; its host keeps its tile', () => {
    mockAffixed = { t1: 'w1' };
    render(<InventoryTab character={{ id: 'talisman' }} characterColor="#7E8C9A" />);
    // Host still has a tile; the affixed talisman gets no tile of its own (it's
    // reachable via the host's ItemModal).
    expect(screen.getByTestId('grid-cell-w1')).toBeInTheDocument();
    expect(screen.queryByTestId('grid-cell-t1')).not.toBeInTheDocument();
  });

  it('shows the talisman as a normal tile when not affixed', () => {
    mockAffixed = {};
    render(<InventoryTab character={{ id: 'talisman' }} characterColor="#7E8C9A" />);
    expect(screen.getByTestId('grid-cell-t1')).toBeInTheDocument();
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

  it('renders a grid tile for each non-container item; containers are tabs', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    // Worn bag holds the worn / held / dropped items …
    expect(screen.getByTestId('grid-cell-u1')).toBeInTheDocument();
    expect(screen.getByTestId('grid-cell-u2')).toBeInTheDocument();
    expect(screen.getByTestId('grid-cell-u3')).toBeInTheDocument();
    // … while the container becomes a bag tab, not a tile.
    expect(screen.getByTestId('bag-tab-u4')).toBeInTheDocument();
    expect(screen.queryByTestId('grid-cell-u4')).not.toBeInTheDocument();
  });

  it('sorts the active bag alphabetically by name', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    const names = screen.getAllByTestId(/^grid-cell-/).map((c) => c.querySelector('.cell-name').textContent);
    expect(names).toEqual(['Leather Armor', 'Longsword', 'Worn Cloak']);
  });

  it('calls onItemClick when a tile is tapped', () => {
    const onItemClick = vi.fn();
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" onItemClick={onItemClick} />);
    tapTile(screen.getByTestId('grid-cell-u3'));
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

  it('renders a bag tab for each container, plus the Worn tab', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByTestId('bag-tab-worn')).toBeInTheDocument();
    const backpackTab = screen.getByTestId('bag-tab-u4');
    expect(backpackTab).toHaveTextContent('Backpack');
  });

  it('switches to a container bag and shows its (empty) contents', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByTestId('bag-tab-u4'));
    // Worn items are no longer shown; the empty container reads as empty.
    expect(screen.queryByTestId('grid-cell-u3')).not.toBeInTheDocument();
    expect(screen.getByText('This bag is empty.')).toBeInTheDocument();
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
      tapTile(screen.getByTestId('grid-cell-p1'));
      expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ name: 'Minor Healing Potion', quantity: 1 }));
    });

    it('hides a fully-consumed consumable but keeps other items', () => {
      mockConsumed = { 'Minor Healing Potion': 3 };
      render(<InventoryTab character={{ id: 'potions' }} characterColor="#7E8C9A" />);
      expect(screen.queryByTestId('grid-cell-p1')).not.toBeInTheDocument();
      expect(screen.getByTestId('grid-cell-s1')).toBeInTheDocument();
    });

    it('leaves non-consumables untouched by the overlay', () => {
      mockConsumed = { Longsword: 1 };
      render(<InventoryTab character={{ id: 'potions' }} characterColor="#7E8C9A" />);
      expect(screen.getByTestId('grid-cell-s1')).toBeInTheDocument();
    });
  });

  // S3: Attuned area (cnmh_invested_<id>) — invested items render in the Attuned
  // area instead of their bag; eligibility is the Invested trait.
  describe('Attuned area (#invest)', () => {
    it('always renders the Attuned area with a count of invested / 10', () => {
      render(<InventoryTab character={{ id: 'attune' }} characterColor="#7E8C9A" />);
      const area = screen.getByTestId('attuned-area');
      expect(area).toBeInTheDocument();
      expect(area).toHaveTextContent('0 / 10 invested');
    });

    it('keeps an un-invested item in its bag', () => {
      render(<InventoryTab character={{ id: 'attune' }} characterColor="#7E8C9A" />);
      expect(screen.getByTestId('grid-cell-amulet')).toBeInTheDocument();
      expect(screen.queryByTestId('attuned-tile-amulet')).not.toBeInTheDocument();
    });

    it('moves an invested item out of its bag and into the Attuned area', () => {
      mockInvested = { amulet: true };
      render(<InventoryTab character={{ id: 'attune' }} characterColor="#7E8C9A" />);
      // Invested amulet shows as an attuned tile, not a bag tile…
      expect(screen.getByTestId('attuned-tile-amulet')).toBeInTheDocument();
      expect(screen.queryByTestId('grid-cell-amulet')).not.toBeInTheDocument();
      // …the non-invested sword stays in the Worn bag…
      expect(screen.getByTestId('grid-cell-sword')).toBeInTheDocument();
      // …and the count reflects it.
      expect(screen.getByTestId('attuned-area')).toHaveTextContent('1 / 10 invested');
    });

    it('opens the ItemModal when an attuned tile is tapped', () => {
      mockInvested = { amulet: true };
      const onItemClick = vi.fn();
      render(<InventoryTab character={{ id: 'attune' }} characterColor="#7E8C9A" onItemClick={onItemClick} />);
      tapTile(screen.getByTestId('attuned-tile-amulet'));
      expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ uid: 'amulet', name: "Mother's Amulet" }));
    });
  });

  // S4: Hands strip — held items render in the two hand slots, not the bags.
  describe('Hands strip (#hands)', () => {
    it('renders held items in the hand slots, keeping them out of the bag', () => {
      render(<InventoryTab character={{ id: 'hands' }} characterColor="#7E8C9A" />);
      expect(screen.getByTestId('hands-strip')).toBeInTheDocument();
      // Hand 1 = Longsword, Hand 2 = Buckler (by their `hand` assignment).
      expect(screen.getByTestId('hands-strip-slot-1')).toHaveTextContent('Longsword');
      expect(screen.getByTestId('hands-strip-slot-2')).toHaveTextContent('Buckler');
      // Held items are pulled out of the Worn bag…
      expect(screen.queryByTestId('grid-cell-h1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('grid-cell-sh')).not.toBeInTheDocument();
      // …the worn cloak stays in the bag.
      expect(screen.getByTestId('grid-cell-wc')).toBeInTheDocument();
    });

    it('opens the ItemModal when a hand tile is tapped', () => {
      const onItemClick = vi.fn();
      render(<InventoryTab character={{ id: 'hands' }} characterColor="#7E8C9A" onItemClick={onItemClick} />);
      tapTile(screen.getByTestId('hands-tile-h1'));
      expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ uid: 'h1', name: 'Longsword' }));
    });

    it('renders empty hand slots when nothing is held', () => {
      render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
      const strip = screen.getByTestId('hands-strip');
      expect(strip).toBeInTheDocument();
      // No held items → no hand tiles, and the slots are still drop targets.
      expect(strip.querySelectorAll('.hands-strip-empty')).toHaveLength(2);
    });

    it('is read-only in encounter mode (Swap hint, no drop zones)', () => {
      mockMode = 'encounter';
      render(<InventoryTab character={{ id: 'hands' }} characterColor="#7E8C9A" />);
      expect(screen.getByText(/Use Swap in the Encounter tab/)).toBeInTheDocument();
      // The held items still show, but the slots aren't registered drop zones.
      expect(screen.getByTestId('hands-tile-h1')).toBeInTheDocument();
      expect(screen.getByTestId('hands-strip-slot-1')).not.toHaveAttribute('data-dz');
    });
  });

  // S5: Toolbar (search / auto-sort / filter chips) + oil-effect tile badge.
  describe('Toolbar + polish (#toolbar)', () => {
    it('filters the active bag by the search box', () => {
      render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
      fireEvent.change(screen.getByTestId('inventory-search'), { target: { value: 'cloak' } });
      expect(screen.getByTestId('grid-cell-u3')).toBeInTheDocument(); // Worn Cloak
      expect(screen.queryByTestId('grid-cell-u1')).not.toBeInTheDocument(); // Longsword
      expect(screen.queryByTestId('grid-cell-u2')).not.toBeInTheDocument(); // Leather Armor
    });

    it('shows the no-matches message when a search hides everything', () => {
      render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
      fireEvent.change(screen.getByTestId('inventory-search'), { target: { value: 'zzz' } });
      expect(screen.getByText('No matches in this bag.')).toBeInTheDocument();
    });

    it('filters the active bag by a filter chip', () => {
      render(<InventoryTab character={{ id: 'attune' }} characterColor="#7E8C9A" />);
      // Both present under "All"; the weapon chip keeps only the sword.
      fireEvent.click(screen.getByTestId('inventory-filter-weapon'));
      expect(screen.getByTestId('grid-cell-sword')).toBeInTheDocument();
      expect(screen.queryByTestId('grid-cell-amulet')).not.toBeInTheDocument();
      // The magic chip keeps only the (Magical) amulet.
      fireEvent.click(screen.getByTestId('inventory-filter-magic'));
      expect(screen.getByTestId('grid-cell-amulet')).toBeInTheDocument();
      expect(screen.queryByTestId('grid-cell-sword')).not.toBeInTheDocument();
    });

    it('cycles the auto-sort label A–Z → Type → Bulk', () => {
      render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
      const sort = screen.getByTestId('inventory-sort');
      expect(sort).toHaveTextContent('A–Z');
      fireEvent.click(sort);
      expect(sort).toHaveTextContent('Type');
      fireEvent.click(sort);
      expect(sort).toHaveTextContent('Bulk');
      fireEvent.click(sort);
      expect(sort).toHaveTextContent('A–Z');
    });

    it('stamps a ✨ effect badge on a tile with an active item effect', () => {
      mockItemEffects = [{ id: 'fx1', itemId: 'Worn Cloak', label: 'Weightless' }];
      render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
      expect(screen.getByTestId('grid-cell-u3')).toHaveTextContent('✨');
      expect(screen.queryByTestId('grid-cell-u1')).not.toHaveTextContent('✨');
    });

    it('opens the ItemModal on keyboard activation of a tile (a11y)', () => {
      const onItemClick = vi.fn();
      render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" onItemClick={onItemClick} />);
      fireEvent.keyDown(screen.getByTestId('grid-cell-u3'), { key: 'Enter' });
      expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u3' }));
    });
  });
});
