import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CharacterInventorySection from './CharacterInventorySection';

vi.mock('../shared/CollapsibleCard', () => ({
  default: function DummyCollapsibleCard({ children, header }) {
    return (
      <div data-testid="collapsible-card">
        <div data-testid="collapsible-header">{header}</div>
        <div data-testid="collapsible-content">{children}</div>
      </div>
    );
  }
}));

vi.mock('../../utils/CharacterUtils', () => ({
  getCharacterColor: vi.fn(() => '#4a90d9'),
}));

vi.mock('../../utils/InventoryUtils', () => ({
  formatBulk: vi.fn((b) => (b === 0 ? '—' : String(b))),
}));

vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (character) => {
    if (!character) return { bulkStats: { bulkLimit: 10 }, id: null, name: null, characterClass: null };
    return {
      bulkStats: { bulkLimit: character.bulkLimit || 10 },
      id: character.id,
      name: character.name,
      characterClass: character.characterClass,
    };
  },
}));

const mockCharacter = {
  id: 'char-1',
  name: 'Aria',
  characterClass: 'Wizard',
  bulkLimit: 8,
};

const makeItem = (overrides) => ({
  uniqueId: `item-${Math.random()}`,
  characterId: 'char-1',
  name: 'Longsword',
  quantity: 1,
  totalBulk: 1,
  totalValue: 5,
  singleBulk: '1',
  price: 5,
  isInContainer: false,
  ...overrides,
});

describe('CharacterInventorySection', () => {
  const defaultProps = {
    character: mockCharacter,
    characterIndex: 0,
    items: [],
    onItemClick: vi.fn(),
    sortBy: 'name',
    searchTerm: '',
    showContainerItems: true,
  };

  it('renders without crashing', () => {
    expect(() => render(<CharacterInventorySection {...defaultProps} />)).not.toThrow();
  });

  it('renders character name', () => {
    render(<CharacterInventorySection {...defaultProps} />);
    expect(screen.getByText('Aria')).toBeInTheDocument();
  });

  it('renders character class', () => {
    render(<CharacterInventorySection {...defaultProps} />);
    expect(screen.getByText('Wizard')).toBeInTheDocument();
  });

  it('renders "Unknown Class" when characterClass is absent', () => {
    const char = { ...mockCharacter, characterClass: null };
    render(<CharacterInventorySection {...defaultProps} character={char} />);
    expect(screen.getByText('Unknown Class')).toBeInTheDocument();
  });

  it('renders item rows when items exist for this character', () => {
    const items = [makeItem({ name: 'Shield' }), makeItem({ name: 'Dagger' })];
    render(<CharacterInventorySection {...defaultProps} items={items} />);
    expect(screen.getByText('Shield')).toBeInTheDocument();
    expect(screen.getByText('Dagger')).toBeInTheDocument();
  });

  it('renders empty state when no items match', () => {
    render(<CharacterInventorySection {...defaultProps} items={[]} />);
    expect(screen.getByText(/No items found for Aria/)).toBeInTheDocument();
  });

  it('shows container hint when showContainerItems is false and list is empty', () => {
    render(
      <CharacterInventorySection
        {...defaultProps}
        items={[]}
        showContainerItems={false}
      />
    );
    expect(screen.getByText(/Show items in containers/)).toBeInTheDocument();
  });

  it('does not show container hint when showContainerItems is true and list is empty', () => {
    render(<CharacterInventorySection {...defaultProps} items={[]} showContainerItems={true} />);
    expect(screen.queryByText(/Show items in containers/)).toBeNull();
  });

  it('excludes items with isInContainer when showContainerItems is false', () => {
    const items = [
      makeItem({ name: 'Top-level Item', isInContainer: false }),
      makeItem({ name: 'Nested Item', isInContainer: true }),
    ];
    render(
      <CharacterInventorySection {...defaultProps} items={items} showContainerItems={false} />
    );
    expect(screen.getByText('Top-level Item')).toBeInTheDocument();
    expect(screen.queryByText('Nested Item')).toBeNull();
  });

  it('includes items with isInContainer when showContainerItems is true', () => {
    const items = [
      makeItem({ name: 'Top-level Item', isInContainer: false }),
      makeItem({ name: 'Nested Item', isInContainer: true }),
    ];
    render(
      <CharacterInventorySection {...defaultProps} items={items} showContainerItems={true} />
    );
    expect(screen.getByText('Top-level Item')).toBeInTheDocument();
    expect(screen.getByText('Nested Item')).toBeInTheDocument();
  });

  it('filters items by searchTerm (case-insensitive)', () => {
    const items = [
      makeItem({ name: 'Longsword' }),
      makeItem({ name: 'Shield' }),
    ];
    render(
      <CharacterInventorySection {...defaultProps} items={items} searchTerm="long" />
    );
    expect(screen.getByText('Longsword')).toBeInTheDocument();
    expect(screen.queryByText('Shield')).toBeNull();
  });

  it('shows all items when searchTerm is empty string', () => {
    const items = [makeItem({ name: 'Longsword' }), makeItem({ name: 'Shield' })];
    render(<CharacterInventorySection {...defaultProps} items={items} searchTerm="" />);
    expect(screen.getByText('Longsword')).toBeInTheDocument();
    expect(screen.getByText('Shield')).toBeInTheDocument();
  });

  it('sorts by name (default)', () => {
    const items = [
      makeItem({ name: 'Zebra Hide' }),
      makeItem({ name: 'Apple Sword' }),
    ];
    const { container } = render(
      <CharacterInventorySection {...defaultProps} items={items} sortBy="name" />
    );
    const rows = container.querySelectorAll('tbody tr');
    expect(rows[0]).toHaveTextContent('Apple Sword');
    expect(rows[1]).toHaveTextContent('Zebra Hide');
  });

  it('sorts by bulk (descending)', () => {
    const items = [
      makeItem({ name: 'Light Item', totalBulk: 1 }),
      makeItem({ name: 'Heavy Item', totalBulk: 5 }),
    ];
    const { container } = render(
      <CharacterInventorySection {...defaultProps} items={items} sortBy="bulk" />
    );
    const rows = container.querySelectorAll('tbody tr');
    expect(rows[0]).toHaveTextContent('Heavy Item');
    expect(rows[1]).toHaveTextContent('Light Item');
  });

  it('sorts by value (descending)', () => {
    const items = [
      makeItem({ name: 'Cheap Item', totalValue: 1 }),
      makeItem({ name: 'Expensive Item', totalValue: 100 }),
    ];
    const { container } = render(
      <CharacterInventorySection {...defaultProps} items={items} sortBy="value" />
    );
    const rows = container.querySelectorAll('tbody tr');
    expect(rows[0]).toHaveTextContent('Expensive Item');
    expect(rows[1]).toHaveTextContent('Cheap Item');
  });

  it('calls onItemClick when a row is clicked', () => {
    const onItemClick = vi.fn();
    const item = makeItem({ name: 'Sword' });
    render(
      <CharacterInventorySection {...defaultProps} items={[item]} onItemClick={onItemClick} />
    );
    fireEvent.click(screen.getByText('Sword').closest('tr'));
    expect(onItemClick).toHaveBeenCalledWith(item);
  });

  it('renders rows with cursor pointer when onItemClick is provided', () => {
    const item = makeItem({ name: 'Sword' });
    const { container } = render(
      <CharacterInventorySection {...defaultProps} items={[item]} onItemClick={vi.fn()} />
    );
    const row = container.querySelector('tbody tr');
    expect(row).toHaveStyle('cursor: pointer');
  });

  it('renders rows with cursor default when onItemClick is absent', () => {
    const item = makeItem({ name: 'Sword' });
    const { container } = render(
      <CharacterInventorySection {...defaultProps} items={[item]} onItemClick={undefined} />
    );
    const row = container.querySelector('tbody tr');
    expect(row).toHaveStyle('cursor: default');
  });

  it('renders "—" for value cell when item.price is absent', () => {
    const item = makeItem({ name: 'Freebie', price: undefined });
    render(<CharacterInventorySection {...defaultProps} items={[item]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders value in gp when item.price is present', () => {
    const item = makeItem({ name: 'Coin', price: 10, totalValue: 10 });
    render(<CharacterInventorySection {...defaultProps} items={[item]} />);
    expect(screen.getByText('10 gp')).toBeInTheDocument();
  });

  it('renders quantity fallback of 1 when item.quantity is absent', () => {
    const item = makeItem({ name: 'Potion', quantity: undefined });
    const { container } = render(
      <CharacterInventorySection {...defaultProps} items={[item]} />
    );
    const quantityCell = container.querySelector('.quantity-cell');
    expect(quantityCell).toHaveTextContent('1');
  });

  it('only shows items belonging to the current character', () => {
    const items = [
      makeItem({ name: 'My Sword', characterId: 'char-1' }),
      makeItem({ name: 'Other Sword', characterId: 'char-2' }),
    ];
    render(<CharacterInventorySection {...defaultProps} items={items} />);
    expect(screen.getByText('My Sword')).toBeInTheDocument();
    expect(screen.queryByText('Other Sword')).toBeNull();
  });
});
