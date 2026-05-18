import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CatalogPickerModal from './CatalogPickerModal';

// TraitTag (used in the preview) reaches for the TraitContext.
jest.mock('../../contexts/TraitContext', () => ({ useTrait: () => ({ openTraitModal: jest.fn() }) }));

const catalog = [
  { id: 'torch', name: 'Torch', weight: 0.1, price: 0.1, description: 'It burns.' },
  { id: 'backpack', name: 'Backpack', weight: 0.1, container: { capacity: 4 } },
  { id: 'minor-elixir-of-life', name: 'Minor Elixir of Life', price: 3, weight: 0.1, traits: ['Healing'] },
];

const setup = (overrides = {}) => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <CatalogPickerModal
      isOpen
      onClose={onClose}
      catalog={catalog}
      onSelect={onSelect}
      {...overrides}
    />
  );
  return { onSelect, onClose, ...utils };
};

describe('CatalogPickerModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <CatalogPickerModal isOpen={false} onClose={jest.fn()} catalog={catalog} onSelect={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists every catalog item and filters by the search box', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Torch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Backpack' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('catalog search'), { target: { value: 'elixir' } });
    expect(screen.getByRole('button', { name: 'Minor Elixir of Life' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Torch' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Backpack' })).not.toBeInTheDocument();
  });

  it('previews the focused item (traits, bulk, description, container flag)', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Minor Elixir of Life' }));
    const preview = screen.getByTestId('catalog-preview');
    expect(within(preview).getByText('Minor Elixir of Life')).toBeInTheDocument();
    expect(within(preview).getByText('Healing')).toBeInTheDocument();
    expect(within(preview).getByText(/Price 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Backpack' }));
    expect(within(screen.getByTestId('catalog-preview')).getByText('Container')).toBeInTheDocument();
  });

  it('Add is disabled until a selection is made, then submits and closes', () => {
    const { onSelect, onClose } = setup();
    const add = screen.getByRole('button', { name: 'Add to character' });
    expect(add).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Torch' }));
    expect(add).toBeEnabled();
    fireEvent.click(add);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'torch' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('Cancel closes without selecting', () => {
    const { onSelect, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
