import { needsNewStride } from './movement';

describe('needsNewStride', () => {
  it('charges a new action on the first step of a Stride (feetThisAction 0)', () => {
    expect(needsNewStride(0, 5, 30)).toBe(true);
  });

  it('does not charge while accumulated distance stays within Speed', () => {
    expect(needsNewStride(5, 5, 30)).toBe(false);
    expect(needsNewStride(25, 5, 30)).toBe(false); // 25 + 5 = 30, exactly Speed
  });

  it('charges again when the step would cross Speed', () => {
    expect(needsNewStride(30, 5, 30)).toBe(true); // 30 + 5 = 35 > 30
  });

  it('handles larger step sizes that overshoot mid-segment', () => {
    expect(needsNewStride(20, 15, 30)).toBe(true); // 20 + 15 = 35 > 30
  });
});
