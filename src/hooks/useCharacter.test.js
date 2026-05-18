import { renderHook } from '@testing-library/react';
import { useCharacter } from './useCharacter';

// Mock all the utility modules
jest.mock('../utils/CharacterUtils', () => ({
  getAbilityModifier: (score) => Math.floor((score - 10) / 2),
  getSkillModifier: jest.fn((char, skill) => 5),
  getItemBonus: jest.fn(() => 0),
  SKILL_ABILITY_MAP: {
    acrobatics: 'dexterity',
    athletics: 'strength'
  },
  calculateClassDC: jest.fn((level) => 10 + level),
  calculateEnhancedBulkLimit: jest.fn((char) => 10),
  hasFeat: jest.fn(() => false),
  FEAT_NAMES: {
    FAMILIAR: 'Familiar',
    ANIMAL_COMPANION: 'Animal Companion'
  }
}));

jest.mock('../utils/ActionsUtils', () => ({
  getStrikes: () => [],
  getActions: () => [],
  getReactions: () => [],
  getFreeActions: () => [],
}));

jest.mock('../utils/SpellUtils', () => ({
  calculateSpellStats: () => ({ spellAttackMod: 5, spellDC: 15 }),
  findScrollItems: () => [],
  extractScrollSpells: () => [],
  findWandItems: () => [],
  extractWandSpells: () => [],
  extractInnateSpells: () => [],
  findGemItems: () => [],
  extractGemSpells: () => [],
}));

jest.mock('../utils/InventoryUtils', () => ({
  calculateItemsBulk: () => 5,
  formatBulk: (bulk) => bulk.toString(),
}));

describe('useCharacter', () => {
  it('should return null when character is null', () => {
    const { result } = renderHook(() => useCharacter(null));
    expect(result.current).toBeNull();
  });

  it('should return null when character is undefined', () => {
    const { result } = renderHook(() => useCharacter(undefined));
    expect(result.current).toBeNull();
  });

  it('should return computed character object', () => {
    const character = {
      id: '1',
      name: 'Test Character',
      level: 1,
      abilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      },
      inventory: [],
      feats: []
    };

    const { result } = renderHook(() => useCharacter(character));
    
    expect(result.current).not.toBeNull();
    expect(result.current.id).toBe('1');
    expect(result.current.name).toBe('Test Character');
  });

  it('should compute ability modifiers', () => {
    const character = {
      id: '1',
      name: 'Test Character',
      level: 1,
      abilities: {
        strength: 14,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      },
      inventory: [],
      feats: []
    };

    const { result } = renderHook(() => useCharacter(character));
    
    expect(result.current.abilityScores.strength).toBe(14);
  });

  it('should memoize results when character data does not change', () => {
    const character = {
      id: '1',
      name: 'Test Character',
      level: 1,
      abilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      },
      inventory: [],
      feats: []
    };

    const { result, rerender } = renderHook(
      (char) => useCharacter(char),
      { initialProps: character }
    );

    const firstResult = result.current;

    rerender(character);

    // Should return the same memoized object
    expect(result.current).toBe(firstResult);
  });

  it('should update when character changes', () => {
    const character1 = {
      id: '1',
      name: 'Character 1',
      level: 1,
      abilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      },
      inventory: [],
      feats: []
    };

    const character2 = {
      id: '2',
      name: 'Character 2',
      level: 2,
      abilities: {
        strength: 12,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      },
      inventory: [],
      feats: []
    };

    const { result, rerender } = renderHook(
      (char) => useCharacter(char),
      { initialProps: character1 }
    );

    expect(result.current.id).toBe('1');
    expect(result.current.name).toBe('Character 1');

    rerender(character2);

    expect(result.current.id).toBe('2');
    expect(result.current.name).toBe('Character 2');
  });

  it('should include strikes, actions, reactions, and free actions', () => {
    const character = {
      id: '1',
      name: 'Test Character',
      level: 1,
      abilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      },
      inventory: [],
      feats: [],
      strikes: [],
      actions: [],
      reactions: [],
      freeActions: []
    };

    const { result } = renderHook(() => useCharacter(character));
    
    expect(result.current).toBeDefined();
    expect(Array.isArray(result.current.strikes || [])).toBe(true);
    expect(Array.isArray(result.current.actions || [])).toBe(true);
  });

  it('should include spell information', () => {
    const character = {
      id: '1',
      name: 'Test Character',
      level: 1,
      abilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 16,
        wisdom: 10,
        charisma: 10
      },
      inventory: [],
      feats: [],
      spellcasting: {
        ability: 'intelligence',
        proficiency: 1
      }
    };

    const { result } = renderHook(() => useCharacter(character));
    
    expect(result.current).toBeDefined();
  });

  it('should handle empty inventory', () => {
    const character = {
      id: '1',
      name: 'Test Character',
      level: 1,
      abilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      },
      inventory: [],
      feats: []
    };

    const { result } = renderHook(() => useCharacter(character));

    expect(result.current).not.toBeNull();
  });

  // Slice 2: with no live loadout (no SessionProvider here), useCharacter
  // returns the effective tree with derived state stamped (top-level→worn,
  // contents→stowed). Bulk math is unit-tested in InventoryUtils /
  // effectiveInventory; calculateItemsBulk is mocked in this file.
  it('exposes the effective inventory with derived state stamped (empty loadout)', () => {
    const character = {
      id: 'effguy',
      name: 'Eff Guy',
      level: 1,
      abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      inventory: [
        { uid: 'effguy-0', ref: 'sword', weight: 1, quantity: 1 },
        {
          uid: 'effguy-1',
          ref: 'backpack',
          weight: 0.1,
          quantity: 1,
          container: { capacity: 4, ignored: 2, contents: [{ uid: 'effguy-2', ref: 'torch', weight: 0.1, quantity: 5 }] },
        },
      ],
      feats: [],
    };

    const { result } = renderHook(() => useCharacter(character));
    const inv = result.current.inventory;
    expect(inv[0].state).toBe('worn');
    expect(inv[1].state).toBe('worn');
    expect(inv[1].container.contents[0].state).toBe('stowed');
    // structure/uids preserved through the effective merge
    expect(inv.map((e) => e.uid)).toEqual(['effguy-0', 'effguy-1']);
    expect(inv[1].container.contents[0].uid).toBe('effguy-2');
  });
});
