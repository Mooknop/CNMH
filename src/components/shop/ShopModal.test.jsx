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

// Buyer gold + purchase commit come from useBuyItems; gold defaults plenty,
// overridable per test. `buy` is a spy that returns a receipt unless overridden.
let myGold = 100;
let mockBuy = vi.fn(() => ({ total: 8, count: 1 }));
vi.mock('../../hooks/useBuyItems', () => ({
  useBuyItems: () => ({ myGold, buy: mockBuy }),
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

// Draggable ware tiles open the detail modal on tap or keyboard activation
// (Enter/Space). The pointer-drag gesture itself is pointer-only and covered by
// e2e; here we exercise the same onTap via the keyboard path.
const activateTile = (el) => fireEvent.keyDown(el, { key: 'Enter' });

const openBottledSolutions = () => fireEvent.click(screen.getByText('Bottled Solutions'));

beforeEach(() => {
  myGold = 100;
  mockBuy = vi.fn(() => ({ total: 8, count: 1 }));
});

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
    openBottledSolutions();
    expect(screen.getByTestId('shop-window-bottled-solutions')).toBeInTheDocument();
    expect(screen.getByTestId('ware-antidote')).toHaveTextContent('Antidote');
    expect(screen.getByTestId('ware-antidote')).toHaveTextContent('8 gp');   // override
    expect(screen.getByTestId('ware-spellbook')).toHaveTextContent('10 gp'); // catalog
    expect(screen.getByTestId('ware-spellbook')).toHaveTextContent('2 in stock');
  });

  it('shows an empty-wares state for a shop with nothing for sale', () => {
    renderModal();
    fireEvent.click(screen.getByText('The Curious Goblin'));
    expect(screen.getByText('This shop has nothing for sale right now.')).toBeInTheDocument();
  });

  it('opens the item detail (ItemModal) when a ware is activated', () => {
    renderModal();
    openBottledSolutions();
    activateTile(screen.getByTestId('ware-antidote'));
    const detail = screen.getByTestId('item-modal');
    expect(detail).toBeInTheDocument();
    expect(detail).toHaveTextContent('Antidote');
  });

  describe('cart', () => {
    it('starts empty with a disabled Confirm', () => {
      renderModal();
      openBottledSolutions();
      expect(screen.getByText(/Drag items here/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm purchase' })).toBeDisabled();
    });

    it('adds a ware to the cart via the Add button and totals it', () => {
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote'));
      expect(screen.getByLabelText('quantity antidote')).toHaveTextContent('1');
      expect(screen.getByTestId('cart-total')).toHaveTextContent('8 gp');
    });

    it('increments the same ware instead of duplicating the line', () => {
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote'));
      fireEvent.click(screen.getByLabelText('add antidote'));
      expect(screen.getByLabelText('quantity antidote')).toHaveTextContent('2');
      expect(screen.getByTestId('cart-total')).toHaveTextContent('16 gp');
    });

    it('enables Confirm when affordable', () => {
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote'));
      expect(screen.getByRole('button', { name: 'Confirm purchase' })).not.toBeDisabled();
    });

    it('blocks Confirm and warns when the cart exceeds the buyer gold', () => {
      myGold = 5;
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote')); // 8 gp > 5
      expect(screen.getByText('Not enough gold.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm purchase' })).toBeDisabled();
    });

    it('clears the cart when switching shops', () => {
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote'));
      expect(screen.getByLabelText('quantity antidote')).toBeInTheDocument();
      fireEvent.click(screen.getByText('← All shops'));
      openBottledSolutions();
      expect(screen.queryByLabelText('quantity antidote')).not.toBeInTheDocument();
      expect(screen.getByText(/Drag items here/)).toBeInTheDocument();
    });
  });

  describe('confirm purchase', () => {
    it('commits the full resolved wares (× qty) with the shop name', () => {
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote'));
      fireEvent.click(screen.getByLabelText('add antidote'));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));
      expect(mockBuy).toHaveBeenCalledWith(
        [{ item: expect.objectContaining({ id: 'antidote', price: 8 }), qty: 2 }],
        'Bottled Solutions',
      );
    });

    it('clears the cart and shows a receipt on success', () => {
      mockBuy = vi.fn(() => ({ total: 16, count: 2 }));
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote'));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));
      expect(screen.queryByLabelText('quantity antidote')).not.toBeInTheDocument();
      expect(screen.getByTestId('shop-receipt')).toHaveTextContent('Purchased 2 items for 16 gp.');
    });

    it('keeps the cart and shows no receipt when the buy is rejected', () => {
      mockBuy = vi.fn(() => null);
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote'));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));
      expect(screen.getByLabelText('quantity antidote')).toBeInTheDocument();
      expect(screen.queryByTestId('shop-receipt')).not.toBeInTheDocument();
    });

    it('dismisses a prior receipt when a new ware is added', () => {
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote'));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));
      expect(screen.getByTestId('shop-receipt')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('add antidote'));
      expect(screen.queryByTestId('shop-receipt')).not.toBeInTheDocument();
    });
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
