import {
  craftCostCp,
  halfCostCp,
  dailyReductionCp,
  critFailLossCp,
} from './craftingOutcome';

describe('craftCostCp', () => {
  it('converts a decimal-gp price to copper without float drift', () => {
    expect(craftCostCp(6)).toBe(600);
    expect(craftCostCp(75.1)).toBe(7510);
    expect(craftCostCp(0.05)).toBe(5);
  });

  it('treats a missing/zero price as 0', () => {
    expect(craftCostCp(undefined)).toBe(0);
    expect(craftCostCp(0)).toBe(0);
  });
});

describe('halfCostCp', () => {
  it('is half the full materials cost', () => {
    expect(halfCostCp(6)).toBe(300);
    expect(halfCostCp(75.1)).toBe(3755);
  });
});

describe('dailyReductionCp', () => {
  it('equals the Earn Income success value for the item level + crafter rank', () => {
    // lvl 8 expert success = 3 gp = 300 cp
    expect(dailyReductionCp({ itemLevel: 8, craftingRank: 2, degree: 'success' })).toBe(300);
    // lvl 12 master success = 10 gp = 1000 cp
    expect(dailyReductionCp({ itemLevel: 12, craftingRank: 3, degree: 'success' })).toBe(1000);
  });

  it('rolls up a level on a critical success', () => {
    // lvl 4 expert crit = lvl 5 expert success = 1 gp = 100 cp
    expect(dailyReductionCp({ itemLevel: 4, craftingRank: 2, degree: 'criticalSuccess' })).toBe(100);
  });

  it('reduces nothing on a failure or critical failure', () => {
    expect(dailyReductionCp({ itemLevel: 8, craftingRank: 2, degree: 'failure' })).toBe(0);
    expect(dailyReductionCp({ itemLevel: 8, craftingRank: 2, degree: 'criticalFailure' })).toBe(0);
  });
});

describe('critFailLossCp', () => {
  it('ruins 10% of the materials cost', () => {
    expect(critFailLossCp(100)).toBe(1000); // 100 gp → 10000 cp → 1000 cp lost
    expect(critFailLossCp(6)).toBe(60);
  });
});
