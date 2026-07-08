// PF2e GM Core treasure benchmarks (open license rules data, verbatim numbers).
// Sources: Table 10-9 Party Treasure by Level (https://2e.aonprd.com/Rules.aspx?ID=2656)
// and Table 10-10 Character Wealth (https://2e.aonprd.com/Rules.aspx?ID=2662).
// All currency values are gp. Item lists are { rank, qty } where rank is the
// item level. Table 10-9 assumes a four-PC party; see levelBudget() in
// utils/wealthBenchmark.js for the per-additional-PC adjustment.

export const BASELINE_PARTY_SIZE = 4;

// Table 10-9: treasure to award while the party works through the given level.
// Level 1 carries a footnote in the source: it is in addition to starting gear.
export const PARTY_TREASURE_BY_LEVEL = {
  1: { totalValue: 175, permanentItems: [{ rank: 2, qty: 2 }, { rank: 1, qty: 2 }], consumables: [{ rank: 2, qty: 2 }, { rank: 1, qty: 3 }], partyCurrency: 40, currencyPerAdditionalPc: 10 },
  2: { totalValue: 300, permanentItems: [{ rank: 3, qty: 2 }, { rank: 2, qty: 2 }], consumables: [{ rank: 3, qty: 2 }, { rank: 2, qty: 2 }, { rank: 1, qty: 2 }], partyCurrency: 70, currencyPerAdditionalPc: 18 },
  3: { totalValue: 500, permanentItems: [{ rank: 4, qty: 2 }, { rank: 3, qty: 2 }], consumables: [{ rank: 4, qty: 2 }, { rank: 3, qty: 2 }, { rank: 2, qty: 2 }], partyCurrency: 120, currencyPerAdditionalPc: 30 },
  4: { totalValue: 850, permanentItems: [{ rank: 5, qty: 2 }, { rank: 4, qty: 2 }], consumables: [{ rank: 5, qty: 2 }, { rank: 4, qty: 2 }, { rank: 3, qty: 2 }], partyCurrency: 200, currencyPerAdditionalPc: 50 },
  5: { totalValue: 1350, permanentItems: [{ rank: 6, qty: 2 }, { rank: 5, qty: 2 }], consumables: [{ rank: 6, qty: 2 }, { rank: 5, qty: 2 }, { rank: 4, qty: 2 }], partyCurrency: 320, currencyPerAdditionalPc: 80 },
  6: { totalValue: 2000, permanentItems: [{ rank: 7, qty: 2 }, { rank: 6, qty: 2 }], consumables: [{ rank: 7, qty: 2 }, { rank: 6, qty: 2 }, { rank: 5, qty: 2 }], partyCurrency: 500, currencyPerAdditionalPc: 125 },
  7: { totalValue: 2900, permanentItems: [{ rank: 8, qty: 2 }, { rank: 7, qty: 2 }], consumables: [{ rank: 8, qty: 2 }, { rank: 7, qty: 2 }, { rank: 6, qty: 2 }], partyCurrency: 720, currencyPerAdditionalPc: 180 },
  8: { totalValue: 4000, permanentItems: [{ rank: 9, qty: 2 }, { rank: 8, qty: 2 }], consumables: [{ rank: 9, qty: 2 }, { rank: 8, qty: 2 }, { rank: 7, qty: 2 }], partyCurrency: 1000, currencyPerAdditionalPc: 250 },
  9: { totalValue: 5700, permanentItems: [{ rank: 10, qty: 2 }, { rank: 9, qty: 2 }], consumables: [{ rank: 10, qty: 2 }, { rank: 9, qty: 2 }, { rank: 8, qty: 2 }], partyCurrency: 1400, currencyPerAdditionalPc: 350 },
  10: { totalValue: 8000, permanentItems: [{ rank: 11, qty: 2 }, { rank: 10, qty: 2 }], consumables: [{ rank: 11, qty: 2 }, { rank: 10, qty: 2 }, { rank: 9, qty: 2 }], partyCurrency: 2000, currencyPerAdditionalPc: 500 },
  11: { totalValue: 11500, permanentItems: [{ rank: 12, qty: 2 }, { rank: 11, qty: 2 }], consumables: [{ rank: 12, qty: 2 }, { rank: 11, qty: 2 }, { rank: 10, qty: 2 }], partyCurrency: 2800, currencyPerAdditionalPc: 700 },
  12: { totalValue: 16500, permanentItems: [{ rank: 13, qty: 2 }, { rank: 12, qty: 2 }], consumables: [{ rank: 13, qty: 2 }, { rank: 12, qty: 2 }, { rank: 11, qty: 2 }], partyCurrency: 4000, currencyPerAdditionalPc: 1000 },
  13: { totalValue: 25000, permanentItems: [{ rank: 14, qty: 2 }, { rank: 13, qty: 2 }], consumables: [{ rank: 14, qty: 2 }, { rank: 13, qty: 2 }, { rank: 12, qty: 2 }], partyCurrency: 6000, currencyPerAdditionalPc: 1500 },
  14: { totalValue: 36500, permanentItems: [{ rank: 15, qty: 2 }, { rank: 14, qty: 2 }], consumables: [{ rank: 15, qty: 2 }, { rank: 14, qty: 2 }, { rank: 13, qty: 2 }], partyCurrency: 9000, currencyPerAdditionalPc: 2250 },
  15: { totalValue: 54500, permanentItems: [{ rank: 16, qty: 2 }, { rank: 15, qty: 2 }], consumables: [{ rank: 16, qty: 2 }, { rank: 15, qty: 2 }, { rank: 14, qty: 2 }], partyCurrency: 13000, currencyPerAdditionalPc: 3250 },
  16: { totalValue: 82500, permanentItems: [{ rank: 17, qty: 2 }, { rank: 16, qty: 2 }], consumables: [{ rank: 17, qty: 2 }, { rank: 16, qty: 2 }, { rank: 15, qty: 2 }], partyCurrency: 20000, currencyPerAdditionalPc: 5000 },
  17: { totalValue: 128000, permanentItems: [{ rank: 18, qty: 2 }, { rank: 17, qty: 2 }], consumables: [{ rank: 18, qty: 2 }, { rank: 17, qty: 2 }, { rank: 16, qty: 2 }], partyCurrency: 30000, currencyPerAdditionalPc: 7500 },
  18: { totalValue: 208000, permanentItems: [{ rank: 19, qty: 2 }, { rank: 18, qty: 2 }], consumables: [{ rank: 19, qty: 2 }, { rank: 18, qty: 2 }, { rank: 17, qty: 2 }], partyCurrency: 48000, currencyPerAdditionalPc: 12000 },
  19: { totalValue: 355000, permanentItems: [{ rank: 20, qty: 2 }, { rank: 19, qty: 2 }], consumables: [{ rank: 20, qty: 2 }, { rank: 19, qty: 2 }, { rank: 18, qty: 2 }], partyCurrency: 80000, currencyPerAdditionalPc: 20000 },
  20: { totalValue: 490000, permanentItems: [{ rank: 20, qty: 4 }], consumables: [{ rank: 20, qty: 4 }, { rank: 19, qty: 2 }], partyCurrency: 140000, currencyPerAdditionalPc: 35000 },
};

// Table 10-10: total wealth a single character of the given level should hold.
// `lumpSum` is the all-currency alternative (the low estimate — items bought
// with it cap at 1 level below the character); `permanentItems` + `currency`
// is the standard allotment for a character joining at that level.
export const CHARACTER_WEALTH = {
  1: { permanentItems: [], currency: 15, lumpSum: 15 },
  2: { permanentItems: [{ rank: 1, qty: 1 }], currency: 20, lumpSum: 30 },
  3: { permanentItems: [{ rank: 2, qty: 1 }, { rank: 1, qty: 2 }], currency: 25, lumpSum: 75 },
  4: { permanentItems: [{ rank: 3, qty: 1 }, { rank: 2, qty: 2 }, { rank: 1, qty: 1 }], currency: 30, lumpSum: 140 },
  5: { permanentItems: [{ rank: 4, qty: 1 }, { rank: 3, qty: 2 }, { rank: 2, qty: 1 }, { rank: 1, qty: 2 }], currency: 50, lumpSum: 270 },
  6: { permanentItems: [{ rank: 5, qty: 1 }, { rank: 4, qty: 2 }, { rank: 3, qty: 1 }, { rank: 2, qty: 2 }], currency: 80, lumpSum: 450 },
  7: { permanentItems: [{ rank: 6, qty: 1 }, { rank: 5, qty: 2 }, { rank: 4, qty: 1 }, { rank: 3, qty: 2 }], currency: 125, lumpSum: 720 },
  8: { permanentItems: [{ rank: 7, qty: 1 }, { rank: 6, qty: 2 }, { rank: 5, qty: 1 }, { rank: 4, qty: 2 }], currency: 180, lumpSum: 1100 },
  9: { permanentItems: [{ rank: 8, qty: 1 }, { rank: 7, qty: 2 }, { rank: 6, qty: 1 }, { rank: 5, qty: 2 }], currency: 250, lumpSum: 1600 },
  10: { permanentItems: [{ rank: 9, qty: 1 }, { rank: 8, qty: 2 }, { rank: 7, qty: 1 }, { rank: 6, qty: 2 }], currency: 350, lumpSum: 2300 },
  11: { permanentItems: [{ rank: 10, qty: 1 }, { rank: 9, qty: 2 }, { rank: 8, qty: 1 }, { rank: 7, qty: 2 }], currency: 500, lumpSum: 3200 },
  12: { permanentItems: [{ rank: 11, qty: 1 }, { rank: 10, qty: 2 }, { rank: 9, qty: 1 }, { rank: 8, qty: 2 }], currency: 700, lumpSum: 4500 },
  13: { permanentItems: [{ rank: 12, qty: 1 }, { rank: 11, qty: 2 }, { rank: 10, qty: 1 }, { rank: 9, qty: 2 }], currency: 1000, lumpSum: 6400 },
  14: { permanentItems: [{ rank: 13, qty: 1 }, { rank: 12, qty: 2 }, { rank: 11, qty: 1 }, { rank: 10, qty: 2 }], currency: 1500, lumpSum: 9300 },
  15: { permanentItems: [{ rank: 14, qty: 1 }, { rank: 13, qty: 2 }, { rank: 12, qty: 1 }, { rank: 11, qty: 2 }], currency: 2250, lumpSum: 13500 },
  16: { permanentItems: [{ rank: 15, qty: 1 }, { rank: 14, qty: 2 }, { rank: 13, qty: 1 }, { rank: 12, qty: 2 }], currency: 3250, lumpSum: 20000 },
  17: { permanentItems: [{ rank: 16, qty: 1 }, { rank: 15, qty: 2 }, { rank: 14, qty: 1 }, { rank: 13, qty: 2 }], currency: 5000, lumpSum: 30000 },
  18: { permanentItems: [{ rank: 17, qty: 1 }, { rank: 16, qty: 2 }, { rank: 15, qty: 1 }, { rank: 14, qty: 2 }], currency: 7500, lumpSum: 45000 },
  19: { permanentItems: [{ rank: 18, qty: 1 }, { rank: 17, qty: 2 }, { rank: 16, qty: 1 }, { rank: 15, qty: 2 }], currency: 12000, lumpSum: 69000 },
  20: { permanentItems: [{ rank: 19, qty: 1 }, { rank: 18, qty: 2 }, { rank: 17, qty: 1 }, { rank: 16, qty: 2 }], currency: 20000, lumpSum: 112000 },
};
