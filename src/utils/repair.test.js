import { repairHp, repairDc, repairTimeLabel } from './repair';

describe('repairHp', () => {
  it('restores 5 × rank on a success', () => {
    expect(repairHp({ rank: 1, degree: 'success' })).toBe(5);   // trained
    expect(repairHp({ rank: 2, degree: 'success' })).toBe(10);  // expert
    expect(repairHp({ rank: 3, degree: 'success' })).toBe(15);  // master
    expect(repairHp({ rank: 4, degree: 'success' })).toBe(20);  // legendary
  });

  it('restores 10 × rank on a critical success', () => {
    expect(repairHp({ rank: 1, degree: 'criticalSuccess' })).toBe(10);
    expect(repairHp({ rank: 4, degree: 'criticalSuccess' })).toBe(40);
  });

  it('restores nothing on a failure or critical failure', () => {
    expect(repairHp({ rank: 3, degree: 'failure' })).toBe(0);
    expect(repairHp({ rank: 3, degree: 'criticalFailure' })).toBe(0);
  });

  it('restores nothing when untrained (rank 0)', () => {
    expect(repairHp({ rank: 0, degree: 'criticalSuccess' })).toBe(0);
  });
});

describe('repairDc', () => {
  it('uses the level-based DC for the item level', () => {
    expect(repairDc(5)).toBe(20);
    expect(repairDc(12)).toBe(30);
  });

  it('floors a level-0 / unleveled item at the level-1 DC', () => {
    expect(repairDc(0)).toBe(15);
    expect(repairDc(undefined)).toBe(15);
  });
});

describe('repairTimeLabel', () => {
  it('is 10 minutes without Quick Repair', () => {
    expect(repairTimeLabel({ rank: 4, quick: false })).toBe('10 minutes');
  });

  it('Quick Repair drops to 1 minute, then 3 actions (master), then 1 action (legendary)', () => {
    expect(repairTimeLabel({ rank: 1, quick: true })).toBe('1 minute');
    expect(repairTimeLabel({ rank: 2, quick: true })).toBe('1 minute');
    expect(repairTimeLabel({ rank: 3, quick: true })).toBe('3 actions');
    expect(repairTimeLabel({ rank: 4, quick: true })).toBe('1 action');
  });
});
