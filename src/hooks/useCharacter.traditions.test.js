import { renderHook } from '@testing-library/react';
import { useCharacter } from './useCharacter';

// S3 (#648): useCharacter must hide wrong-tradition scroll/wand spells from the
// castable lists. The SpellUtils extractors are mocked to return fixed
// tradition-bearing spells; canActivateSpellItem (the real resolver) does the
// filtering, driven by each character's spellcasting tradition.

vi.mock('../utils/CharacterUtils', () => ({
  getAbilityModifier: (score) => Math.floor((score - 10) / 2),
  getSkillModifier: vi.fn(() => 5),
  getItemBonus: vi.fn(() => 0),
  SKILL_ABILITY_MAP: { acrobatics: 'dexterity', athletics: 'strength' },
  calculateClassDC: vi.fn((level) => 10 + level),
  calculateEnhancedBulkLimit: vi.fn(() => 10),
  hasFeat: vi.fn(() => false),
  FEAT_NAMES: { FAMILIAR: 'Familiar', ANIMAL_COMPANION: 'Animal Companion' },
}));

vi.mock('../utils/ActionsUtils', () => ({
  getStrikes: () => [],
  getActions: () => [],
  getReactions: () => [],
  getFreeActions: () => [],
}));

vi.mock('../utils/SpellUtils', () => ({
  calculateSpellStats: () => ({ spellAttackMod: 5, spellDC: 15 }),
  findScrollItems: () => [{}],
  extractScrollSpells: () => [
    { name: 'Force Barrage', traditions: ['arcane', 'occult'] },
    { name: 'Heal', traditions: ['divine', 'primal'] },
  ],
  findWandItems: () => [{}],
  extractWandSpells: () => [
    { name: 'Breathe Fire', traditions: ['arcane', 'primal'] },
  ],
  extractInnateSpells: () => [],
}));

vi.mock('../utils/InventoryUtils', () => ({
  calculateItemsBulk: () => 5,
  formatBulk: (bulk) => bulk.toString(),
}));

const baseChar = (spellcasting) => ({
  id: 'x',
  name: 'X',
  level: 5,
  abilities: {
    strength: 10, dexterity: 10, constitution: 10,
    intelligence: 10, wisdom: 10, charisma: 10,
  },
  inventory: [],
  feats: [],
  ...(spellcasting ? { spellcasting } : {}),
});

const names = (list) => list.map((s) => s.name);

describe('useCharacter — scroll/wand tradition gating', () => {
  it('keeps only scroll/wand spells matching an Arcane caster', () => {
    const { result } = renderHook(() => useCharacter(baseChar({ tradition: 'Arcane' })));
    expect(names(result.current.scrollSpells)).toEqual(['Force Barrage']);
    expect(names(result.current.wandSpells)).toEqual(['Breathe Fire']);
    expect(result.current.flags.hasScrolls).toBe(true);
    expect(result.current.flags.hasWands).toBe(true);
  });

  it('keeps only the divine scroll and hides the (arcane/primal) wand for a Divine caster', () => {
    const { result } = renderHook(() => useCharacter(baseChar({ tradition: 'Divine' })));
    expect(names(result.current.scrollSpells)).toEqual(['Heal']);
    expect(result.current.wandSpells).toEqual([]);
    expect(result.current.flags.hasScrolls).toBe(true);
    expect(result.current.flags.hasWands).toBe(false);
  });

  it('hides everything for a non-caster (no spellcasting tradition)', () => {
    const { result } = renderHook(() => useCharacter(baseChar(null)));
    expect(result.current.scrollSpells).toEqual([]);
    expect(result.current.wandSpells).toEqual([]);
    expect(result.current.flags.hasScrolls).toBe(false);
    expect(result.current.flags.hasWands).toBe(false);
  });
});
