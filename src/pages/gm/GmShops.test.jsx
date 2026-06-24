import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import GmShops from './GmShops';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../hooks/useShops', () => ({ useShops: vi.fn() }));
// Stub the inline catalog picker: it only mounts when the GM opens it, and a
// button fires onSelect with a fixed item.
vi.mock('../../components/gm/CatalogPicker', () => ({
  default: ({ onSelect }) => (
    <button type="button" onClick={() => onSelect([{ id: 'spellbook', name: 'Spellbook', price: 10 }])}>
      pick-spellbook
    </button>
  ),
}));

import { useContent } from '../../contexts/ContentContext';
import { useShops } from '../../hooks/useShops';

const items = [
  { id: 'antidote', name: 'Antidote', price: 3, weight: 0 },
  { id: 'spellbook', name: 'Spellbook', price: 10, weight: 1 },
];

const allLoreEntries = [
  { id: 'town-hall', title: 'Town Hall', category: 'Location' },
  { id: 'bottled-solutions', title: 'Bottled Solutions', category: 'Location', parent: 'sandpoint' },
  { id: 'brodert-quink', title: 'Brodert Quink', category: 'NPC' },
];

let setWares;
const setup = (shops = {}) => {
  setWares = vi.fn();
  useContent.mockReturnValue({ allLoreEntries, items });
  useShops.mockReturnValue({ shops, setWares });
};

afterEach(() => vi.restoreAllMocks());

const select = (name) => fireEvent.click(screen.getByRole('button', { name }));

describe('GmShops', () => {
  it('lists only Location entries, title-sorted', () => {
    setup();
    render(<GmShops />);
    expect(screen.getByRole('button', { name: /Bottled Solutions/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Town Hall/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Brodert Quink/ })).not.toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 2')).toBeInTheDocument();
  });

  it('badges locations that already have wares', () => {
    setup({ 'bottled-solutions': { wares: [{ ref: 'antidote' }] } });
    render(<GmShops />);
    expect(screen.getByRole('button', { name: /Bottled Solutions · shop/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Town Hall$/ })).toBeInTheDocument();
  });

  it('loads a shop\'s wares into rows with name + price override', () => {
    setup({ 'bottled-solutions': { wares: [{ ref: 'antidote', price: 8 }] } });
    render(<GmShops />);
    select(/Bottled Solutions/);
    const form = screen.getByTestId('shop-form-bottled-solutions');
    expect(within(form).getByText('Antidote')).toBeInTheDocument();
    expect(within(form).getByLabelText('price-antidote')).toHaveValue(8);
  });

  it('shows the catalog price as the placeholder when no override is set', () => {
    setup({ 'bottled-solutions': { wares: [{ ref: 'antidote' }] } });
    render(<GmShops />);
    select(/Bottled Solutions/);
    expect(screen.getByLabelText('price-antidote')).toHaveAttribute('placeholder', '3');
  });

  it('adds an item via the picker and saves it (no override → no price field)', () => {
    setup();
    render(<GmShops />);
    select(/Town Hall/);
    fireEvent.click(screen.getByRole('button', { name: '+ Add items' }));
    fireEvent.click(screen.getByRole('button', { name: 'pick-spellbook' }));
    expect(screen.getByText('Spellbook')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save wares' }));
    expect(setWares).toHaveBeenCalledWith('town-hall', [{ ref: 'spellbook' }]);
  });

  it('saves a price override and stock as numbers', () => {
    setup({ 'bottled-solutions': { wares: [{ ref: 'antidote' }] } });
    render(<GmShops />);
    select(/Bottled Solutions/);
    fireEvent.change(screen.getByLabelText('price-antidote'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('stock-antidote'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save wares' }));
    expect(setWares).toHaveBeenCalledWith('bottled-solutions', [{ ref: 'antidote', price: 5, stock: 4 }]);
  });

  it('removes a ware and saves the shorter list', () => {
    setup({ 'bottled-solutions': { wares: [{ ref: 'antidote' }, { ref: 'spellbook' }] } });
    render(<GmShops />);
    select(/Bottled Solutions/);
    fireEvent.click(screen.getByRole('button', { name: 'remove-antidote' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save wares' }));
    expect(setWares).toHaveBeenCalledWith('bottled-solutions', [{ ref: 'spellbook' }]);
  });
});
