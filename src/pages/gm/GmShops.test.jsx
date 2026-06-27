import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import GmShops from './GmShops';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../hooks/useShops', () => ({ useShops: vi.fn() }));
// Stub the inline catalog picker: it only mounts when the GM opens it, and a
// button fires onSelect with a fixed item.
// Render a pick-<id> button per catalog entry, so the same stub serves both the
// item picker (catalog = items) and the rune picker (catalog = runes).
vi.mock('../../components/gm/CatalogPicker', () => ({
  default: ({ catalog, onSelect }) => (
    <>
      {(catalog || []).map((c) => (
        <button key={c.id} type="button" onClick={() => onSelect([c])}>
          pick-{c.id}
        </button>
      ))}
    </>
  ),
}));

import { useContent } from '../../contexts/ContentContext';
import { useShops } from '../../hooks/useShops';

const items = [
  { id: 'antidote', name: 'Antidote', price: 3, weight: 0 },
  { id: 'spellbook', name: 'Spellbook', price: 10, weight: 1 },
  // Multi-level item (#797 shape): variants carry their own name/price.
  {
    id: 'tonic',
    name: 'Tonic',
    weight: 0,
    variants: [
      { level: 1, label: 'Minor', name: 'Minor Tonic', price: 4 },
      { level: 3, label: 'Lesser', name: 'Lesser Tonic', price: 12 },
    ],
  },
];

const allLoreEntries = [
  { id: 'town-hall', title: 'Town Hall', category: 'Location' },
  { id: 'bottled-solutions', title: 'Bottled Solutions', category: 'Location', parent: 'sandpoint' },
  { id: 'brodert-quink', title: 'Brodert Quink', category: 'NPC' },
];

const runes = [{ id: 'flaming', name: 'Flaming', level: 8, price: 500 }];

let setWares;
const setup = (shops = {}) => {
  setWares = vi.fn();
  useContent.mockReturnValue({ allLoreEntries, items, runes });
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

  it('loads a pinned variant: variant name, selected level, variant price placeholder', () => {
    setup({ 'bottled-solutions': { wares: [{ ref: 'tonic', level: 3 }] } });
    render(<GmShops />);
    select(/Bottled Solutions/);
    const form = screen.getByTestId('shop-form-bottled-solutions');
    expect(within(form).getByText('Lesser Tonic')).toBeInTheDocument();
    expect(within(form).getByLabelText('level-tonic@3')).toHaveValue('3');
    expect(within(form).getByLabelText('price-tonic@3')).toHaveAttribute('placeholder', '12');
  });

  it('pins a variant level on an unleveled row and saves it with level', () => {
    setup({ 'bottled-solutions': { wares: [{ ref: 'tonic' }] } });
    render(<GmShops />);
    select(/Bottled Solutions/);
    fireEvent.change(screen.getByLabelText('level-tonic'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save wares' }));
    expect(setWares).toHaveBeenCalledWith('bottled-solutions', [{ ref: 'tonic', level: 1 }]);
  });

  it('stocks two variants of one item as distinct rows', () => {
    setup({ 'bottled-solutions': { wares: [{ ref: 'tonic', level: 1 }] } });
    render(<GmShops />);
    select(/Bottled Solutions/);
    // Add the same item again → a second, unleveled row (its key 'tonic' is free).
    fireEvent.click(screen.getByRole('button', { name: '+ Add items' }));
    fireEvent.click(screen.getByRole('button', { name: 'pick-tonic' }));
    // The new row's level select excludes 1 (taken by the first row); pick 3.
    fireEvent.change(screen.getByLabelText('level-tonic'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save wares' }));
    expect(setWares).toHaveBeenCalledWith('bottled-solutions', [
      { ref: 'tonic', level: 1 },
      { ref: 'tonic', level: 3 },
    ]);
  });

  it('blocks re-adding an item that already has an unleveled row', () => {
    setup();
    render(<GmShops />);
    select(/Town Hall/);
    fireEvent.click(screen.getByRole('button', { name: '+ Add items' }));
    fireEvent.click(screen.getByRole('button', { name: 'pick-tonic' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Add items' }));
    fireEvent.click(screen.getByRole('button', { name: 'pick-tonic' }));
    expect(screen.getAllByLabelText('level-tonic')).toHaveLength(1);
  });

  it('stocks a rune as a Runestone ware via the rune picker (#801)', () => {
    setup();
    render(<GmShops />);
    select(/Town Hall/);
    fireEvent.click(screen.getByRole('button', { name: '+ Add rune' }));
    fireEvent.click(screen.getByRole('button', { name: 'pick-flaming' }));
    expect(screen.getByText('Flaming Runestone')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save wares' }));
    expect(setWares).toHaveBeenCalledWith('town-hall', [{ ref: 'runestone', runeRef: 'flaming' }]);
  });

  it('loads a runestone ware: rune name + stone+rune price placeholder', () => {
    setup({ 'bottled-solutions': { wares: [{ ref: 'runestone', runeRef: 'flaming' }] } });
    render(<GmShops />);
    select(/Bottled Solutions/);
    const form = screen.getByTestId('shop-form-bottled-solutions');
    expect(within(form).getByText('Flaming Runestone')).toBeInTheDocument();
    expect(within(form).getByLabelText('price-runestone@flaming')).toHaveAttribute('placeholder', '503');
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
