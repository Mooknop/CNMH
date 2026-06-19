import { describe, it, expect } from 'vitest';
import {
  gridDistanceFeet,
  parseRangeIncrement,
  rangeIncrementResult,
  MAX_RANGE_INCREMENTS,
} from './rangeIncrement';

describe('gridDistanceFeet (PF2e 5-10-5 diagonals)', () => {
  it('measures straight lines at 5 ft/square', () => {
    expect(gridDistanceFeet({ col: 0, row: 0 }, { col: 4, row: 0 })).toBe(20);
    expect(gridDistanceFeet({ col: 0, row: 0 }, { col: 0, row: 3 })).toBe(15);
  });

  it('alternates diagonal cost 5/10/5/10…', () => {
    expect(gridDistanceFeet({ col: 0, row: 0 }, { col: 1, row: 1 })).toBe(5);   // 5
    expect(gridDistanceFeet({ col: 0, row: 0 }, { col: 2, row: 2 })).toBe(15);  // 5+10
    expect(gridDistanceFeet({ col: 0, row: 0 }, { col: 3, row: 3 })).toBe(20);  // 5+10+5
    expect(gridDistanceFeet({ col: 0, row: 0 }, { col: 4, row: 4 })).toBe(30);  // 5+10+5+10
  });

  it('combines diagonals then straights', () => {
    // 2 diagonals (15 ft) + 2 straights (10 ft) = 25 ft
    expect(gridDistanceFeet({ col: 0, row: 0 }, { col: 4, row: 2 })).toBe(25);
  });

  it('is symmetric and zero for the same cell', () => {
    expect(gridDistanceFeet({ col: 5, row: 5 }, { col: 5, row: 5 })).toBe(0);
    expect(gridDistanceFeet({ col: 7, row: 2 }, { col: 1, row: 2 })).toBe(30);
  });

  it('honours a custom feet-per-square', () => {
    expect(gridDistanceFeet({ col: 0, row: 0 }, { col: 3, row: 0 }, 10)).toBe(30);
  });
});

describe('parseRangeIncrement', () => {
  it('parses "N feet" / "N ft" / "N-foot"', () => {
    expect(parseRangeIncrement('100 feet')).toBe(100);
    expect(parseRangeIncrement('60 ft')).toBe(60);
    expect(parseRangeIncrement('30-foot')).toBe(30);
  });

  it('passes through a positive number', () => {
    expect(parseRangeIncrement(80)).toBe(80);
  });

  it('returns null for melee/touch/empty/unparseable', () => {
    expect(parseRangeIncrement('Touch')).toBeNull();
    expect(parseRangeIncrement('melee')).toBeNull();
    expect(parseRangeIncrement('')).toBeNull();
    expect(parseRangeIncrement(null)).toBeNull();
    expect(parseRangeIncrement(undefined)).toBeNull();
    expect(parseRangeIncrement(0)).toBeNull();
  });
});

describe('rangeIncrementResult', () => {
  const at = (feet, incrementFt = 100) =>
    // Place the target `feet`/5 squares straight east of the attacker.
    rangeIncrementResult({ from: { col: 0, row: 0 }, to: { col: feet / 5, row: 0 }, incrementFt });

  it('first increment has no penalty', () => {
    expect(at(100)).toMatchObject({ increments: 1, penalty: 0, beyondMaxRange: false });
    expect(at(5)).toMatchObject({ increments: 1, penalty: 0 });
  });

  it('applies −2 per increment past the first', () => {
    expect(at(150)).toMatchObject({ increments: 2, penalty: -2 });
    expect(at(250)).toMatchObject({ increments: 3, penalty: -4 });
    expect(at(350)).toMatchObject({ increments: 4, penalty: -6, beyondMaxRange: false });
  });

  it('flags beyond 4× the increment as out of range', () => {
    expect(at(450)).toMatchObject({ increments: 5, beyondMaxRange: true });
    expect(MAX_RANGE_INCREMENTS).toBe(4);
  });

  it('reports the measured distance', () => {
    expect(at(150).feet).toBe(150);
  });

  it('waiveSecondIncrement (Hunt Prey) forgives the 2nd increment penalty', () => {
    const prey = (feet, incrementFt = 100) =>
      rangeIncrementResult({
        from: { col: 0, row: 0 }, to: { col: feet / 5, row: 0 },
        incrementFt, waiveSecondIncrement: true,
      });
    expect(prey(100)).toMatchObject({ increments: 1, penalty: 0, waived: false });
    expect(prey(150)).toMatchObject({ increments: 2, penalty: 0, waived: true });   // 2nd ignored
    expect(prey(250)).toMatchObject({ increments: 3, penalty: -2, waived: true });  // only 3rd
    expect(prey(350)).toMatchObject({ increments: 4, penalty: -4, waived: true });
    // The waiver doesn't extend max range — still out of range past 4×.
    expect(prey(450)).toMatchObject({ increments: 5, beyondMaxRange: true });
  });

  it('returns null without a valid increment or cells', () => {
    expect(rangeIncrementResult({ from: { col: 0, row: 0 }, to: { col: 1, row: 0 }, incrementFt: null })).toBeNull();
    expect(rangeIncrementResult({ from: { col: 0, row: 0 }, to: { col: 1, row: 0 }, incrementFt: 0 })).toBeNull();
    expect(rangeIncrementResult({ from: null, to: { col: 1, row: 0 }, incrementFt: 100 })).toBeNull();
    expect(rangeIncrementResult({ from: { col: 0, row: 0 }, to: null, incrementFt: 100 })).toBeNull();
  });
});
