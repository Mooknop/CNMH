import { describe, it, expect } from 'vitest';
import { itemTint, itemCharges, isGlowy, itemRarity, itemCode } from './inventoryTile';

describe('itemTint', () => {
  it('classifies by field presence with weapon/container precedence', () => {
    expect(itemTint({ name: 'Sword', strikes: [{ damage: '1d8' }] })).toBe('ember');
    expect(itemTint({ name: 'Pack', container: { contents: [] } })).toBe('gold');
    expect(itemTint({ name: 'Buckler', shield: { bonus: 1 } })).toBe('iron');
    expect(itemTint({ name: 'Potion', consumable: { kind: 'healing' } })).toBe('verdant');
    expect(itemTint({ name: 'Wand', wand: { spellRef: 'x' } })).toBe('arcane');
    expect(itemTint({ name: 'Robe', traits: ['Magical'] })).toBe('arcane');
    expect(itemTint({ name: 'Rope' })).toBe('iron');
  });

  it('lets weapon and container win over a Magical trait', () => {
    expect(itemTint({ name: 'Flaming Sword', strikes: [{}], traits: ['Magical'] })).toBe('ember');
    expect(itemTint({ name: 'Bag of Holding', container: { contents: [] }, traits: ['Magical'] })).toBe('gold');
  });

  it('treats a magical consumable as a consumable (verdant)', () => {
    expect(itemTint({ name: 'Elixir', consumable: {}, traits: ['Magical'] })).toBe('verdant');
  });
});

describe('itemCharges', () => {
  it('reads a staff charge block', () => {
    expect(itemCharges({ staff: { charges: { current: 2, max: 3 } } })).toEqual({ current: 2, max: 3 });
  });

  it('defaults current to max when only max is present', () => {
    expect(itemCharges({ charges: { max: 5 } })).toEqual({ current: 5, max: 5 });
  });

  it('models a wand as a single daily use', () => {
    expect(itemCharges({ wand: { spellRef: 'x' } })).toEqual({ current: 1, max: 1 });
  });

  it('returns null for items with no tracked resource', () => {
    expect(itemCharges({ name: 'Rope' })).toBeNull();
    expect(itemCharges(null)).toBeNull();
  });
});

describe('isGlowy', () => {
  it('is true for charged items and explicit glow flags', () => {
    expect(isGlowy({ staff: { charges: { max: 3 } } })).toBe(true);
    expect(isGlowy({ glow: true })).toBe(true);
  });
  it('is false for inert gear', () => {
    expect(isGlowy({ name: 'Bedroll' })).toBe(false);
  });
});

describe('itemRarity', () => {
  it('lowercases the rarity trait, or common when none', () => {
    expect(itemRarity({ traits: ['Rare', 'Magical'] })).toBe('rare');
    expect(itemRarity({ traits: ['Magical'] })).toBe('common');
  });
});

describe('itemCode', () => {
  it('derives a short uppercase code from the name', () => {
    expect(itemCode('Longsword')).toBe('LONG');
    expect(itemCode('Light Hammer')).toBe('LIHA');
    expect(itemCode('Lesser Healing Potion')).toBe('LHP');
    expect(itemCode('Rope (50 ft.)')).toBe('ROPE'); // strips digits / punctuation
  });

  it('falls back to ? for an empty name', () => {
    expect(itemCode('')).toBe('?');
    expect(itemCode(undefined)).toBe('?');
  });
});
