import { render, screen, fireEvent } from '@testing-library/react';

// Level-4 lump sum is 140 gp; level-5 is 270 gp. Aria (300 total) is flush
// (>140×1.4), Vestri (100 total) is behind (<140), Pell (280) is healthy for 5.
const characters = [
  { id: 'a', name: 'Aria', level: 4, gold: 100, inventory: [{ name: 'Sword', price: 200 }] },
  { id: 'b', name: 'Vestri', level: 4, gold: 100, inventory: [] },
  { id: 'p', name: 'Pell', level: 5, gold: 280, inventory: [] },
];

// Area A: one distributed room (35 gp claimed) + one untouched 45 gp cache.
const rooms = [
  {
    id: 'r1', code: 'A1', site: 'The Vaults',
    treasureCache: { gold: 0, items: [] },
    claimed: { gold: 25, itemsValue: 10 },
    distributedAt: 1,
  },
  {
    id: 'r2', code: 'A2', site: 'The Vaults',
    treasureCache: { gold: 25, items: [{ ref: 'acid-flask', name: 'Acid Flask', qty: 2 }] },
  },
];
const items = [{ id: 'acid-flask', name: 'Acid Flask', price: 10 }];

vi.mock('../../contexts/ContentContext', () => ({
  __esModule: true,
  useContent: () => ({ characters, rooms, items, runes: [] }),
}));

// Synced area→level assignments, seeded per test via `areaLevels`.
let areaLevels = {};
const mockSetAreaLevels = vi.fn((next) => { areaLevels = next; });
vi.mock('../../hooks/useSyncedState', () => ({
  __esModule: true,
  useSyncedState: (key, initial) => {
    if (String(key) === 'cnmh_lootareas_global') return [areaLevels, mockSetAreaLevels];
    return [initial, vi.fn()];
  },
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

describe('GmLootLedger — areas', () => {
  beforeEach(() => {
    areaLevels = {};
  });

  it('rolls up area totals with the claimed proportion and room counts', () => {
    render(<GmLootLedger />);
    // Area A: 45 gp remaining + 35 gp claimed = 80 gp stocked.
    expect(screen.getByText('80 gp')).toBeInTheDocument();
    expect(screen.getByText('35 gp claimed · 45 gp unclaimed')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 loot rooms distributed')).toBeInTheDocument();
    const meter = screen.getByRole('meter', { name: 'Area A claimed loot' });
    expect(meter).toHaveAttribute('aria-valuenow', '44'); // 35/80
  });

  it('compares against the party-size-adjusted budget once a level is assigned', () => {
    areaLevels = { A: 1 };
    render(<GmLootLedger />);
    // The 3-PC test roster clamps to the 4-PC baseline: level-1 budget 175 gp;
    // 80 stocked → 95 short. The line interleaves text nodes with gp()
    // interpolations, so match on the budget element's full textContent.
    const budget = document.querySelector('.gm-ledger-area-budget');
    expect(budget).not.toBeNull();
    expect(budget.textContent).toContain('80 gp of the 175 gp level-1 budget stocked (46%)');
    expect(budget.textContent).toContain('95 gp short');
    expect(budget.className).toContain('is-behind');
  });

  it('writes the assignment to the synced key', () => {
    render(<GmLootLedger />);
    fireEvent.change(screen.getByLabelText('Area A dungeon level'), { target: { value: '4' } });
    expect(mockSetAreaLevels).toHaveBeenCalledWith({ A: 4 });
  });
});
