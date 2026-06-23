import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ShopCart from './ShopCart';

const lines = [
  { id: 'antidote', name: 'Antidote', price: 8, stock: 3, qty: 2 },
  { id: 'rope', name: 'Rope', price: 1, qty: 1 },
];

const renderCart = (props = {}) =>
  render(
    <ShopCart
      cart={lines}
      gold={100}
      onSetQty={() => {}}
      onRemove={() => {}}
      onConfirm={() => {}}
      {...props}
    />
  );

describe('ShopCart', () => {
  it('shows an empty state and a disabled Confirm when the cart is empty', () => {
    renderCart({ cart: [] });
    expect(screen.getByText(/Drag items here/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm purchase' })).toBeDisabled();
  });

  it('renders a line per item with quantity and line total', () => {
    renderCart();
    expect(screen.getByText('Antidote')).toBeInTheDocument();
    expect(screen.getByLabelText('quantity antidote')).toHaveTextContent('2');
    expect(screen.getByText('16 gp')).toBeInTheDocument(); // 8 × 2
    expect(screen.getByText('1 gp')).toBeInTheDocument();  // 1 × 1
  });

  it('shows the running total and item count', () => {
    renderCart();
    expect(screen.getByTestId('cart-total')).toHaveTextContent('17 gp'); // 16 + 1
    expect(screen.getByText('3')).toBeInTheDocument(); // count badge (2 + 1)
  });

  it('steps quantity up and down within stock bounds', () => {
    const onSetQty = vi.fn();
    renderCart({ onSetQty });
    fireEvent.click(screen.getByLabelText('increase antidote'));
    expect(onSetQty).toHaveBeenCalledWith('antidote', 3);
    fireEvent.click(screen.getByLabelText('decrease antidote'));
    expect(onSetQty).toHaveBeenCalledWith('antidote', 1);
  });

  it('disables decrease at qty 1 and increase at stock', () => {
    renderCart({ cart: [{ id: 'antidote', name: 'Antidote', price: 8, stock: 2, qty: 2 }] });
    expect(screen.getByLabelText('decrease antidote')).not.toBeDisabled();
    expect(screen.getByLabelText('increase antidote')).toBeDisabled(); // at stock
    fireEvent.click(screen.getByLabelText('decrease antidote'));
  });

  it('disables decrease when qty is 1', () => {
    renderCart({ cart: [{ id: 'rope', name: 'Rope', price: 1, qty: 1 }] });
    expect(screen.getByLabelText('decrease rope')).toBeDisabled();
  });

  it('removes a line', () => {
    const onRemove = vi.fn();
    renderCart({ onRemove });
    fireEvent.click(screen.getByLabelText('remove antidote'));
    expect(onRemove).toHaveBeenCalledWith('antidote');
  });

  it('confirms when affordable', () => {
    const onConfirm = vi.fn();
    renderCart({ gold: 17, onConfirm });
    const confirm = screen.getByRole('button', { name: 'Confirm purchase' });
    expect(confirm).not.toBeDisabled();
    expect(screen.queryByText('Not enough gold.')).not.toBeInTheDocument();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalled();
  });

  it('blocks confirm and warns when the total exceeds gold', () => {
    renderCart({ gold: 16 }); // total 17
    expect(screen.getByRole('button', { name: 'Confirm purchase' })).toBeDisabled();
    expect(screen.getByText('Not enough gold.')).toBeInTheDocument();
  });
});
