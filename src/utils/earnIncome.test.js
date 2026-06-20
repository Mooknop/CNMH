import { taskDc, columnForRank, payoutCp, cpToGp } from './earnIncome';
import { EARN_INCOME_TABLE, CRIT_SUCCESS_20 } from '../data/earnIncomeTable';

describe('earnIncome table', () => {
  it('has a contiguous level 0–20 index', () => {
    expect(EARN_INCOME_TABLE).toHaveLength(21);
    EARN_INCOME_TABLE.forEach((row, i) => expect(row.level).toBe(i));
  });
});

describe('taskDc', () => {
  it('reads the DC for the lvl 4–12 band we care about', () => {
    expect(taskDc(4)).toBe(19);
    expect(taskDc(8)).toBe(24);
    expect(taskDc(12)).toBe(30);
  });

  it('clamps out-of-range levels to the table ends', () => {
    expect(taskDc(-3)).toBe(14); // level 0
    expect(taskDc(99)).toBe(40); // level 20
  });
});

describe('columnForRank', () => {
  it('maps ranks 1–4 to columns', () => {
    expect(columnForRank(1)).toBe('trained');
    expect(columnForRank(2)).toBe('expert');
    expect(columnForRank(3)).toBe('master');
    expect(columnForRank(4)).toBe('legendary');
  });

  it('returns null for untrained (rank 0)', () => {
    expect(columnForRank(0)).toBeNull();
  });
});

describe('payoutCp', () => {
  it('success pays the proficiency column for the task level', () => {
    // lvl 8 expert success = 3 gp = 300 cp
    expect(payoutCp({ taskLevel: 8, rank: 2, degree: 'success' })).toBe(300);
    // lvl 12 master success = 10 gp = 1000 cp
    expect(payoutCp({ taskLevel: 12, rank: 3, degree: 'success' })).toBe(1000);
  });

  it('critical success rolls up to the next level Success cell (same column)', () => {
    // lvl 4 expert crit = lvl 5 expert success = 1 gp = 100 cp
    expect(payoutCp({ taskLevel: 4, rank: 2, degree: 'criticalSuccess' })).toBe(100);
    // lvl 7 trained crit = lvl 8 trained success = 2 gp 5 sp = 250 cp
    expect(payoutCp({ taskLevel: 7, rank: 1, degree: 'criticalSuccess' })).toBe(250);
  });

  it('level-20 critical success uses the dedicated crit row, not level 21', () => {
    expect(payoutCp({ taskLevel: 20, rank: 4, degree: 'criticalSuccess' }))
      .toBe(CRIT_SUCCESS_20.legendary);
    expect(payoutCp({ taskLevel: 20, rank: 1, degree: 'criticalSuccess' })).toBe(5000);
  });

  it('failure pays the proficiency-independent Failed column', () => {
    // lvl 8 failed = 5 sp = 50 cp, regardless of rank
    expect(payoutCp({ taskLevel: 8, rank: 1, degree: 'failure' })).toBe(50);
    expect(payoutCp({ taskLevel: 8, rank: 4, degree: 'failure' })).toBe(50);
  });

  it('critical failure earns nothing', () => {
    expect(payoutCp({ taskLevel: 12, rank: 4, degree: 'criticalFailure' })).toBe(0);
  });

  it('untrained never beats the Failed amount, even on a (crit) success', () => {
    const failed = EARN_INCOME_TABLE[8].failed;
    expect(payoutCp({ taskLevel: 8, rank: 0, degree: 'success' })).toBe(failed);
    expect(payoutCp({ taskLevel: 8, rank: 0, degree: 'criticalSuccess' })).toBe(failed);
  });

  it('clamps out-of-range task levels', () => {
    // lvl 19 trained crit rolls up into lvl 20 trained = 40 gp = 4000 cp
    expect(payoutCp({ taskLevel: 19, rank: 1, degree: 'criticalSuccess' })).toBe(4000);
  });
});

describe('cpToGp', () => {
  it('converts copper to decimal gp', () => {
    expect(cpToGp(100)).toBe(1);
    expect(cpToGp(50)).toBe(0.5);
    expect(cpToGp(5)).toBe(0.05);
    expect(cpToGp(0)).toBe(0);
  });
});
