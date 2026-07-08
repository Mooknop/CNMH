import {
  clampLevel,
  inventoryValue,
  characterWealth,
  lumpSumFor,
  wealthBand,
  WEALTH_BANDS,
  FLUSH_RATIO,
  levelBudget,
  partyExpected,
  partyLevel,
} from './wealthBenchmark';
import {
  PARTY_TREASURE_BY_LEVEL,
  CHARACTER_WEALTH,
} from '../data/wealthBenchmarks';

describe('wealthBenchmarks data', () => {
  it('covers levels 1-20 in both tables', () => {
    for (let lvl = 1; lvl <= 20; lvl++) {
      expect(PARTY_TREASURE_BY_LEVEL[lvl]).toBeDefined();
      expect(CHARACTER_WEALTH[lvl]).toBeDefined();
    }
  });

  it('matches spot-checked source values', () => {
    expect(PARTY_TREASURE_BY_LEVEL[1].totalValue).toBe(175);
    expect(PARTY_TREASURE_BY_LEVEL[10].partyCurrency).toBe(2000);
    expect(PARTY_TREASURE_BY_LEVEL[20].permanentItems).toEqual([{ rank: 20, qty: 4 }]);
    expect(CHARACTER_WEALTH[1].lumpSum).toBe(15);
    expect(CHARACTER_WEALTH[5].lumpSum).toBe(270);
    expect(CHARACTER_WEALTH[20].lumpSum).toBe(112000);
  });

  it('keeps the currency-per-additional-PC column at a quarter of party currency (rounded)', () => {
    for (let lvl = 1; lvl <= 20; lvl++) {
      const row = PARTY_TREASURE_BY_LEVEL[lvl];
      expect(Math.abs(row.currencyPerAdditionalPc - row.partyCurrency / 4)).toBeLessThanOrEqual(1);
    }
  });
});

describe('clampLevel', () => {
  it('clamps into 1-20 and rounds', () => {
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(21)).toBe(20);
    expect(clampLevel(4.6)).toBe(5);
    expect(clampLevel(undefined)).toBe(1);
    expect(clampLevel('7')).toBe(7);
  });
});

describe('inventoryValue', () => {
  it('sums price × quantity and treats unpriced items as 0', () => {
    const inventory = [
      { name: 'Longsword +1', price: 35 },
      { name: 'Arrows', price: 0.1, quantity: 20 },
      { name: 'Story Token' },
    ];
    expect(inventoryValue(inventory)).toBeCloseTo(37);
  });

  it('includes container contents', () => {
    const inventory = [
      {
        name: 'Backpack',
        price: 0.1,
        container: { contents: [{ name: 'Healing Potion', price: 12, quantity: 2 }] },
      },
    ];
    expect(inventoryValue(inventory)).toBeCloseTo(24.1);
  });

  it('handles missing or empty inventories', () => {
    expect(inventoryValue(undefined)).toBe(0);
    expect(inventoryValue([])).toBe(0);
  });
});

describe('characterWealth', () => {
  const character = { gold: 50, inventory: [{ name: 'Sword', price: 100 }] };

  it('uses the live gold overlay when provided', () => {
    expect(characterWealth(character, 80)).toEqual({ gold: 80, items: 100, total: 180 });
  });

  it('falls back to doc gold without an overlay value', () => {
    expect(characterWealth(character)).toEqual({ gold: 50, items: 100, total: 150 });
    expect(characterWealth(character, NaN).gold).toBe(50);
  });

  it('handles a bare character', () => {
    expect(characterWealth({})).toEqual({ gold: 0, items: 0, total: 0 });
  });
});

describe('wealthBand', () => {
  it('classifies against the level lump sum', () => {
    // Level 5 lump sum is 270 gp.
    expect(wealthBand(269, 5)).toBe(WEALTH_BANDS.BEHIND);
    expect(wealthBand(270, 5)).toBe(WEALTH_BANDS.HEALTHY);
    expect(wealthBand(270 * FLUSH_RATIO, 5)).toBe(WEALTH_BANDS.HEALTHY);
    expect(wealthBand(270 * FLUSH_RATIO + 1, 5)).toBe(WEALTH_BANDS.FLUSH);
  });

  it('exposes the lump sum lookup', () => {
    expect(lumpSumFor(5)).toBe(270);
    expect(lumpSumFor(99)).toBe(112000);
  });
});

describe('levelBudget', () => {
  it('returns the raw row for a four-PC party', () => {
    const budget = levelBudget(4);
    expect(budget.totalValue).toBe(850);
    expect(budget.currency).toBe(200);
    expect(budget.extraPcs).toBe(0);
    expect(budget.extraPermanentItems).toBe(0);
    expect(budget.extraConsumables).toBe(0);
    expect(budget.permanentItems).toEqual([{ rank: 5, qty: 2 }, { rank: 4, qty: 2 }]);
  });

  it('adds the fifth-PC share', () => {
    const budget = levelBudget(4, 5);
    expect(budget.totalValue).toBe(Math.round(850 * 1.25));
    expect(budget.currency).toBe(200 + 50);
    expect(budget.extraPcs).toBe(1);
    expect(budget.extraPermanentItems).toBe(1);
    expect(budget.extraConsumables).toBe(2);
  });

  it('does not reduce below the four-PC baseline for small parties', () => {
    expect(levelBudget(4, 3)).toEqual(levelBudget(4, 4));
  });

  it('defaults party size to the baseline', () => {
    expect(levelBudget(1).totalValue).toBe(175);
    expect(levelBudget(20, 6).currency).toBe(140000 + 2 * 35000);
  });
});

describe('partyExpected', () => {
  it('sums per-character lump sums', () => {
    const characters = [{ level: 4 }, { level: 4 }, { level: 5 }];
    expect(partyExpected(characters)).toBe(140 + 140 + 270);
  });

  it('is 0 for an empty roster', () => {
    expect(partyExpected([])).toBe(0);
    expect(partyExpected(undefined)).toBe(0);
  });
});

describe('partyLevel', () => {
  it('returns the most common level', () => {
    expect(partyLevel([{ level: 4 }, { level: 4 }, { level: 5 }])).toBe(4);
  });

  it('breaks ties upward', () => {
    expect(partyLevel([{ level: 4 }, { level: 5 }])).toBe(5);
  });

  it('defaults to 1 for an empty roster', () => {
    expect(partyLevel([])).toBe(1);
    expect(partyLevel(undefined)).toBe(1);
  });
});
