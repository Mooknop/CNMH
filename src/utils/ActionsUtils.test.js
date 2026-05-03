import {
  getStrikes,
  categorizeStrikesByType,
  convertWordToNumber,
  getActions,
  getReactions,
  getFreeActions,
  parseActionCount,
  getActionType,
  extractVariableActionCount,
} from './ActionsUtils';

// Mock CharacterUtils to avoid dependencies
jest.mock('./CharacterUtils', () => ({
  getAbilityModifier: (score) => Math.floor((score - 10) / 2),
  getAttackBonus: (abilityMod, proficiency, level) => {
    let bonus = abilityMod + proficiency * 2 + level;
    return bonus >= 0 ? `+${bonus}` : `${bonus}`;
  }
}));

describe('ActionsUtils', () => {
  describe('getStrikes', () => {
    it('should return unarmed strike when no strikes defined', () => {
      const character = {
        abilities: { strength: 10 },
        proficiencies: { weapons: { unarmed: { proficiency: 0 } } },
        level: 1
      };

      const result = getStrikes(character);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Unarmed Strike');
      expect(result[0].type).toBe('melee');
      expect(result[0].traits).toContain('Unarmed');
    });

    it('should calculate melee strike attack bonus correctly', () => {
      const character = {
        level: 1,
        abilities: { strength: 14, dexterity: 10 },
        proficiencies: { weapons: { simple: { proficiency: 1 } } },
        strikes: [
          {
            name: 'Longsword',
            type: 'melee',
            traits: [],
            damage: '1d8'
          }
        ]
      };

      const result = getStrikes(character);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Longsword');
      expect(result[0].attackMod).toBe('+5'); // +2 str mod, +2 trained, +1 level
    });

    it('should handle finesse weapons correctly', () => {
      const character = {
        level: 1,
        abilities: { strength: 10, dexterity: 14 },
        proficiencies: { weapons: { simple: { proficiency: 1 } } },
        strikes: [
          {
            name: 'Rapier',
            type: 'melee',
            traits: ['Finesse'],
            damage: '1d6'
          }
        ]
      };

      const result = getStrikes(character);
      
      expect(result).toHaveLength(1);
      // Should use DEX mod (2) not STR mod (0)
      expect(result[0].attackMod).toBe('+5'); // +2 dex mod, +2 trained, +1 level
    });

    it('should add ability modifier to damage for melee weapons', () => {
      const character = {
        level: 1,
        abilities: { strength: 14 },
        proficiencies: { weapons: { simple: { proficiency: 1 } } },
        strikes: [
          {
            name: 'Longsword',
            type: 'melee',
            traits: [],
            damage: '1d8'
          }
        ]
      };

      const result = getStrikes(character);
      
      expect(result[0].damage).toBe('1d8+2');
    });

    it('should extract strikes from feats', () => {
      const character = {
        level: 1,
        abilities: { strength: 10 },
        proficiencies: { weapons: { simple: { proficiency: 0 } } },
        feats: [
          {
            name: 'Power Attack',
            strikes: [
              {
                name: 'Power Attack',
                type: 'melee',
                traits: [],
                damage: '2d6'
              }
            ]
          }
        ]
      };

      const result = getStrikes(character);
      
      expect(result.some(s => s.name === 'Power Attack')).toBe(true);
      expect(result.some(s => s.source === 'Power Attack')).toBe(true);
    });

    it('should extract strikes from inventory weapons', () => {
      const character = {
        level: 1,
        abilities: { strength: 14, dexterity: 10 },
        proficiencies: { weapons: { simple: { proficiency: 1 } } },
        inventory: [
          {
            name: 'Greatsword',
            strikes: {
              type: 'melee',
              traits: [],
              damage: '2d12'
            }
          }
        ]
      };

      const result = getStrikes(character);
      
      expect(result.some(s => s.source === 'Greatsword')).toBe(true);
    });
  });

  describe('categorizeStrikesByType', () => {
    it('should categorize strikes by type', () => {
      const strikes = [
        { name: 'Sword', type: 'melee' },
        { name: 'Bow', type: 'ranged' },
        { name: 'Dagger', type: 'melee' }
      ];

      const result = categorizeStrikesByType(strikes);
      
      expect(result.melee).toHaveLength(2);
      expect(result.ranged).toHaveLength(1);
    });

    it('should handle strikes with no type specified', () => {
      const strikes = [
        { name: 'Strike1', type: 'melee' },
        { name: 'Strike2' }
      ];

      const result = categorizeStrikesByType(strikes);
      
      expect(result.melee).toHaveLength(1);
      expect(result.ranged).toHaveLength(0);
    });
  });

  describe('convertWordToNumber', () => {
    it('should convert word numbers to integers', () => {
      expect(convertWordToNumber('one')).toBe(1);
      expect(convertWordToNumber('two')).toBe(2);
      expect(convertWordToNumber('three')).toBe(3);
    });

    it('should convert numeric strings to integers', () => {
      expect(convertWordToNumber('1')).toBe(1);
      expect(convertWordToNumber('2')).toBe(2);
      expect(convertWordToNumber('3')).toBe(3);
    });

    it('should be case-insensitive', () => {
      expect(convertWordToNumber('ONE')).toBe(1);
      expect(convertWordToNumber('Two')).toBe(2);
    });

    it('should return 0 for unrecognized words', () => {
      expect(convertWordToNumber('four')).toBe(0);
      expect(convertWordToNumber('invalid')).toBe(0);
    });
  });

  describe('getActions', () => {
    it('should return empty array when no actions defined', () => {
      const character = {};
      const result = getActions(character);
      
      expect(Array.isArray(result)).toBe(true);
    });

    it('should extract actions from character', () => {
      const character = {
        actions: [
          { name: 'Strike', actionCount: 1 },
          { name: 'Spell', actionCount: 2 }
        ]
      };

      const result = getActions(character);
      
      expect(result.some(a => a.name === 'Strike')).toBe(true);
      expect(result.some(a => a.name === 'Spell')).toBe(true);
    });

    it('should extract actions from inventory items', () => {
      const character = {
        inventory: [
          {
            name: 'Wand',
            actions: [
              { name: 'Wand Action', actionCount: 1 }
            ]
          }
        ]
      };

      const result = getActions(character);
      
      expect(result.some(a => a.source === 'Wand')).toBe(true);
    });

    it('should extract actions from feats', () => {
      const character = {
        feats: [
          {
            name: 'Power Attack',
            actions: [
              { name: 'Power Attack Action', actionCount: 1 }
            ]
          }
        ]
      };

      const result = getActions(character);
      
      expect(result.some(a => a.source === 'Power Attack')).toBe(true);
    });
  });

  describe('getReactions', () => {
    it('should extract reactions from character', () => {
      const character = {
        reactions: [
          { name: 'Reaction 1' },
          { name: 'Reaction 2' }
        ]
      };

      const result = getReactions(character);
      
      expect(result).toHaveLength(2);
    });

    it('should extract reactions from feats and inventory', () => {
      const character = {
        reactions: [],
        feats: [
          {
            name: 'Feat1',
            reactions: [{ name: 'FeatReaction' }]
          }
        ],
        inventory: [
          {
            name: 'Item1',
            reactions: [{ name: 'ItemReaction' }]
          }
        ]
      };

      const result = getReactions(character);
      
      expect(result).toHaveLength(2);
      expect(result.some(r => r.source === 'Feat1')).toBe(true);
      expect(result.some(r => r.source === 'Item1')).toBe(true);
    });
  });

  describe('getFreeActions', () => {
    it('should extract free actions from character', () => {
      const character = {
        freeActions: [
          { name: 'Free Action 1' }
        ]
      };

      const result = getFreeActions(character);
      
      expect(result).toHaveLength(1);
    });

    it('should extract free actions from feats and inventory', () => {
      const character = {
        freeActions: [],
        feats: [
          {
            name: 'Feat1',
            freeActions: [{ name: 'FeatFreeAction' }]
          }
        ],
        inventory: [
          {
            name: 'Item1',
            freeActions: [{ name: 'ItemFreeAction' }]
          }
        ]
      };

      const result = getFreeActions(character);
      
      expect(result).toHaveLength(2);
    });
  });

  describe('parseActionCount', () => {
    it('should parse action count from text', () => {
      expect(parseActionCount('One Action')).toBe(1);
      expect(parseActionCount('Two Actions')).toBe(2);
      expect(parseActionCount('Three Actions')).toBe(3);
    });

    it('should parse numeric action counts', () => {
      expect(parseActionCount('1 Action')).toBe(1);
      expect(parseActionCount('2 Actions')).toBe(2);
    });

    it('should handle special action types', () => {
      expect(parseActionCount('Reaction')).toBe(-1);
      expect(parseActionCount('Free Action')).toBe(-2);
    });

    it('should return 0 for invalid input', () => {
      expect(parseActionCount(null)).toBe(0);
      expect(parseActionCount('')).toBe(0);
      expect(parseActionCount('Invalid')).toBe(0);
    });

    it('should be case-insensitive', () => {
      expect(parseActionCount('one action')).toBe(1);
      expect(parseActionCount('TWO ACTIONS')).toBe(2);
    });

    it('should handle variable action counts by returning maximum', () => {
      expect(parseActionCount('One to Three Actions')).toBe(3);
      expect(parseActionCount('One to Two Actions')).toBe(2);
    });
  });

  describe('getActionType', () => {
    it('should return "standard" for positive counts', () => {
      expect(getActionType(1)).toBe('standard');
      expect(getActionType(2)).toBe('standard');
      expect(getActionType(3)).toBe('standard');
    });

    it('should return "reaction" for -1', () => {
      expect(getActionType(-1)).toBe('reaction');
    });

    it('should return "free" for -2', () => {
      expect(getActionType(-2)).toBe('free');
    });

    it('should return "unknown" for other values', () => {
      expect(getActionType(0)).toBe('unknown');
      expect(getActionType(-3)).toBe('unknown');
    });
  });

  describe('extractVariableActionCount', () => {
    it('should extract variable action ranges', () => {
      const result = extractVariableActionCount('One to Three Actions');
      
      expect(result).not.toBeNull();
      expect(result.min).toBe(1);
      expect(result.max).toBe(3);
    });

    it('should return null for non-variable actions', () => {
      expect(extractVariableActionCount('One Action')).toBeNull();
      expect(extractVariableActionCount('Two Actions')).toBeNull();
    });

    it('should handle numeric word conversions', () => {
      const result = extractVariableActionCount('1 to 2 Actions');
      
      expect(result.min).toBe(1);
      expect(result.max).toBe(2);
    });

    it('should return null for invalid input', () => {
      expect(extractVariableActionCount(null)).toBeNull();
      expect(extractVariableActionCount('')).toBeNull();
      expect(extractVariableActionCount('Invalid text')).toBeNull();
    });
  });
});
