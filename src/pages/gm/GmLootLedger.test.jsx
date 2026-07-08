import { render, screen } from '@testing-library/react';

// Level-4 lump sum is 140 gp; level-5 is 270 gp. Aria (300 total) is flush
// (>140×1.4), Vestri (100 total) is behind (<140), Pell (280) is healthy for 5.
const characters = [
  { id: 'a', name: 'Aria', level: 4, gold: 100, inventory: [{ name: 'Sword', price: 200 }] },
  { id: 'b', name: 'Vestri', level: 4, gold: 100, inventory: [] },
  { id: 'p', name: 'Pell', level: 5, gold: 280, inventory: [] },
];

vi.mock('../../contexts/ContentContext', () => ({
  __esModule: true,
  useContent: () => ({ characters }),
}));

// Live gold mirrors each doc's committed gold in these tests.
vi.mock('../../hooks/usePartyGold', () => ({
  __esModule: true,
  usePartyGold: (chars) => ({
    goldById: Object.fromEntries((chars || []).map((c) => [c.id, c.gold])),
    total: (chars || []).reduce((s, c) => s + c.gold, 0),
  }),
}));

import GmLootLedger from './GmLootLedger';

describe('GmLootLedger', () => {
  it('renders a banded row per character with wealth vs benchmark', () => {
    render(<GmLootLedger />);
    expect(screen.getByText('Aria')).toBeInTheDocument();
    expect(screen.getByText('Flush')).toBeInTheDocument();
    expect(screen.getByText('Behind')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();

    const ariaMeter = screen.getByRole('meter', { name: 'Aria wealth vs benchmark' });
    expect(ariaMeter).toHaveAttribute('aria-valuenow', '300');
    expect(ariaMeter).toHaveAttribute('aria-valuemax', '280'); // 2× the 140 gp benchmark
  });

  it('shows the per-character coin/items breakdown', () => {
    render(<GmLootLedger />);
    expect(screen.getByText('100 gp coin · 200 gp in items')).toBeInTheDocument();
  });

  it('rolls up party wealth, benchmark, delta, and spread', () => {
    render(<GmLootLedger />);
    // Party 680 vs expected 140+140+270 = 550 → +130 ahead.
    expect(screen.getByText('680 gp')).toBeInTheDocument();
    expect(screen.getByText('550 gp')).toBeInTheDocument();
    expect(screen.getByText(/\+130 gp/)).toBeInTheDocument();
    expect(screen.getByText(/ahead/)).toBeInTheDocument();
    // Spread: Aria 300 ↔ Vestri 100.
    expect(screen.getByText(/Aria ↔ Vestri/)).toBeInTheDocument();
  });
});
