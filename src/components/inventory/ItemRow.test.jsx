import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ItemRow from './ItemRow';

// Render the real ItemCard but keep assertions on ItemRow's own structure.
vi.mock('./ItemCard', () => ({
  default: function DummyItemCard({ item, onClick }) {
    return <button className="mock-item-card" onClick={() => onClick(item)}>{item.name}</button>;
  },
}));

describe('ItemRow (#254/#339)', () => {
  const host = { uid: 'w1', name: 'Longsword' };
  const fang = { uid: 't1', name: 'Wolf Fang' };

  it('renders the host card with no child lines when nothing is affixed', () => {
    const { container } = render(<ItemRow item={host} onItemClick={vi.fn()} />);
    expect(screen.getByText('Longsword')).toBeInTheDocument();
    expect(container.querySelector('.affixed-talisman-line')).toBeNull();
  });

  it('renders affixed talismans as indented child lines under the host', () => {
    render(<ItemRow item={host} affixedTalismans={[fang]} onItemClick={vi.fn()} />);
    const line = screen.getByRole('button', { name: /Wolf Fang/ });
    expect(line).toHaveClass('affixed-talisman-line');
    expect(line).toHaveTextContent('affixed');
  });

  it('clicking a child line opens that talisman', () => {
    const onItemClick = vi.fn();
    render(<ItemRow item={host} affixedTalismans={[fang]} onItemClick={onItemClick} />);
    fireEvent.click(screen.getByRole('button', { name: /Wolf Fang/ }));
    expect(onItemClick).toHaveBeenCalledWith(fang);
  });
});
