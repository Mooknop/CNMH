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

const shops = [
  { id: 'bottled-solutions', title: 'Bottled Solutions', summary: 'A cluttered alchemist.' },
  { id: 'curious-goblin', title: 'The Curious Goblin', summary: 'A bookshop.' },
];

describe('ShopModal', () => {
  it('renders nothing when closed', () => {
    render(<ShopModal isOpen={false} onClose={() => {}} shops={shops} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists a card per shop with title and summary', () => {
    render(<ShopModal isOpen onClose={() => {}} shops={shops} />);
    expect(screen.getByText('Bottled Solutions')).toBeInTheDocument();
    expect(screen.getByText('A cluttered alchemist.')).toBeInTheDocument();
    expect(screen.getByText('The Curious Goblin')).toBeInTheDocument();
  });

  it('shows an empty state when there are no shops', () => {
    render(<ShopModal isOpen onClose={() => {}} shops={[]} />);
    expect(screen.getByText('There are no shops here.')).toBeInTheDocument();
  });

  it('opens the shop window (stub) when a card is picked', () => {
    render(<ShopModal isOpen onClose={() => {}} shops={shops} />);
    fireEvent.click(screen.getByText('Bottled Solutions'));
    expect(screen.getByTestId('shop-window-bottled-solutions')).toBeInTheDocument();
    expect(screen.getByText('Wares coming soon.')).toBeInTheDocument();
    // Title reflects the selected shop.
    expect(screen.getByRole('dialog', { name: 'Bottled Solutions' })).toBeInTheDocument();
  });

  it('returns to the carousel from the shop window', () => {
    render(<ShopModal isOpen onClose={() => {}} shops={shops} />);
    fireEvent.click(screen.getByText('The Curious Goblin'));
    fireEvent.click(screen.getByText('← All shops'));
    // Both cards visible again.
    expect(screen.getByText('Bottled Solutions')).toBeInTheDocument();
    expect(screen.getByText('The Curious Goblin')).toBeInTheDocument();
    expect(screen.queryByText('Wares coming soon.')).not.toBeInTheDocument();
  });
});
