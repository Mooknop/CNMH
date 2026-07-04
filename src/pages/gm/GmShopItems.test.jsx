import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmShopItems from './GmShopItems';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ saveDocument: vi.fn() }));
import { useContent } from '../../contexts/ContentContext';
import { saveDocument } from '../../utils/gmApi';

// A racial container (Gourd Head), a legit host (backpack), a base weapon, a
// magic item (never a host), and an already-excluded item.
const items = [
  { id: 'gourd-head', name: 'Gourd Head', container: { capacity: 1 } },
  { id: 'backpack', name: 'Backpack', price: 0.1, container: { capacity: 4 } },
  { id: 'longsword', name: 'Longsword', price: 1, strikes: [{}], runes: {} },
  { id: 'sparkblade', name: 'Sparkblade', price: 60, strikes: [{}], traits: ['Magical'] },
  { id: 'mothers-amulet', name: "Mother's Amulet", noShop: true },
];

const refresh = vi.fn().mockResolvedValue();

beforeEach(() => {
  vi.clearAllMocks();
  useContent.mockReturnValue({ items, refresh });
  saveDocument.mockResolvedValue({});
});

const rowByName = (name) => screen.getByText(name).closest('.gm-shop-items-row');

describe('GmShopItems (#1105)', () => {
  it('lists host candidates + excluded items, and hides non-hosts', () => {
    render(<GmShopItems />);
    // Gourd Head (container host), Backpack, Longsword, and the excluded
    // Mother's Amulet appear; a plain magic weapon does not.
    expect(screen.getByText('Gourd Head')).toBeInTheDocument();
    expect(screen.getByText('Backpack')).toBeInTheDocument();
    expect(screen.getByText('Longsword')).toBeInTheDocument();
    expect(screen.getByText("Mother's Amulet")).toBeInTheDocument();
    expect(screen.queryByText('Sparkblade')).not.toBeInTheDocument();
  });

  it('shows the excluded count and marks an excluded row', () => {
    render(<GmShopItems />);
    expect(screen.getByText('1 excluded')).toBeInTheDocument();
    expect(rowByName("Mother's Amulet")).toHaveClass('is-excluded');
  });

  it('excludes an offered item — writes noShop:true and refreshes', async () => {
    render(<GmShopItems />);
    fireEvent.click(within(rowByName('Gourd Head')).getByRole('button'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [collection, id, payload] = saveDocument.mock.calls[0];
    expect(collection).toBe('item');
    expect(id).toBe('gourd-head');
    expect(payload.noShop).toBe(true);
    expect(refresh).toHaveBeenCalled();
  });

  it('re-offers an excluded item — omits the noShop key entirely', async () => {
    render(<GmShopItems />);
    fireEvent.click(within(rowByName("Mother's Amulet")).getByRole('button'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const payload = saveDocument.mock.calls[0][2];
    expect('noShop' in payload).toBe(false);
  });

  it('filters to excluded-only', () => {
    render(<GmShopItems />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluded only' }));
    expect(screen.getByText("Mother's Amulet")).toBeInTheDocument();
    expect(screen.queryByText('Longsword')).not.toBeInTheDocument();
  });
});
