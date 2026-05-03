import {
  getAbilityModifier,
  formatModifier,
  getProficiencyLabel,
  hasFeat,
  getProficiencyBonus,
  getCharacterColor,
  CHARACTER_COLORS,
  FEAT_NAMES,
  SKILL_ABILITY_MAP,
  getItemBonus,
  getSkillModifier,
  getAttackBonus,
  calculateBulkLimit,
  calculateClassDC,
  calculateEnhancedBulkLimit,
  calculateTotalContainerIgnoredBulk,
} from './CharacterUtils';

describe('CharacterUtils', () => {
  describe('getAbilityModifier', () => {
    it('should calculate modifier correctly for various ability scores', () => {
      expect(getAbilityModifier(10)).toBe(0);
      expect(getAbilityModifier(11)).toBe(0);
      expect(getAbilityModifier(12)).toBe(1);
      expect(getAbilityModifier(14)).toBe(2);
      expect(getAbilityModifier(18)).toBe(4);
      expect(getAbilityModifier(8)).toBe(-1);
      expect(getAbilityModifier(6)).toBe(-2);
    });

    it('should default to 10 for undefined ability scores', () => {
      expect(getAbilityModifier(undefined)).toBe(0);
      expect(getAbilityModifier(null)).toBe(0);
    });

    it('should handle extreme values', () => {
      expect(getAbilityModifier(30)).toBe(10);
      expect(getAbilityModifier(1)).toBe(-5);
    });
  });

  describe('formatModifier', () => {
    it('should format positive modifiers with + sign', () => {
      expect(formatModifier(0)).toBe('+0');
      expect(formatModifier(1)).toBe('+1');
      expect(formatModifier(5)).toBe('+5');
    });

    it('should format negative modifiers with - sign', () => {
      expect(formatModifier(-1)).toBe('-1');
      expect(formatModifier(-5)).toBe('-5');
    });
  });

  describe('getProficiencyLabel', () => {
    it('should return correct proficiency labels', () => {
      expect(getProficiencyLabel(0)).toBe('Untrained');
      expect(getProficiencyLabel(1)).toBe('Trained');
      expect(getProficiencyLabel(2)).toBe('Expert');
      expect(getProficiencyLabel(3)).toBe('Master');
      expect(getProficiencyLabel(4)).toBe('Legendary');
      expect(getProficiencyLabel(5)).toBe('Untrained'); // undefined value defaults to Untrained
    });
  });

  describe('hasFeat', () => {
    it('should return true if character has the feat', () => {
      const character = {
        feats: [
          { name: 'Power Attack' },
          { name: 'Familiar' },
        ]
      };
      expect(hasFeat(character, 'Power Attack')).toBe(true);
      expect(hasFeat(character, 'Familiar')).toBe(true);
    });

    it('should return false if character does not have the feat', () => {
      const character = {
        feats: [
          { name: 'Power Attack' }
        ]
      };
      expect(hasFeat(character, 'Weapon Focus')).toBe(false);
    });

    it('should be case-insensitive', () => {
      const character = {
        feats: [
          { name: 'Power Attack' }
        ]
      };
      expect(hasFeat(character, 'power attack')).toBe(true);
      expect(hasFeat(character, 'POWER ATTACK')).toBe(true);
    });

    it('should return false if character has no feats or is invalid', () => {
      expect(hasFeat(null, 'Feat')).toBe(false);
      expect(hasFeat(undefined, 'Feat')).toBe(false);
      expect(hasFeat({}, 'Feat')).toBe(false);
      expect(hasFeat({ feats: [] }, 'Feat')).toBe(false);
    });
  });

  describe('getProficiencyBonus', () => {
    it('should calculate proficiency bonus for trained characters', () => {
      expect(getProficiencyBonus(1, 1)).toBe(3); // +2 for trained, +1 for level
      expect(getProficiencyBonus(2, 5)).toBe(9); // +4 for expert, +5 for level
      expect(getProficiencyBonus(3, 10)).toBe(16); // +6 for master, +10 for level
      expect(getProficiencyBonus(4, 20)).toBe(28); // +8 for legendary, +20 for level
    });

    it('should return 0 for untrained characters without Untrained Improvisation', () => {
      expect(getProficiencyBonus(0, 5)).toBe(0);
    });

    it('should apply Untrained Improvisation feat if present', () => {
      const character = {
        feats: [
          { name: 'Untrained Improvisation' }
        ],
        level: 1
      };
      expect(getProficiencyBonus(0, 1, character)).toBe(0); // Below level 7
      
      const character2 = {
        feats: [
          { name: 'Untrained Improvisation' }
        ],
        level: 7
      };
      expect(getProficiencyBonus(0, 7, character2)).toBe(7); // Level 7+
    });
  });

  describe('getCharacterColor', () => {
    it('should return correct colors from the palette', () => {
      expect(getCharacterColor(0)).toBe(CHARACTER_COLORS[0]);
      expect(getCharacterColor(1)).toBe(CHARACTER_COLORS[1]);
      expect(getCharacterColor(2)).toBe(CHARACTER_COLORS[2]);
    });

    it('should cycle through colors for indices beyond palette size', () => {
      const paletteSize = CHARACTER_COLORS.length;
      expect(getCharacterColor(paletteSize)).toBe(CHARACTER_COLORS[0]);
      expect(getCharacterColor(paletteSize + 1)).toBe(CHARACTER_COLORS[1]);
    });
  });

  describe('Constants', () => {
    it('should have CHARACTER_COLORS array', () => {
      expect(Array.isArray(CHARACTER_COLORS)).toBe(true);
      expect(CHARACTER_COLORS.length).toBeGreaterThan(0);
      CHARACTER_COLORS.forEach(color => {
        expect(typeof color).toBe('string');
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });

    it('should have FEAT_NAMES object with expected properties', () => {
      expect(FEAT_NAMES.FAMILIAR).toBe('Familiar');
      expect(FEAT_NAMES.ANIMAL_COMPANION).toBe('Animal Companion');
      expect(FEAT_NAMES.UNTRAINED_IMPROVISATION).toBe('Untrained Improvisation');
    });

    it('should have SKILL_ABILITY_MAP with all skills', () => {
      expect(SKILL_ABILITY_MAP.acrobatics).toBe('dexterity');
      expect(SKILL_ABILITY_MAP.arcana).toBe('intelligence');
      expect(SKILL_ABILITY_MAP.athletics).toBe('strength');
      expect(Object.keys(SKILL_ABILITY_MAP).length).toBe(17);
    });
  });

  describe('getItemBonus', () => {
    it('returns 0 when character is null', () => {
      expect(getItemBonus(null, 'acrobatics')).toBe(0);
    });

    it('returns 0 when character has no inventory', () => {
      expect(getItemBonus({}, 'acrobatics')).toBe(0);
    });

    it('returns 0 when no items have a matching bonus', () => {
      const char = { inventory: [{ name: 'Sword' }] };
      expect(getItemBonus(char, 'acrobatics')).toBe(0);
    });

    it('returns the bonus value when an item grants a skill bonus', () => {
      const char = {
        inventory: [
          { name: 'Cat Burglar Boots', bonus: ['acrobatics', 1] },
        ],
      };
      expect(getItemBonus(char, 'acrobatics')).toBe(1);
    });

    it('returns the highest bonus when multiple items apply', () => {
      const char = {
        inventory: [
          { name: 'Basic Boots', bonus: ['acrobatics', 1] },
          { name: 'Fine Boots', bonus: ['acrobatics', 2] },
        ],
      };
      expect(getItemBonus(char, 'acrobatics')).toBe(2);
    });
  });

  describe('getSkillModifier', () => {
    it('returns 0 for null character', () => {
      expect(getSkillModifier(null, 'acrobatics')).toBe(0);
    });

    it('calculates skill modifier correctly', () => {
      const char = {
        level: 1,
        abilities: { dexterity: 14 }, // dex mod = +2
        skills: { acrobatics: { proficiency: 1 } }, // trained = +3 at level 1
        inventory: [],
      };
      // dex mod (2) + prof bonus (3) + item bonus (0) = 5
      expect(getSkillModifier(char, 'acrobatics')).toBe(5);
    });

    it('defaults to untrained if skill not in character data', () => {
      const char = {
        level: 1,
        abilities: { dexterity: 10 },
        skills: {},
        inventory: [],
      };
      expect(getSkillModifier(char, 'acrobatics')).toBe(0);
    });
  });

  describe('getAttackBonus', () => {
    it('formats attack bonus from components', () => {
      expect(getAttackBonus(3, 1, 1)).toBe('+6'); // +3 ability + trained(2+1)
    });

    it('returns 0 for untrained with no ability mod', () => {
      expect(getAttackBonus(0, 0, 1)).toBe('+0');
    });

    it('handles negative ability modifiers', () => {
      expect(getAttackBonus(-1, 1, 1)).toBe('+2'); // -1 + 3 = 2
    });
  });

  describe('calculateBulkLimit', () => {
    it('returns zeros for null/invalid character', () => {
      expect(calculateBulkLimit(null)).toEqual({ bulkLimit: 0, encumberedThreshold: 0 });
      expect(calculateBulkLimit({})).toEqual({ bulkLimit: 0, encumberedThreshold: 0 });
    });

    it('calculates correct bulk limit based on strength', () => {
      const char = { abilities: { strength: 14 }, feats: [] }; // str mod = +2, limit = 12
      const result = calculateBulkLimit(char);
      expect(result.bulkLimit).toBe(12);
      expect(result.encumberedThreshold).toBe(7);
    });

    it('adds Hefty Hauler bonus when feat is present', () => {
      const char = {
        abilities: { strength: 10 }, // str mod = 0, limit = 10
        feats: [{ name: 'Hefty Hauler' }],
      };
      const result = calculateBulkLimit(char);
      expect(result.bulkLimit).toBe(12); // 10 + 2
      expect(result.encumberedThreshold).toBe(7); // 5 + 2
    });
  });

  describe('calculateClassDC', () => {
    it('calculates class DC correctly', () => {
      const char = {
        level: 1,
        abilities: { strength: 16 }, // str mod = +3
        keyAbility: 'strength',
        proficiencies: { class: 1 }, // trained = +3
      };
      // 10 + 3 (ability) + 3 (trained prof) = 16
      expect(calculateClassDC(char)).toBe(16);
    });
  });

  describe('calculateTotalContainerIgnoredBulk', () => {
    it('returns 0 for null/empty inventory', () => {
      expect(calculateTotalContainerIgnoredBulk(null)).toBe(0);
      expect(calculateTotalContainerIgnoredBulk([])).toBe(0);
    });

    it('sums ignored bulk from containers', () => {
      const inventory = [
        { name: 'Backpack', container: { ignored: 2 }, quantity: 1 },
        { name: 'Satchel', container: { ignored: 1 }, quantity: 2 },
      ];
      expect(calculateTotalContainerIgnoredBulk(inventory)).toBe(4); // 2 + 1*2
    });

    it('ignores items without container property', () => {
      const inventory = [{ name: 'Sword' }];
      expect(calculateTotalContainerIgnoredBulk(inventory)).toBe(0);
    });
  });

  describe('calculateEnhancedBulkLimit', () => {
    it('returns zeros for null/invalid character', () => {
      const result = calculateEnhancedBulkLimit(null);
      expect(result.bulkLimit).toBe(0);
    });

    it('calculates enhanced bulk limit with containers', () => {
      const char = {
        abilities: { strength: 10 },
        feats: [],
        inventory: [
          { container: { ignored: 2 }, quantity: 1 },
        ],
      };
      const result = calculateEnhancedBulkLimit(char);
      expect(result.bulkLimit).toBe(12); // 10 base + 2 container
      expect(result.containerBonus).toBe(2);
    });
  });
});
