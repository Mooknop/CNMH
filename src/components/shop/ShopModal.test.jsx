import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ShopModal from './ShopModal';

// Render the modal body inline so we don't fight the real Modal's portal/focus.
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, title, children }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

// The wares detail view reuses the inventory ItemModal — stub it.
vi.mock('../inventory/ItemModal', () => ({
  default: ({ isOpen, item }) =>
    isOpen ? <div data-testid="item-modal">{item?.name}</div> : null,
}));

const shops = [
  { id: 'bottled-solutions', title: 'Bottled Solutions', summary: 'A cluttered alchemist.' },
  { id: 'curious-goblin', title: 'The Curious Goblin', summary: 'A bookshop.' },
];

const items = [
  { id: 'antidote', name: 'Antidote', price: 3, weight: 0 },
  { id: 'spellbook', name: 'Spellbook', price: 10, weight: 1 },
];

const waresStore = {
  'bottled-solutions': { wares: [{ ref: 'antidote', price: 8 }, { ref: 'spellbook', stock: 2 }] },
  'curious-goblin': { wares: [] },
};

const renderModal = (props = {}) =>
  render(
    <ShopModal
      isOpen
      onClose={() => {}}
      shops={shops}
      waresStore={waresStore}
      items={items}
      character={{ id: 'char-1', name: 'Pellias' }}
      {...props}
    />
  );

describe('ShopModal', () => {
  it('renders nothing when closed', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists a card per shop with title and summary', () => {
    renderModal();
    expect(screen.getByText('Bottled Solutions')).toBeInTheDocument();
    expect(screen.getByText('A cluttered alchemist.')).toBeInTheDocument();
    expect(screen.getByText('The Curious Goblin')).toBeInTheDocument();
  });

  it('shows an empty state when there are no shops', () => {
    renderModal({ shops: [] });
    expect(screen.getByText('There are no shops here.')).toBeInTheDocument();
  });

  it('lists the shop wares with resolved price (override + catalog) and stock', () => {
    renderModal();
    fireEvent.click(screen.getByText('Bottled Solutions'));
    expect(screen.getByTestId('shop-window-bottled-solutions')).toBeInTheDocument();
    expect(screen.getByText('Antidote')).toBeInTheDocument();
    expect(screen.getByText('8 gp')).toBeInTheDocument();   // override
    expect(screen.getByText('Spellbook')).toBeInTheDocument();
    expect(screen.getByText('10 gp')).toBeInTheDocument();  // catalog fallback
    expect(screen.getByText('2 in stock')).toBeInTheDocument();
  });

  it('shows an empty-wares state for a shop with nothing for sale', () => {
    renderModal();
    fireEvent.click(screen.getByText('The Curious Goblin'));
    expect(screen.getByText('This shop has nothing for sale right now.')).toBeInTheDocument();
  });

  it('opens the item detail (ItemModal) when a ware is clicked', () => {
    renderModal();
    fireEvent.click(screen.getByText('Bottled Solutions'));
    fireEvent.click(screen.getByText('Antidote'));
    const detail = screen.getByTestId('item-modal');
    expect(detail).toBeInTheDocument();
    expect(detail).toHaveTextContent('Antidote');
  });

  it('returns to the carousel from the shop window', () => {
    renderModal();
    fireEvent.click(screen.getByText('The Curious Goblin'));
    fireEvent.click(screen.getByText('← All shops'));
    expect(screen.getByText('Bottled Solutions')).toBeInTheDocument();
    expect(screen.getByText('The Curious Goblin')).toBeInTheDocument();
    expect(screen.queryByText('This shop has nothing for sale right now.')).not.toBeInTheDocument();
  });
});
