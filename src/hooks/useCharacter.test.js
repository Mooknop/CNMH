import { renderHook } from '@testing-library/react';
import { useCharacter } from './useCharacter';
import { getFreeActions } from '../utils/ActionsUtils';
import { resolveCharacterItems } from '../utils/contentUtils';
import { items, spells } from '../data';

// Mock all the utility modules
vi.mock('../utils/CharacterUtils', () => ({
  getAbilityModifier: (score) => Math.floor((score - 10) / 2),
  getSkillModifier: vi.fn((char, skill) => 5),
  getItemBonus: vi.fn(() => 0),
  SKILL_ABILITY_MAP: {
    acrobatics: 'dexterity',
    athletics: 'strength'
  },
  calculateClassDC: vi.fn((level) => 10 + level),
  calculateEnhancedBulkLimit: vi.fn((char) => 10),
  hasFeat: vi.fn(() => false),
  FEAT_NAMES: {
    FAMILIAR: 'Familiar',
    ANIMAL_COMPANION: 'Animal Companion'
  },
  getArmorProficiencyRank: vi.fn(() => 0),
  getArmorProficiencyBonus: vi.fn(() => 0),
}));

vi.mock('../utils/ActionsUtils', () => ({
  getStrikes: () => [],
  getActions: () => [],
  getReactions: () => [],
  getFreeActions: vi.fn(() => []),
}));

vi.mock('../utils/SpellUtils', () => ({
  calculateSpellStats: () => ({ spellAttackMod: 5, spellDC: 15 }),
  findScrollItems: () => [],
  extractScrollSpells: () => [],
  findWandItems: () => [],
  extractWandSpells: () => [],
  extractInnateSpells: () => [],
}));

vi.mock('../utils/InventoryUtils', () => ({
  calculateItemsBulk: () => 5,
  formatBulk: (bulk) => bulk.toString(),
  ARMOR_CATEGORIES: ['unarmored', 'light', 'medium', 'heavy'],
  isArmor: (it) => !!it && !!it.armor,
  normalizeArmor: (a) => (a && typeof a === 'object' ? a : null),
  baseSpellItemArt: () => null,
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

  // #1131: hasFamiliar/hasAnimalCompanion derive from the authored data block,
  // not a feat lookup (hasFeat is mocked false here — a feat-gated derivation
  // would return false and split the surfaces that read the raw field).
  describe('minion feature flags', () => {
    it('flags familiar/companion from the data block and passes it through', () => {
      const character = {
        id: 'minion-owner',
        name: 'Minion Owner',
        level: 5,
        familiar: { name: 'Squox' },
        animalCompanion: { name: 'Wolf' },
      };
      const { result } = renderHook(() => useCharacter(character));
      expect(result.current.flags.hasFamiliar).toBe(true);
      expect(result.current.flags.hasAnimalCompanion).toBe(true);
      expect(result.current.familiar).toEqual({ name: 'Squox' });
      expect(result.current.animalCompanion).toEqual({ name: 'Wolf' });
    });

    it('stays false with no data block', () => {
      const { result } = renderHook(() => useCharacter({ id: 'bare', name: 'Bare', level: 1 }));
      expect(result.current.flags.hasFamiliar).toBe(false);
      expect(result.current.flags.hasAnimalCompanion).toBe(false);
      expect(result.current.familiar).toBeNull();
      expect(result.current.animalCompanion).toBeNull();
    });
  });

  // Etch-time accessory-rune config (#1055 S4): the per-uid overlay is baked onto
  // the inscribed entry so the derived free action carries the depicted dragon.
  describe('accessory-rune etch config injection', () => {
    const runedCape = {
      id: 'dragoncaster',
      name: 'Dragoncaster',
      maxHp: 10,
      inventory: [
        { uid: 'cape1', name: 'Dueling Cape', runes: { accessory: { id: 'dragons-breath-3', name: 'DB' } } },
      ],
    };

    afterEach(() => {
      window.localStorage.clear();
      getFreeActions.mockClear();
    });

    it('bakes the chosen dragon type onto the inscribed entry passed to getFreeActions', () => {
      window.localStorage.setItem('cnmh_runeconfig_dragoncaster', JSON.stringify({ cape1: { dragonType: 'fire' } }));
      renderHook(() => useCharacter(runedCape));
      const passed = getFreeActions.mock.calls.at(-1)[0];
      const entry = passed.inventory.find((e) => e.uid === 'cape1');
      expect(entry.runes.accessoryConfig).toEqual({ dragonType: 'fire' });
    });

    it('leaves the entry untouched when no config overlay is set', () => {
      renderHook(() => useCharacter(runedCape));
      const passed = getFreeActions.mock.calls.at(-1)[0];
      const entry = passed.inventory.find((e) => e.uid === 'cape1');
      expect(entry.runes.accessoryConfig).toBeUndefined();
    });
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

  it('derives armorClass from worn armor, scalar-fallback when un-backfilled (AC3)', () => {
    const base = {
      id: '1', name: 'A', level: 1, ac: 18,
      abilities: { strength: 10, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      proficiencies: { armor: { light: { proficiency: 1 } } },
      feats: [],
    };

    // Worn light armor with the AC1 schema → derived (10 + prof + min(dex,cap) + acBonus).
    // getArmorProficiencyBonus is mocked to 0, so: 10 + 0 + min(2,3) + 2 = 14.
    const armored = { ...base, inventory: [{ uid: 'a', name: 'Leather', armor: { category: 'light', acBonus: 2, dexCap: 3 } }] };
    const { result: r1 } = renderHook(() => useCharacter(armored));
    expect(r1.current.armorClass.derived).toBe(true);
    expect(r1.current.armorClass.value).toBe(14);
    expect(r1.current.armorClass.category).toBe('light');

    // Worn armor missing the schema → fall back to the synced scalar.
    const legacy = { ...base, inventory: [{ uid: 'b', name: 'Old Mail', armor: { group: 'chain' } }] };
    const { result: r2 } = renderHook(() => useCharacter(legacy));
    expect(r2.current.armorClass.derived).toBe(false);
    expect(r2.current.armorClass.value).toBe(18);
    expect(r2.current.armorClass.source).toBe('scalar');
  });

  it('derives unarmored AC (10 + Dex + unarmored proficiency) when armorless but trained (AC4)', () => {
    // No armor worn, but the character has unarmored proficiency data, so the
    // app derives it accurately instead of falling back. getArmorProficiencyBonus
    // is mocked to 0, so: 10 + 0 + Dex(2) = 12.
    const unarmored = {
      id: '1', name: 'A', level: 4, ac: 99,
      abilities: { strength: 10, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      proficiencies: { armor: { unarmored: { proficiency: 2 } } },
      inventory: [{ uid: 't', name: 'Torch' }],
      feats: [],
    };
    const { result } = renderHook(() => useCharacter(unarmored));
    expect(result.current.armorClass.derived).toBe(true);
    expect(result.current.armorClass.source).toBe('unarmored');
    expect(result.current.armorClass.value).toBe(12);
  });

  it('keeps the authored scalar when the character has no armor-proficiency data (AC4)', () => {
    // A character with no proficiencies.armor block can't be derived accurately
    // (no proficiency term), so the authored ac scalar wins. Guards synthetic /
    // legacy fixtures from being re-derived downward.
    const noData = {
      id: '1', name: 'A', level: 5, ac: 22,
      abilities: { strength: 18, dexterity: 14, constitution: 16, intelligence: 10, wisdom: 12, charisma: 8 },
      inventory: [{ uid: 't', name: 'Torch' }],
      feats: [],
    };
    const { result } = renderHook(() => useCharacter(noData));
    expect(result.current.armorClass.derived).toBe(false);
    expect(result.current.armorClass.value).toBe(22);
    expect(result.current.armorClass.source).toBe('scalar');
  });

  it('exposes armorProficiencies for every armor category (AC2)', () => {
    const character = {
      id: '1',
      name: 'Armored',
      level: 1,
      abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      inventory: [],
      feats: [],
    };
    const { result } = renderHook(() => useCharacter(character));
    expect(Object.keys(result.current.armorProficiencies)).toEqual([
      'unarmored', 'light', 'medium', 'heavy',
    ]);
    expect(result.current.armorProficiencies.light).toEqual({ rank: 0, bonus: 0 });
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

  it('focusSpells is the bloodline spell list, never the focus-point pool', () => {
    // Sorcerer shape: spellcasting.focus is a { max, current } pool, while the
    // actual bloodline focus spells live at spellcasting.bloodline.focus_spells.
    // focusSpells must resolve to that array — a non-array pool object leaking
    // through crashed the encounter tab's reaction assembly (.filter).
    const character = {
      id: 'jade',
      name: 'Jade',
      level: 5,
      abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 18 },
      inventory: [],
      feats: [],
      spellcasting: {
        focus: { max: 1, current: 1 },
        bloodline: { focus_spells: [{ spellRef: 'ancestral-memories', bloodline: true }] },
      },
    };

    const { result } = renderHook(() => useCharacter(character));

    expect(Array.isArray(result.current.focusSpells)).toBe(true);
    expect(result.current.focusSpells).toEqual([{ spellRef: 'ancestral-memories', bloodline: true }]);
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

    // Should return equivalent data when character hasn't changed.
    // toStrictEqual rather than toBe because the combined memo object includes
    // synced-state setters whose references differ across the mock's renders.
    expect(result.current).toStrictEqual(firstResult);
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

  // The staff lives on a resolved inventory item's `.staff` block; it is
  // castable only while that entry is held. The util mocks above don't touch
  // staff — useCharacter derives it directly.
  describe('staff hand gating (resolved catalog item)', () => {
    // Post-resolution shape: the staff block rides on the inventory entry,
    // linked by uid (no name matching).
    const makeChar = (id) => ({
      id,
      name: 'Caster',
      level: 4,
      abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      feats: [],
      inventory: [
        {
          uid: `${id}-0`,
          id: 'xanderghuls-flawless-hammer',
          name: "Xanderghul's Flawless Hammer",
          weight: 2,
          quantity: 1,
          staff: { name: "Xanderghul's Flawless Hammer", spells: [{ name: 'Figment', level: 0 }] },
          artifact: { tiers: [{ level: 1, grants: ['staff'] }] },
        },
      ],
    });

    afterEach(() => localStorage.clear());

    it('marks staff spells inactive when the staff is merely worn (empty loadout)', () => {
      const { result } = renderHook(() => useCharacter(makeChar('staffworn')));
      expect(result.current.flags.hasStaff).toBe(true);
      expect(result.current.flags.staffActive).toBe(false);
      expect(result.current.staffSpells[0].active).toBe(false);
    });

    it('marks staff spells active when the matching uid entry is held', () => {
      localStorage.setItem(
        'cnmh_loadout_staffheld',
        JSON.stringify({ 'staffheld-0': { state: 'held1', hand: 1 } })
      );
      const { result } = renderHook(() => useCharacter(makeChar('staffheld')));
      expect(result.current.flags.staffActive).toBe(true);
      expect(result.current.staffSpells[0].active).toBe(true);
    });

  });

  // Integration: the Hammer artifact's staff tier unlocks at level 4. Resolve
  // the real bundled catalog through resolveCharacterItems, then feed the hook.
  describe('artifact level gating (Hammer staff)', () => {
    const jadeRefSheet = (level) => ({
      id: 'jadeish',
      name: 'Jade-ish',
      level,
      abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      feats: [],
      // Arcane tradition: the Hammer's 8 staff spells are all arcane/occult, so
      // this caster sees them all once the artifact tier unlocks — isolating
      // this suite to LEVEL gating, not tradition gating (#649).
      spellcasting: { tradition: 'Arcane' },
      inventory: [{ uid: 'jadeish-0', ref: 'xanderghuls-flawless-hammer', quantity: 1 }],
    });

    it('hides the staff below the unlock level', () => {
      const resolved = resolveCharacterItems(jadeRefSheet(1), items, spells);
      const { result } = renderHook(() => useCharacter(resolved));
      expect(result.current.flags.hasStaff).toBe(false);
      expect(result.current.staffSpells).toEqual([]);
    });

    it('exposes the full 8-spell staff at level 4', () => {
      const resolved = resolveCharacterItems(jadeRefSheet(4), items, spells);
      const { result } = renderHook(() => useCharacter(resolved));
      expect(result.current.flags.hasStaff).toBe(true);
      expect(result.current.staffSpells).toHaveLength(8);
      expect(result.current.staffSpells.every((s) => s.name)).toBe(true);
    });
  });
});
