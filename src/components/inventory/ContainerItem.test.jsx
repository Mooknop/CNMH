import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ContainerItem from './ContainerItem';
import { calculateContainerBulk } from '../../utils/InventoryUtils';

vi.mock('../../utils/InventoryUtils', () => {
  const isConsumable = (i) => !!(i && (i.scroll || i.consumable));
  const remaining = (i, m = {}) => Math.max(0, (i.quantity ?? 1) - ((m || {})[i.name] || 0));
  return {
    calculateContainerBulk: vi.fn(({ contents = [] }) => ({
      contentsBulk: contents.reduce((sum, i) => sum + (i.weight || 0), 0),
      percentFull: 50,
    })),
    formatDecimal: vi.fn((n) => n),
    formatBulk: vi.fn((b) => (b === 0 ? '—' : String(b))),
    applyConsumedOverlay: (items, m = {}) =>
      (Array.isArray(items) ? items : [])
        .filter((i) => !isConsumable(i) || remaining(i, m) > 0)
        .map((i) => (isConsumable(i) ? { ...i, quantity: remaining(i, m) } : i)),
  };
});

// Container contents are rendered as ItemCards; mock to assert wiring only.
vi.mock('./ItemCard', () => ({
  default: function DummyItemCard({ item, onClick }) {
    return (
      <button className="mock-item-card" onClick={() => onClick(item)}>
        {item.name}
      </button>
    );
  }
}));


const makeContainer = (overrides = {}) => ({
  name: 'Backpack',
  quantity: 1,
  container: { capacity: 4, ignored: 0, contents: [] },
  ...overrides,
});

const expand = () =>
  fireEvent.click(screen.getByRole('heading', { level: 3 }).closest('.container-header'));

describe('ContainerItem', () => {
  beforeEach(() => {
    calculateContainerBulk.mockReturnValue({ contentsBulk: 0, percentFull: 50 });
  });

  it('renders null when container prop is absent', () => {
    const { container } = render(<ContainerItem themeColor="#blue" onItemClick={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when container.container is absent', () => {
    const { container } = render(
      <ContainerItem container={{ name: 'Bag' }} themeColor="#blue" onItemClick={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders container name when valid', () => {
    render(<ContainerItem container={makeContainer()} themeColor="#4a90d9" onItemClick={vi.fn()} />);
    expect(screen.getByText('Backpack')).toBeInTheDocument();
  });

  it('shows quantity in parentheses when quantity > 1', () => {
    render(<ContainerItem container={makeContainer({ quantity: 3 })} themeColor="#4a90d9" onItemClick={vi.fn()} />);
    expect(screen.getByText(/\(3\)/)).toBeInTheDocument();
  });

  it('does not show quantity in parentheses when quantity is 1', () => {
    render(<ContainerItem container={makeContainer({ quantity: 1 })} themeColor="#4a90d9" onItemClick={vi.fn()} />);
    expect(screen.queryByText(/\(\d\)/)).toBeNull();
  });

  it('shows ignored bulk label when ignored > 0', () => {
    const container = makeContainer({ container: { capacity: 4, ignored: 2, contents: [] } });
    render(<ContainerItem container={container} themeColor="#4a90d9" onItemClick={vi.fn()} />);
    expect(screen.getByText(/ignored/)).toBeInTheDocument();
  });

  it('does not show ignored bulk label when ignored is 0', () => {
    render(<ContainerItem container={makeContainer()} themeColor="#4a90d9" onItemClick={vi.fn()} />);
    expect(screen.queryByText(/ignored/)).toBeNull();
  });

  it('progress bar uses danger color when percentFull >= 100', () => {
    calculateContainerBulk.mockReturnValue({ contentsBulk: 4, percentFull: 100 });
    const { container } = render(<ContainerItem container={makeContainer()} themeColor="#4a90d9" onItemClick={vi.fn()} />);
    // happy-dom keeps an unresolved var() on element.style but not through
    // toHaveStyle's computed-style path, so assert the inline value directly.
    expect(container.querySelector('.container-bulk-bar').style.backgroundColor).toBe('var(--color-danger)');
  });

  it('progress bar uses warning color when percentFull >= 75 and < 100', () => {
    calculateContainerBulk.mockReturnValue({ contentsBulk: 3, percentFull: 80 });
    const { container } = render(<ContainerItem container={makeContainer()} themeColor="#4a90d9" onItemClick={vi.fn()} />);
    expect(container.querySelector('.container-bulk-bar').style.backgroundColor).toBe('var(--color-warning)');
  });

  it('progress bar uses themeColor when percentFull < 75', () => {
    calculateContainerBulk.mockReturnValue({ contentsBulk: 1, percentFull: 40 });
    const { container } = render(<ContainerItem container={makeContainer()} themeColor="#4a90d9" onItemClick={vi.fn()} />);
    expect(container.querySelector('.container-bulk-bar')).toHaveStyle('background-color: #4a90d9');
  });

  it('shows collapsed arrow (▶) initially', () => {
    render(<ContainerItem container={makeContainer()} themeColor="#4a90d9" onItemClick={vi.fn()} />);
    expect(screen.getByText('▶')).toBeInTheDocument();
  });

  it('shows expanded arrow (▼) after clicking the header', () => {
    render(<ContainerItem container={makeContainer()} themeColor="#4a90d9" onItemClick={vi.fn()} />);
    expand();
    expect(screen.getByText('▼')).toBeInTheDocument();
  });

  it('does not show contents when collapsed', () => {
    const container = makeContainer({
      container: { capacity: 4, ignored: 0, contents: [{ id: '1', name: 'Sword', weight: 1 }] },
    });
    const { container: dom } = render(<ContainerItem container={container} themeColor="#4a90d9" onItemClick={vi.fn()} />);
    expect(dom.querySelector('.container-contents')).toBeNull();
  });

  it('shows content item cards when expanded', () => {
    const container = makeContainer({
      container: { capacity: 4, ignored: 0, contents: [{ id: '1', name: 'Sword', weight: 1 }] },
    });
    render(<ContainerItem container={container} themeColor="#4a90d9" onItemClick={vi.fn()} />);
    expand();
    expect(screen.getByText('Sword')).toBeInTheDocument();
  });

  it('sorts contents alphabetically when expanded', () => {
    const container = makeContainer({
      container: {
        capacity: 4, ignored: 0,
        contents: [
          { id: '2', name: 'Zebra Cloak', weight: 0.1 },
          { id: '1', name: 'Apple Potion', weight: 0.1 },
        ],
      },
    });
    const { container: dom } = render(<ContainerItem container={container} themeColor="#4a90d9" onItemClick={vi.fn()} />);
    expand();
    const cards = dom.querySelectorAll('.mock-item-card');
    expect(cards[0]).toHaveTextContent('Apple Potion');
    expect(cards[1]).toHaveTextContent('Zebra Cloak');
  });

  it('calls onItemClick when a content card is clicked', () => {
    const onItemClick = vi.fn();
    const swordItem = { id: '1', name: 'Sword', weight: 1 };
    const container = makeContainer({ container: { capacity: 4, ignored: 0, contents: [swordItem] } });
    render(<ContainerItem container={container} themeColor="#4a90d9" onItemClick={onItemClick} />);
    expand();
    fireEvent.click(screen.getByText('Sword'));
    expect(onItemClick).toHaveBeenCalledWith(swordItem);
  });

  it('shows empty container message when expanded but contents is empty', () => {
    render(<ContainerItem container={makeContainer()} themeColor="#4a90d9" onItemClick={vi.fn()} />);
    expand();
    expect(screen.getByText('This container is empty')).toBeInTheDocument();
  });

  it('does not show empty message when contents is non-empty', () => {
    const container = makeContainer({
      container: { capacity: 4, ignored: 0, contents: [{ id: '1', name: 'Sword', weight: 1 }] },
    });
    render(<ContainerItem container={container} themeColor="#4a90d9" onItemClick={vi.fn()} />);
    expand();
    expect(screen.queryByText('This container is empty')).toBeNull();
  });

  it('applies the consumed overlay to stowed consumables (#253)', () => {
    const container = makeContainer({
      container: {
        capacity: 4, ignored: 0,
        contents: [
          { id: '1', name: 'Healing Potion', quantity: 3, consumable: { kind: 'healing' } },
          { id: '2', name: 'Used Up Elixir', quantity: 1, consumable: { kind: 'healing' } },
          { id: '3', name: 'Sword', weight: 1 },
        ],
      },
    });
    render(
      <ContainerItem
        container={container}
        consumed={{ 'Healing Potion': 1, 'Used Up Elixir': 1 }}
        themeColor="#4a90d9"
        onItemClick={vi.fn()}
      />
    );
    expand();
    // Partially-used potion stays (remaining count surfaces via the card),
    // fully-used elixir is dropped, non-consumable is untouched.
    expect(screen.getByText('Healing Potion')).toBeInTheDocument();
    expect(screen.getByText('Sword')).toBeInTheDocument();
    expect(screen.queryByText('Used Up Elixir')).toBeNull();
  });

  it('shows the empty message when every stowed item is consumed (#253)', () => {
    const container = makeContainer({
      container: {
        capacity: 4, ignored: 0,
        contents: [{ id: '1', name: 'Last Potion', quantity: 1, consumable: { kind: 'healing' } }],
      },
    });
    render(
      <ContainerItem
        container={container}
        consumed={{ 'Last Potion': 1 }}
        themeColor="#4a90d9"
        onItemClick={vi.fn()}
      />
    );
    expand();
    expect(screen.getByText('This container is empty')).toBeInTheDocument();
  });

  it('handles contents being undefined gracefully', () => {
    const container = makeContainer({ container: { capacity: 4, ignored: 0 } });
    expect(() =>
      render(<ContainerItem container={container} themeColor="#4a90d9" onItemClick={vi.fn()} />)
    ).not.toThrow();
  });
});
