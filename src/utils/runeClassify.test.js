import { runeTarget, isRuneDoc, isRuneItem, FUNDAMENTAL_RUNE_ITEM_IDS } from './runeClassify';

describe('runeTarget', () => {
  it('prefers an explicit target (forward-compatible with ring/accessory)', () => {
    expect(runeTarget({ type: 'fundamental', target: 'weapon' })).toBe('weapon');
    expect(runeTarget({ type: 'property', target: 'ring' })).toBe('ring');
  });
  it('falls back to armorRune → armor, else weapon', () => {
    expect(runeTarget({ type: 'property', armorRune: true })).toBe('armor');
    expect(runeTarget({ type: 'property' })).toBe('weapon');
  });
  it('is null for a non-object', () => {
    expect(runeTarget(null)).toBeNull();
  });
});

describe('isRuneDoc', () => {
  it('is true for property + fundamental docs, false otherwise', () => {
    expect(isRuneDoc({ type: 'property' })).toBe(true);
    expect(isRuneDoc({ type: 'fundamental' })).toBe(true);
    expect(isRuneDoc({ type: 'weapon' })).toBe(false);
    expect(isRuneDoc(null)).toBe(false);
  });
});

describe('isRuneItem', () => {
  const runeIds = new Set(['slick', 'vitalizing', 'striking', 'resilient']);
  it('catches armor runes (armorRune flag)', () => {
    expect(isRuneItem({ id: 'slick', armorRune: true }, runeIds)).toBe(true);
    expect(isRuneItem({ id: 'armor-potency', armorRune: true }, runeIds)).toBe(true);
  });
  it('catches the fundamental rune item ids (incl. the un-flagged weapon-potency)', () => {
    FUNDAMENTAL_RUNE_ITEM_IDS.forEach((id) => expect(isRuneItem({ id }, runeIds)).toBe(true));
  });
  it('catches a weapon property rune item by its rune-catalog id', () => {
    expect(isRuneItem({ id: 'vitalizing', traits: ['Magical'] }, runeIds)).toBe(true);
  });
  it('catches a Rune-trait item even without other signals', () => {
    expect(isRuneItem({ id: 'mystery', traits: ['Rune'] })).toBe(true);
  });
  it('leaves ordinary items alone', () => {
    expect(isRuneItem({ id: 'healing-potion', traits: ['Healing'] }, runeIds)).toBe(false);
    expect(isRuneItem(null, runeIds)).toBe(false);
  });
});
