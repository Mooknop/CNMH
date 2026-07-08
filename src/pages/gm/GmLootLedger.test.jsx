import { render, screen, fireEvent } from '@testing-library/react';

// PCs are benched against the NEXT level's lump sum: level 4 → 270 gp, level 5
// → 450 gp. Aria (500 total) is flush (>270×1.4=378), Vestri (100) is behind
// (<270), Pell (500) is healthy for 5 (450–630).
const characters = [
  { id: 'a', name: 'Aria', level: 4, gold: 100, inventory: [{ name: 'Sword', price: 400 }] },
  { id: 'b', name: 'Vestri', level: 4, gold: 100, inventory: [] },
  { id: 'p', name: 'Pell', level: 5, gold: 500, inventory: [] },
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
    expect(ariaMeter).toHaveAttribute('aria-valuenow', '500');
    expect(ariaMeter).toHaveAttribute('aria-valuemax', '540'); // 2× the 270 gp next-level benchmark
  });

  it('shows the per-character coin/items breakdown', () => {
    render(<GmLootLedger />);
    expect(screen.getByText('100 gp coin · 400 gp in items')).toBeInTheDocument();
  });

  it('rolls up party wealth, benchmark, delta, and spread', () => {
    render(<GmLootLedger />);
    // Party 1,100 vs expected 270+270+450 = 990 → +110 ahead.
    expect(screen.getByText('1,100 gp')).toBeInTheDocument();
    expect(screen.getByText('990 gp')).toBeInTheDocument();
    expect(screen.getByText(/\+110 gp/)).toBeInTheDocument();
    expect(screen.getByText(/ahead/)).toBeInTheDocument();
    // Spread: Aria/Pell 500 ↔ Vestri 100.
    expect(screen.getByText(/↔ Vestri/)).toBeInTheDocument();
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

describe('GmLootLedger — level loot budget', () => {
  it('defaults to the party level and lists the Table 10-9 breakdown', () => {
    render(<GmLootLedger />);
    // Modal roster level is 4 (two of three PCs).
    expect(screen.getByLabelText('Budget level')).toHaveValue('4');
    const panel = screen.getByLabelText('Level loot budget');
    // Level-4 row (3-PC party clamps to the 4-PC baseline; no extra-PC lines).
    expect(panel.textContent).toContain('850 gp');
    expect(panel.textContent).toContain('2× level 5, 2× level 4');
    expect(panel.textContent).toContain('2× level 5, 2× level 4, 2× level 3');
    expect(panel.textContent).toContain('200 gp');
    expect(panel.textContent).not.toContain('extra PC');
  });

  it('overrides the level and offers the way back', () => {
    render(<GmLootLedger />);
    fireEvent.change(screen.getByLabelText('Budget level'), { target: { value: '6' } });
    const panel = screen.getByLabelText('Level loot budget');
    expect(panel.textContent).toContain('2,000 gp'); // level-6 total value
    const back = screen.getByRole('button', { name: 'Back to party level (4)' });
    fireEvent.click(back);
    expect(screen.getByLabelText('Budget level')).toHaveValue('4');
  });
});
