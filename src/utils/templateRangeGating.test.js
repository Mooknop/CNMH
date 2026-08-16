import { describe, it, expect } from 'vitest';
import { templateRangeGate } from './templateRangeGating';

const CASTER = { col: 0, row: 0 };

describe('templateRangeGate (#1751 OQ-5)', () => {
  it('allows a placement within the parsed range', () => {
    const result = templateRangeGate({
      range: '30 feet', casterCell: CASTER, placedCell: { col: 4, row: 0 }, // 20 ft
    });
    expect(result).toEqual({ blocked: false, rangeFeet: 30, feet: 20 });
  });

  it('allows a placement exactly at the range boundary', () => {
    const result = templateRangeGate({
      range: '30 feet', casterCell: CASTER, placedCell: { col: 6, row: 0 }, // 30 ft
    });
    expect(result).toEqual({ blocked: false, rangeFeet: 30, feet: 30 });
  });

  it('hard-blocks a placement beyond the parsed range', () => {
    const result = templateRangeGate({
      range: '30 feet', casterCell: CASTER, placedCell: { col: 7, row: 0 }, // 35 ft
    });
    expect(result).toEqual({ blocked: true, rangeFeet: 30, feet: 35 });
  });

  it('measures with PF2e 5-10-5 diagonals, matching the strike-range idiom', () => {
    const result = templateRangeGate({
      range: '10 feet', casterCell: CASTER, placedCell: { col: 2, row: 2 }, // 15 ft diagonal
    });
    expect(result).toMatchObject({ blocked: true, feet: 15 });
  });

  it('honors a non-default scene scale', () => {
    const result = templateRangeGate({
      range: '20 feet', casterCell: CASTER, placedCell: { col: 3, row: 0 }, feetPerSquare: 10,
    });
    expect(result).toMatchObject({ blocked: true, feet: 30 });
  });

  it.each([
    ['touch', 'Touch'],
    ['self', 'self'],
    ['prose', 'planetary'],
    ['empty', ''],
    ['missing', undefined],
  ])('degrades to ALWAYS ALLOWED for an unparseable range (%s)', (_label, range) => {
    const result = templateRangeGate({
      range, casterCell: CASTER, placedCell: { col: 999, row: 999 },
    });
    expect(result).toEqual({ blocked: false, rangeFeet: null, feet: null });
  });

  it('never blocks when a cell is missing, even with a parseable range', () => {
    expect(templateRangeGate({ range: '30 feet', casterCell: null, placedCell: { col: 1, row: 0 } }))
      .toMatchObject({ blocked: false, feet: null });
    expect(templateRangeGate({ range: '30 feet', casterCell: CASTER, placedCell: null }))
      .toMatchObject({ blocked: false, feet: null });
  });

  it('never blocks with no arguments at all', () => {
    expect(templateRangeGate()).toEqual({ blocked: false, rangeFeet: null, feet: null });
  });
});
