import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ContainerItem from './ContainerItem';

jest.mock('../../utils/InventoryUtils', () => ({
  calculateContainerBulk: jest.fn(({ contents = [] }) => ({
    contentsBulk: contents.reduce((sum, i) => sum + (i.weight || 0), 0),
    percentFull: 50,
  })),
  formatDecimal: jest.fn((n) => n),
  formatBulk: jest.fn((b) => (b === 0 ? '—' : String(b))),
}));

const { calculateContainerBulk } = require('../../utils/InventoryUtils');

const makeContainer = (overrides = {}) => ({
  name: 'Backpack',
  quantity: 1,
  container: {
    capacity: 4,
    ignored: 0,
    contents: [],
  },
  ...overrides,
});

describe('ContainerItem', () => {
  beforeEach(() => {
    calculateContainerBulk.mockReturnValue({ contentsBulk: 0, percentFull: 50 });
  });

  it('renders null when container prop is absent', () => {
    const { container } = render(<ContainerItem themeColor="#blue" onItemClick={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when container.container is absent', () => {
    const { container } = render(
      <ContainerItem container={{ name: 'Bag' }} themeColor="#blue" onItemClick={jest.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders container name when valid', () => {
    render(<ContainerItem container={makeContainer()} themeColor="#4a90d9" onItemClick={jest.fn()} />);
    expect(screen.getByText('Backpack')).toBeInTheDocument();
  });

  it('shows quantity in parentheses when quantity > 1', () => {
    render(
      <ContainerItem
        container={makeContainer({ quantity: 3 })}
        themeColor="#4a90d9"
        onItemClick={jest.fn()}
      />
    );
    expect(screen.getByText(/\(3\)/)).toBeInTheDocument();
  });

  it('does not show quantity in parentheses when quantity is 1', () => {
    render(
      <ContainerItem
        container={makeContainer({ quantity: 1 })}
        themeColor="#4a90d9"
        onItemClick={jest.fn()}
      />
    );
    expect(screen.queryByText(/\(\d\)/)).toBeNull();
  });

  it('shows ignored bulk label when ignored > 0', () => {
    const container = makeContainer({
      container: { capacity: 4, ignored: 2, contents: [] },
    });
    render(<ContainerItem container={container} themeColor="#4a90d9" onItemClick={jest.fn()} />);
    expect(screen.getByText(/ignored/)).toBeInTheDocument();
  });

  it('does not show ignored bulk label when ignored is 0', () => {
    render(<ContainerItem container={makeContainer()} themeColor="#4a90d9" onItemClick={jest.fn()} />);
    expect(screen.queryByText(/ignored/)).toBeNull();
  });

  it('progress bar uses danger color when percentFull >= 100', () => {
    calculateContainerBulk.mockReturnValue({ contentsBulk: 4, percentFull: 100 });
    const { container } = render(
      <ContainerItem container={makeContainer()} themeColor="#4a90d9" onItemClick={jest.fn()} />
    );
    const bar = container.querySelector('.container-bulk-bar');
    expect(bar).toHaveStyle('background-color: var(--color-danger)');
  });

  it('progress bar uses warning color when percentFull >= 75 and < 100', () => {
    calculateContainerBulk.mockReturnValue({ contentsBulk: 3, percentFull: 80 });
    const { container } = render(
      <ContainerItem container={makeContainer()} themeColor="#4a90d9" onItemClick={jest.fn()} />
    );
    const bar = container.querySelector('.container-bulk-bar');
    expect(bar).toHaveStyle('background-color: var(--color-warning)');
  });

  it('progress bar uses themeColor when percentFull < 75', () => {
    calculateContainerBulk.mockReturnValue({ contentsBulk: 1, percentFull: 40 });
    const { container } = render(
      <ContainerItem container={makeContainer()} themeColor="#4a90d9" onItemClick={jest.fn()} />
    );
    const bar = container.querySelector('.container-bulk-bar');
    expect(bar).toHaveStyle('background-color: #4a90d9');
  });

  it('shows collapsed arrow (▶) initially', () => {
    render(<ContainerItem container={makeContainer()} themeColor="#4a90d9" onItemClick={jest.fn()} />);
    expect(screen.getByText('▶')).toBeInTheDocument();
  });

  it('shows expanded arrow (▼) after clicking header', () => {
    render(<ContainerItem container={makeContainer()} themeColor="#4a90d9" onItemClick={jest.fn()} />);
    fireEvent.click(screen.getByRole('heading', { level: 3 }).closest('.container-header'));
    expect(screen.getByText('▼')).toBeInTheDocument();
  });

  it('does not show contents table when collapsed', () => {
    const container = makeContainer({
      container: {
        capacity: 4,
        ignored: 0,
        contents: [{ id: '1', name: 'Sword', quantity: 1, weight: 1 }],
      },
    });
    const { container: dom } = render(
      <ContainerItem container={container} themeColor="#4a90d9" onItemClick={jest.fn()} />
    );
    expect(dom.querySelector('.container-contents')).toBeNull();
  });

  it('shows contents table when expanded and contents is non-empty', () => {
    const container = makeContainer({
      container: {
        capacity: 4,
        ignored: 0,
        contents: [{ id: '1', name: 'Sword', quantity: 1, weight: 1 }],
      },
    });
    render(<ContainerItem container={container} themeColor="#4a90d9" onItemClick={jest.fn()} />);
    fireEvent.click(screen.getByRole('heading', { level: 3 }).closest('.container-header'));
    expect(screen.getByText('Sword')).toBeInTheDocument();
  });

  it('sorts contents alphabetically when expanded', () => {
    const container = makeContainer({
      container: {
        capacity: 4,
        ignored: 0,
        contents: [
          { id: '2', name: 'Zebra Cloak', quantity: 1, weight: 0.1 },
          { id: '1', name: 'Apple Potion', quantity: 1, weight: 0.1 },
        ],
      },
    });
    const { container: dom } = render(
      <ContainerItem container={container} themeColor="#4a90d9" onItemClick={jest.fn()} />
    );
    fireEvent.click(dom.querySelector('.container-header'));
    const buttons = dom.querySelectorAll('.item-name');
    expect(buttons[0]).toHaveTextContent('Apple Potion');
    expect(buttons[1]).toHaveTextContent('Zebra Cloak');
  });

  it('calls onItemClick when a content item button is clicked', () => {
    const onItemClick = jest.fn();
    const swordItem = { id: '1', name: 'Sword', quantity: 1, weight: 1 };
    const container = makeContainer({
      container: { capacity: 4, ignored: 0, contents: [swordItem] },
    });
    const { container: dom } = render(
      <ContainerItem container={container} themeColor="#4a90d9" onItemClick={onItemClick} />
    );
    fireEvent.click(dom.querySelector('.container-header'));
    fireEvent.click(screen.getByText('Sword'));
    expect(onItemClick).toHaveBeenCalledWith(swordItem);
  });

  it('shows empty container message when expanded but contents is empty', () => {
    render(<ContainerItem container={makeContainer()} themeColor="#4a90d9" onItemClick={jest.fn()} />);
    fireEvent.click(screen.getByRole('heading', { level: 3 }).closest('.container-header'));
    expect(screen.getByText('This container is empty')).toBeInTheDocument();
  });

  it('does not show empty message when contents is non-empty', () => {
    const container = makeContainer({
      container: {
        capacity: 4,
        ignored: 0,
        contents: [{ id: '1', name: 'Sword', quantity: 1, weight: 1 }],
      },
    });
    render(<ContainerItem container={container} themeColor="#4a90d9" onItemClick={jest.fn()} />);
    fireEvent.click(screen.getByRole('heading', { level: 3 }).closest('.container-header'));
    expect(screen.queryByText('This container is empty')).toBeNull();
  });

  it('handles contents being undefined gracefully (returns empty array)', () => {
    const container = makeContainer({
      container: { capacity: 4, ignored: 0 },
    });
    expect(() =>
      render(<ContainerItem container={container} themeColor="#4a90d9" onItemClick={jest.fn()} />)
    ).not.toThrow();
  });

  it('renders quantity fallback of 1 for content items when quantity is absent', () => {
    const container = makeContainer({
      container: {
        capacity: 4,
        ignored: 0,
        contents: [{ id: '1', name: 'Potion', weight: 0 }],
      },
    });
    const { container: dom } = render(
      <ContainerItem container={container} themeColor="#4a90d9" onItemClick={jest.fn()} />
    );
    fireEvent.click(dom.querySelector('.container-header'));
    // The quantity cell should show "1" as fallback
    const cells = dom.querySelectorAll('tbody td:nth-child(2)');
    expect(cells[0]).toHaveTextContent('1');
  });

  it('uses item.id as key when present', () => {
    const container = makeContainer({
      container: {
        capacity: 4,
        ignored: 0,
        contents: [{ id: 'abc', name: 'Potion', weight: 0 }],
      },
    });
    expect(() => {
      const { container: dom } = render(
        <ContainerItem container={container} themeColor="#4a90d9" onItemClick={jest.fn()} />
      );
      fireEvent.click(dom.querySelector('.container-header'));
    }).not.toThrow();
  });

  // Slice 4: contents are labelled with their effective state (Stowed)
  it('labels a content row with its state badge', () => {
    const container = makeContainer({
      container: {
        capacity: 4,
        ignored: 0,
        contents: [{ id: '1', name: 'Torch', quantity: 1, weight: 0.1, state: 'stowed' }],
      },
    });
    render(<ContainerItem container={container} themeColor="#4a90d9" onItemClick={jest.fn()} />);
    fireEvent.click(screen.getByRole('heading', { level: 3 }).closest('.container-header'));
    expect(screen.getByText('Stowed')).toBeInTheDocument();
  });
});
