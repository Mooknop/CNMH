import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndProvider } from './dnd';
import BagGrid from './BagGrid';

// BagGrid renders inside a DndProvider in the real app (InventoryTab); the bag
// tabs and slot grid are DropZones, so a bare render without a provider throws.
const renderBagGrid = (props = {}) =>
  render(
    <DndProvider renderGhost={() => null}>
      <BagGrid
        inventory={[]}
        worn={vi.fn()}
        stow={vi.fn()}
        moveToContainer={vi.fn()}
        onItemClick={vi.fn()}
        {...props}
      />
    </DndProvider>
  );

const backpack = {
  uid: 'bp1',
  name: 'Backpack',
  weight: 1,
  state: 'worn',
  container: { capacity: 4, contents: [{ uid: 'r1', name: 'Rope', weight: 1, state: 'stowed' }] },
};

describe('BagGrid — container Details affordance (#945)', () => {
  it('shows no Details button while the Worn bag is active (default)', () => {
    renderBagGrid({ inventory: [backpack] });
    expect(screen.queryByTestId('bag-details')).not.toBeInTheDocument();
  });

  it('shows a Details button once a container bag is made active', () => {
    renderBagGrid({ inventory: [backpack] });
    fireEvent.click(screen.getByTestId('bag-tab-bp1'));
    const details = screen.getByTestId('bag-details');
    expect(details).toBeInTheDocument();
    expect(details).toHaveAccessibleName('View Backpack details');
  });

  it('calls onItemClick with the container item when Details is clicked', () => {
    const onItemClick = vi.fn();
    renderBagGrid({ inventory: [backpack], onItemClick });
    fireEvent.click(screen.getByTestId('bag-tab-bp1'));
    fireEvent.click(screen.getByTestId('bag-details'));
    expect(onItemClick).toHaveBeenCalledWith(backpack);
  });

  it('does not change the active bag tab / drag semantics when Details is clicked', () => {
    const onItemClick = vi.fn();
    renderBagGrid({ inventory: [backpack], onItemClick });
    fireEvent.click(screen.getByTestId('bag-tab-bp1'));
    fireEvent.click(screen.getByTestId('bag-details'));
    // Still showing the container's own bag (its bulk note is present), so the
    // click on Details didn't flip the tab or otherwise disturb selection.
    expect(screen.getByTestId('bag-tab-bp1')).toHaveAttribute('aria-selected', 'true');
  });
});
