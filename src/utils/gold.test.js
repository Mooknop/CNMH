import { docGold } from './gold';

describe('docGold', () => {
  it('returns the doc gold when present', () => {
    expect(docGold({ id: 'a', gold: 75 })).toBe(75);
    expect(docGold({ gold: 0 })).toBe(0);
  });

  it('defaults to 0 when gold is absent or not a finite number', () => {
    expect(docGold({ id: 'a' })).toBe(0);
    expect(docGold(null)).toBe(0);
    expect(docGold(undefined)).toBe(0);
    expect(docGold({ gold: '50' })).toBe(0);
    expect(docGold({ gold: NaN })).toBe(0);
  });
});
