import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ItemCard from './ItemCard';

const renderCard = (item, onClick = vi.fn()) => render(<ItemCard item={item} onClick={onClick} />);

describe('ItemCard', () => {
  it('renders the item name', () => {
    renderCard({ uid: 'u1', name: 'Longsword', weight: 1 });
    expect(screen.getByText('Longsword')).toBeInTheDocument();
  });

  it('shows a bulk chip', () => {
    renderCard({ uid: 'u1', name: 'Longsword', weight: 1 });
    expect(screen.getByText('1 bulk')).toBeInTheDocument();
  });

  it('shows a quantity chip only when quantity > 1', () => {
    const { rerender } = renderCard({ uid: 'u1', name: 'Arrow', weight: 0, quantity: 10 });
    expect(screen.getByText('×10')).toBeInTheDocument();
    rerender(<ItemCard item={{ uid: 'u1', name: 'Arrow', weight: 0, quantity: 1 }} onClick={vi.fn()} />);
    expect(screen.queryByText(/^×/)).not.toBeInTheDocument();
  });

  it('shows a rarity chip with the matching modifier class', () => {
    const { container } = renderCard({ uid: 'u1', name: 'Staff', weight: 1, traits: ['Magical', 'Rare'] });
    const chip = container.querySelector('.item-rarity--rare');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('Rare');
  });

  it('does not show a rarity chip for common items', () => {
    const { container } = renderCard({ uid: 'u1', name: 'Rope', weight: 1, traits: [] });
    expect(container.querySelector('.item-rarity')).not.toBeInTheDocument();
  });

  it('applies the magical class for items with the Magical trait', () => {
    const { container } = renderCard({ uid: 'u1', name: 'Staff of Fire', weight: 1, traits: ['Magical'] });
    expect(container.querySelector('.item-card--magical')).toBeInTheDocument();
  });

  it('applies the magical class for items with an embedded scroll/wand', () => {
    const { container } = renderCard({ uid: 'u1', name: 'Scroll', weight: 0, scroll: { name: 'Fireball' } });
    expect(container.querySelector('.item-card--magical')).toBeInTheDocument();
  });

  it('does not apply the magical class for mundane items', () => {
    const { container } = renderCard({ uid: 'u1', name: 'Rope', weight: 1, traits: ['Uncommon'] });
    expect(container.querySelector('.item-card--magical')).not.toBeInTheDocument();
  });

  it('shows the held glyph for held items', () => {
    renderCard({ uid: 'u1', name: 'Sword', weight: 1, state: 'held2' });
    expect(screen.getByLabelText('Held in 2 Hands')).toBeInTheDocument();
  });

  it('does not show the held glyph for worn items', () => {
    renderCard({ uid: 'u1', name: 'Cloak', weight: 0.5, state: 'worn' });
    expect(screen.queryByLabelText(/Held/)).not.toBeInTheDocument();
  });

  it('applies the dropped modifier for dropped items', () => {
    const { container } = renderCard({ uid: 'u1', name: 'Armor', weight: 2, state: 'dropped' });
    expect(container.querySelector('.item-card--dropped')).toBeInTheDocument();
  });

  it('shows the container icon for container items', () => {
    renderCard({ uid: 'u1', name: 'Backpack', weight: 0.1, container: { contents: [] } });
    expect(screen.getByLabelText('Container')).toBeInTheDocument();
  });

  it('calls onClick with the item when tapped', () => {
    const onClick = vi.fn();
    const item = { uid: 'u1', name: 'Longsword', weight: 1 };
    renderCard(item, onClick);
    fireEvent.click(screen.getByTestId('item-card-u1'));
    expect(onClick).toHaveBeenCalledWith(item);
  });
});
