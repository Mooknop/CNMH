import { recallKnowledgeDC } from './recallKnowledge';

describe('recallKnowledgeDC', () => {
  test.each([
    [-1, 'common', 13],
    [0,  'common', 14],
    [1,  'common', 15],
    [5,  'common', 20],
    [10, 'common', 27],
    [20, 'common', 40],
    [25, 'common', 50],
  ])('level %i common → %i', (level, rarity, expected) => {
    expect(recallKnowledgeDC(level, rarity)).toBe(expected);
  });

  test('uncommon adds 2', () => {
    expect(recallKnowledgeDC(1, 'uncommon')).toBe(17);
  });

  test('rare adds 5', () => {
    expect(recallKnowledgeDC(1, 'rare')).toBe(20);
  });

  test('unique adds 10', () => {
    expect(recallKnowledgeDC(1, 'unique')).toBe(25);
  });

  test('defaults rarity to common when omitted', () => {
    expect(recallKnowledgeDC(5)).toBe(recallKnowledgeDC(5, 'common'));
  });

  test('clamps level below -1 to -1', () => {
    expect(recallKnowledgeDC(-5, 'common')).toBe(13);
  });

  test('clamps level above 25 to 25', () => {
    expect(recallKnowledgeDC(99, 'common')).toBe(50);
  });

  test('handles non-finite level gracefully (defaults to level 0)', () => {
    expect(recallKnowledgeDC(null, 'common')).toBe(14);
    expect(recallKnowledgeDC(undefined, 'common')).toBe(14);
    expect(recallKnowledgeDC(NaN, 'common')).toBe(14);
  });

  test('unknown rarity bumps by 0', () => {
    expect(recallKnowledgeDC(1, 'legendary')).toBe(15);
  });
});
