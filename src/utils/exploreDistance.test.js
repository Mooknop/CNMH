import {
  normalizeExploreDistance,
  accrueExploreDistance,
  accrueGroupExploreDistance,
  partyExploreDistance,
} from './exploreDistance';

describe('normalizeExploreDistance', () => {
  it('normalizes a positive legacy number into base with no perChar entries', () => {
    expect(normalizeExploreDistance(300)).toEqual({ base: 300, perChar: {} });
  });

  it('normalizes 0 (the reset value) to an empty ledger', () => {
    expect(normalizeExploreDistance(0)).toEqual({ base: 0, perChar: {} });
  });

  it('normalizes null/undefined/garbage to an empty ledger', () => {
    expect(normalizeExploreDistance(null)).toEqual({ base: 0, perChar: {} });
    expect(normalizeExploreDistance(undefined)).toEqual({ base: 0, perChar: {} });
    expect(normalizeExploreDistance('garbage')).toEqual({ base: 0, perChar: {} });
    expect(normalizeExploreDistance(NaN)).toEqual({ base: 0, perChar: {} });
    expect(normalizeExploreDistance(-50)).toEqual({ base: 0, perChar: {} });
  });

  it('fills in defaults and drops non-finite/non-positive perChar entries', () => {
    expect(normalizeExploreDistance({
      base: 10,
      perChar: { a: 20, b: -5, c: 0, d: NaN, e: 'nope', f: 15 },
    })).toEqual({ base: 10, perChar: { a: 20, f: 15 } });
  });

  it('coerces a missing/garbage base to 0', () => {
    expect(normalizeExploreDistance({ perChar: { a: 5 } })).toEqual({ base: 0, perChar: { a: 5 } });
    expect(normalizeExploreDistance({ base: 'nope', perChar: { a: 5 } })).toEqual({ base: 0, perChar: { a: 5 } });
  });
});

describe('accrueExploreDistance', () => {
  it('accrues from a clean (0) tally', () => {
    const next = accrueExploreDistance(0, 'char-1', 30);
    expect(next).toEqual({ base: 0, perChar: { 'char-1': 30 } });
  });

  it('accrues from null', () => {
    const next = accrueExploreDistance(null, 'char-1', 30);
    expect(next).toEqual({ base: 0, perChar: { 'char-1': 30 } });
  });

  it('folds a pre-existing legacy number into base, additive', () => {
    const next = accrueExploreDistance(100, 'char-1', 30);
    expect(next).toEqual({ base: 100, perChar: { 'char-1': 30 } });
    expect(partyExploreDistance(next)).toBe(130);
  });

  it('the headline case: 5 different characters each moving 30 ft yields party MAX (30), not the sum', () => {
    let ledger = 0;
    for (const charId of ['a', 'b', 'c', 'd', 'e']) {
      ledger = accrueExploreDistance(ledger, charId, 30);
    }
    expect(partyExploreDistance(ledger)).toBe(30);
  });

  it('the same character accruing twice sums their own total', () => {
    let ledger = accrueExploreDistance(0, 'char-1', 20);
    ledger = accrueExploreDistance(ledger, 'char-1', 15);
    expect(ledger).toEqual({ base: 0, perChar: { 'char-1': 35 } });
    expect(partyExploreDistance(ledger)).toBe(35);
  });

  it('ignores zero, negative, and NaN feet', () => {
    const start = { base: 0, perChar: { 'char-1': 10 } };
    expect(accrueExploreDistance(start, 'char-1', 0)).toBe(start);
    expect(accrueExploreDistance(start, 'char-1', -5)).toBe(start);
    expect(accrueExploreDistance(start, 'char-1', NaN)).toBe(start);
  });

  it('ignores a falsy charId', () => {
    const start = { base: 0, perChar: {} };
    expect(accrueExploreDistance(start, null, 30)).toBe(start);
    expect(accrueExploreDistance(start, '', 30)).toBe(start);
    expect(accrueExploreDistance(start, undefined, 30)).toBe(start);
  });
});

describe('accrueGroupExploreDistance', () => {
  it('from a clean tally, party distance equals the group MAX feetMoved', () => {
    const results = [
      { moverId: 'a', ok: true, feetMoved: 30, reached: true },
      { moverId: 'b', ok: true, feetMoved: 15, reached: true },
    ];
    const next = accrueGroupExploreDistance(0, results);
    expect(partyExploreDistance(next)).toBe(30);
  });

  it('a partial result (ok:false) with a positive feetMoved still accrues to that mover', () => {
    const results = [
      { moverId: 'a', ok: false, feetMoved: 10, reached: false },
    ];
    const next = accrueGroupExploreDistance(0, results);
    expect(next).toEqual({ base: 0, perChar: { a: 10 } });
  });

  it('skips entries with no moverId or non-positive feetMoved', () => {
    const results = [
      { moverId: null, feetMoved: 50 },
      { moverId: 'a', feetMoved: 0 },
      { moverId: 'b', feetMoved: -5 },
    ];
    const start = { base: 0, perChar: {} };
    expect(accrueGroupExploreDistance(start, results)).toEqual({ base: 0, perChar: {} });
  });

  it('empty/no-op results return prev unchanged', () => {
    const start = { base: 0, perChar: { a: 10 } };
    expect(accrueGroupExploreDistance(start, [])).toBe(start);
    expect(accrueGroupExploreDistance(start, null)).toBe(start);
  });

  it('a straggler catch-up after a group move adds nothing once their total is no higher', () => {
    // Group move: A goes 30, B fails to move (0 ft).
    let ledger = accrueGroupExploreDistance(0, [
      { moverId: 'a', ok: true, feetMoved: 30, reached: true },
      { moverId: 'b', ok: false, feetMoved: 0, reached: false },
    ]);
    expect(partyExploreDistance(ledger)).toBe(30);

    // B catches up with their own single move of 30 ft.
    ledger = accrueExploreDistance(ledger, 'b', 30);
    expect(ledger).toEqual({ base: 0, perChar: { a: 30, b: 30 } });
    expect(partyExploreDistance(ledger)).toBe(30);
  });
});

describe('partyExploreDistance', () => {
  it('returns the number itself for a legacy number', () => {
    expect(partyExploreDistance(300)).toBe(300);
  });

  it('returns base + max(0, ...perChar values) for a ledger object', () => {
    expect(partyExploreDistance({ base: 10, perChar: { a: 20, b: 5 } })).toBe(30);
  });

  it('returns 0 for null/undefined/garbage', () => {
    expect(partyExploreDistance(null)).toBe(0);
    expect(partyExploreDistance(undefined)).toBe(0);
    expect(partyExploreDistance('garbage')).toBe(0);
    expect(partyExploreDistance(0)).toBe(0);
  });
});
