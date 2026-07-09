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
  getVariableActionRange,
  variantFor,
  renderActionIcons,
  deriveSpellshapeChain,
} from './ActionsUtils';

// Mock CharacterUtils to avoid dependencies
vi.mock('./CharacterUtils', () => ({
  getAbilityModifier: (score) => Math.floor((score - 10) / 2),
  getAttackBonusValue: (abilityMod, proficiency, level) => abilityMod + proficiency * 2 + level,
  getAttackBonus: (abilityMod, proficiency, level) => {
    const bonus = abilityMod + proficiency * 2 + level;
    return bonus >= 0 ? `+${bonus}` : `${bonus}`;
  },
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
      expect(result[0].attackMod).toBe(5); // +2 str mod, +2 trained, +1 level
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
      expect(result[0].attackMod).toBe(5); // +2 dex mod, +2 trained, +1 level
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

    it('derives a spell-chain on an invested-item Spellshape action (#1001 S0)', () => {
      const character = {
        inventory: [
          {
            name: 'Scepter of Greater Distances',
            state: 'held1',
            actions: [
              {
                name: 'Reach Spell',
                actionCount: 1,
                traits: ['Manipulate', 'Spellshape'],
                description: 'Increase the range of the next spell by 30 feet.',
              },
            ],
          },
        ],
      };

      const reach = getActions(character).find((a) => a.name === 'Reach Spell');
      expect(reach.source).toBe('Scepter of Greater Distances');
      expect(reach.active).toBe(true); // held → item abilities active
      expect(reach.chain).toEqual({
        into: 'spell',
        modifier: 'Increase the range of the next spell by 30 feet.',
      });
    });

    it('does not add a chain to a non-Spellshape item action', () => {
      const character = {
        inventory: [
          {
            name: 'Some Wand',
            state: 'held1',
            actions: [{ name: 'Zap', actionCount: 1, traits: ['Manipulate'] }],
          },
        ],
      };
      const zap = getActions(character).find((a) => a.name === 'Zap');
      expect(zap.chain).toBeUndefined();
    });
  });

  describe('deriveSpellshapeChain', () => {
    it('attaches a spell chain to a Spellshape-trait action', () => {
      const action = { name: 'Sicken Spell', traits: ['Manipulate', 'Spellshape'], description: 'Next basic-Fort spell sickens on a failed save.' };
      expect(deriveSpellshapeChain(action)).toEqual({
        ...action,
        chain: { into: 'spell', modifier: 'Next basic-Fort spell sickens on a failed save.' },
      });
    });

    it('matches the Spellshape trait case-insensitively', () => {
      const action = { name: 'x', traits: ['spellshape'] };
      expect(deriveSpellshapeChain(action).chain).toEqual({ into: 'spell', modifier: null });
    });

    it('leaves an authored chain untouched (so filters/transforms can be authored)', () => {
      const action = {
        name: 'Reach Spell',
        traits: ['Spellshape'],
        chain: { into: 'spell', spellFilter: 'has-range', modifier: 'custom' },
      };
      expect(deriveSpellshapeChain(action)).toBe(action);
    });

    it('ignores non-Spellshape actions and nullish input', () => {
      const plain = { name: 'Strike', traits: ['Attack'] };
      expect(deriveSpellshapeChain(plain)).toBe(plain);
      expect(deriveSpellshapeChain(null)).toBeNull();
      expect(deriveSpellshapeChain(undefined)).toBeUndefined();
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

    // #1055 S5 — an inscribed accessory rune's reaction (Soft-Landing) surfaces.
    it('surfaces an accessory-rune reaction, sourced as "Item (Rune)"', () => {
      const boots = {
        name: 'Boots',
        runes: { accessory: { id: 'soft-landing', name: 'Soft-Landing', reactions: [{ name: 'Soft Landing', triggerType: 'fall' }] } },
      };
      const result = getReactions({ inventory: [boots] });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ name: 'Soft Landing', triggerType: 'fall', source: 'Boots (Soft-Landing)', active: true });
    });

    it('does not surface a still-string accessory rune ref', () => {
      const result = getReactions({ inventory: [{ name: 'Boots', runes: { accessory: 'soft-landing' } }] });
      expect(result).toHaveLength(0);
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

  // ── Accessory-rune free actions (#1055 S4 — Dragon's Breath) ──
  describe('getFreeActions — accessory-rune free actions', () => {
    const dbFreeAction = {
      name: "Dragon's Breath",
      traits: ['Envision', 'Spellshape'],
      chain: { into: 'spell', spellFilter: 'dragon-breath-area', transform: { widenArea: true }, maxRank: 3 },
    };
    const cape = (extra = {}) => ({
      name: 'Dueling Cape',
      runes: { accessory: { id: 'dragons-breath-3', name: "Dragon's Breath (3rd-Rank Spell)", freeActions: [dbFreeAction] }, ...extra.runes },
      ...extra,
    });

    it('surfaces the inscribed accessory rune free action, sourced as "Item (Rune)"', () => {
      const fa = getFreeActions({ inventory: [cape()] });
      expect(fa).toHaveLength(1);
      expect(fa[0].name).toBe("Dragon's Breath");
      expect(fa[0].source).toBe("Dueling Cape (Dragon's Breath (3rd-Rank Spell))");
      expect(fa[0].active).toBe(true);
    });

    it('injects the etched dragon type into the chain from accessoryConfig', () => {
      const item = cape({ runes: { accessory: { id: 'dragons-breath-3', name: 'DB', freeActions: [dbFreeAction] }, accessoryConfig: { dragonType: 'fire' } } });
      const fa = getFreeActions({ inventory: [item] });
      expect(fa[0].chain).toMatchObject({ spellFilter: 'dragon-breath-area', dragonType: 'fire', maxRank: 3 });
    });

    it('leaves the chain untouched when no dragon type is configured', () => {
      const fa = getFreeActions({ inventory: [cape()] });
      expect(fa[0].chain.dragonType).toBeUndefined();
    });

    it('ignores a still-string (unresolved) accessory rune ref', () => {
      const fa = getFreeActions({ inventory: [{ name: 'Cape', runes: { accessory: 'dragons-breath-3' } }] });
      expect(fa).toHaveLength(0);
    });

    it('marks the free action inactive when the host is stowed', () => {
      const fa = getFreeActions({ inventory: [cape({ state: 'stowed' })] });
      expect(fa[0].active).toBe(false);
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

    it('should return null when min <= 0 (unrecognized word)', () => {
      expect(extractVariableActionCount('four to five actions')).toBeNull();
    });
  });

  describe('getVariableActionRange', () => {
    it('reads a variableActionCount object (strikes, GM-authored)', () => {
      expect(getVariableActionRange({ variableActionCount: { min: 1, max: 2 } }))
        .toEqual({ min: 1, max: 2 });
    });

    it('parses an actions string range (Force Barrage)', () => {
      expect(getVariableActionRange({ actions: 'One to Three Actions' }))
        .toEqual({ min: 1, max: 3 });
    });

    it('parses an actionCount string range without the word "action" (Elemental Blast)', () => {
      expect(getVariableActionRange({ actionCount: 'One to Two' }))
        .toEqual({ min: 1, max: 2 });
    });

    it('prefers variableActionCount over the text encodings', () => {
      expect(getVariableActionRange({
        variableActionCount: { min: 2, max: 3 },
        actions: 'One to Three Actions',
      })).toEqual({ min: 2, max: 3 });
    });

    it('returns null for fixed costs, reactions, and bad input', () => {
      expect(getVariableActionRange({ actions: 'Two Actions' })).toBeNull();
      expect(getVariableActionRange({ actions: 'Reaction' })).toBeNull();
      expect(getVariableActionRange({ actionCount: 2 })).toBeNull();
      expect(getVariableActionRange({ variableActionCount: { min: 0, max: 2 } })).toBeNull();
      expect(getVariableActionRange(null)).toBeNull();
      expect(getVariableActionRange({})).toBeNull();
    });
  });

  describe('variantFor', () => {
    const ability = {
      variants: [
        { actions: 1, note: '1 shard' },
        { actions: 3, note: '3 shards', dcDelta: -10 },
      ],
    };

    it('finds the variant for a chosen count', () => {
      expect(variantFor(ability, 3)).toEqual({ actions: 3, note: '3 shards', dcDelta: -10 });
    });

    it('returns null for counts without a variant or missing variants', () => {
      expect(variantFor(ability, 2)).toBeNull();
      expect(variantFor({}, 1)).toBeNull();
      expect(variantFor(null, 1)).toBeNull();
    });
  });

  describe('renderActionIcons', () => {
    it('should return null when actionText is null', () => {
      expect(renderActionIcons(null, '#fff')).toBeNull();
    });

    it('should return null when actionText is undefined', () => {
      expect(renderActionIcons(undefined, '#fff')).toBeNull();
    });

    it('should return variable type for variable action text', () => {
      const result = renderActionIcons('One to Two Actions', '#fff');
      expect(result.type).toBe('variable');
      expect(result.min).toBe(1);
      expect(result.max).toBe(2);
    });

    it('should return reaction type for reaction text', () => {
      const result = renderActionIcons('Reaction', '#fff');
      expect(result.type).toBe('reaction');
      expect(result.icon).toBe('⟳');
    });

    it('should return free type for free action text', () => {
      const result = renderActionIcons('Free Action', '#fff');
      expect(result.type).toBe('free');
      expect(result.icon).toBe('⟡');
    });

    it('should return standard type for single action text', () => {
      const result = renderActionIcons('One Action', '#fff');
      expect(result.type).toBe('standard');
      expect(result.count).toBe(1);
    });

    it('should return standard type for two actions text', () => {
      const result = renderActionIcons('Two Actions', '#fff');
      expect(result.type).toBe('standard');
      expect(result.count).toBe(2);
    });

    it('should return text type for unrecognized text', () => {
      const result = renderActionIcons('Continuous', '#fff');
      expect(result.type).toBe('text');
      expect(result.text).toBe('Continuous');
    });
  });

  describe('getStrikes — additional branch coverage', () => {
    const baseChar = {
      level: 1,
      abilities: { strength: 10, dexterity: 10 },
      proficiencies: { weapons: { simple: { proficiency: 1 } } },
    };

    it('handles character.strikes as empty array (no predefined strikes)', () => {
      const char = { ...baseChar, strikes: [] };
      const result = getStrikes(char);
      // Falls through to unarmed
      expect(result[0].name).toBe('Unarmed Strike');
    });

    it('handles ranged (non-finesse, non-melee) weapon — uses dexterity', () => {
      const char = {
        ...baseChar,
        abilities: { strength: 10, dexterity: 14 },
        strikes: [{ name: 'Shortbow', type: 'ranged', traits: [], damage: '1d6' }],
      };
      const result = getStrikes(char);
      // DEX mod = +2, proficiency 1 → +2, level 1 → total = +5
      expect(result[0].attackMod).toBe(5);
    });

    it('uses explicit proficiency when strike.proficiency matches weapons entry', () => {
      const char = {
        ...baseChar,
        proficiencies: { weapons: { martial: { proficiency: 2 } } },
        strikes: [{ name: 'Longsword', type: 'melee', traits: [], damage: '1d8', proficiency: 'martial' }],
      };
      const result = getStrikes(char);
      // proficiency = 2 → +4, STR 10 → 0, level 1 → +5
      expect(result[0].attackMod).toBe(5);
    });

    it('uses unarmed proficiency when Unarmed trait present', () => {
      const char = {
        ...baseChar,
        proficiencies: { weapons: { unarmed: { proficiency: 2 }, simple: { proficiency: 1 } } },
        strikes: [{ name: 'Fist', type: 'melee', traits: ['Unarmed'], damage: '1d4' }],
      };
      const result = getStrikes(char);
      // unarmed proficiency = 2 → +4, STR 10 → 0, level 1 → +5
      expect(result[0].attackMod).toBe(5);
    });

    it('does NOT append damage modifier when strMod is 0 for melee', () => {
      const char = {
        ...baseChar,
        abilities: { strength: 10 },
        strikes: [{ name: 'Dagger', type: 'melee', traits: [], damage: '1d4' }],
      };
      const result = getStrikes(char);
      expect(result[0].damage).toBe('1d4');
    });

    it('appends negative damage modifier when strMod < 0 for melee', () => {
      const char = {
        ...baseChar,
        abilities: { strength: 8 },
        strikes: [{ name: 'Dagger', type: 'melee', traits: [], damage: '1d4' }],
      };
      const result = getStrikes(char);
      expect(result[0].damage).toBe('1d4-1');
    });

    it('does not append modifier when damage already contains +', () => {
      const char = {
        ...baseChar,
        abilities: { strength: 14 },
        strikes: [{ name: 'Sword', type: 'melee', traits: [], damage: '1d8+3' }],
      };
      const result = getStrikes(char);
      expect(result[0].damage).toBe('1d8+3');
    });

    it('handles feats with no strikes (filtered out)', () => {
      const char = {
        ...baseChar,
        feats: [{ name: 'Power Attack', actions: [{ name: 'Power Attack' }] }],
      };
      const result = getStrikes(char);
      expect(result[0].name).toBe('Unarmed Strike');
    });

    it('feat strike with Kineticist trait uses CON modifier', () => {
      const char = {
        ...baseChar,
        abilities: { strength: 10, dexterity: 10, constitution: 16 },
        feats: [{
          name: 'Kinetic Blast',
          strikes: [{ name: 'Metal Blast Test', type: 'ranged', traits: ['Kineticist'], damage: '1d8' }],
        }],
      };
      const result = getStrikes(char);
      // CON 16 → mod 3, simple proficiency 1 (from baseChar), level 1 → 3 + (1*2+1) = 3+3 = +6
      expect(result.find(s => s.source === 'Kinetic Blast').attackMod).toBe(6);
    });

    it('feat strike with Thrown trait appends STR to damage', () => {
      const char = {
        ...baseChar,
        abilities: { strength: 14, dexterity: 10 },
        feats: [{
          name: 'Javelin Throw',
          strikes: [{ name: 'Javelin', type: 'ranged', traits: ['Thrown'], damage: '1d6' }],
        }],
      };
      const result = getStrikes(char);
      expect(result.find(s => s.name === 'Javelin').damage).toBe('1d6+2');
    });

    it('feat strike with variable actionCount "One to Two" sets variableActionCount', () => {
      const char = {
        ...baseChar,
        feats: [{
          name: 'Versatile Blast',
          strikes: [{ name: 'Versatile', type: 'melee', traits: [], damage: '1d6', actionCount: 'One to Two' }],
        }],
      };
      const result = getStrikes(char);
      const strike = result.find(s => s.name === 'Versatile');
      expect(strike.variableActionCount).toEqual({ min: 1, max: 2 });
    });

    it('feat strike named Metal Blast gets hardcoded variableActionCount', () => {
      const char = {
        ...baseChar,
        feats: [{
          name: 'Kineticist',
          strikes: [{ name: 'Metal Blast', type: 'ranged', traits: [], damage: '1d8' }],
        }],
      };
      const result = getStrikes(char);
      const blast = result.find(s => s.name === 'Metal Blast');
      // Post-processing should set variableActionCount
      expect(blast.variableActionCount).toEqual({ min: 1, max: 2 });
    });

    it('feat strike variants survive normalization (#215)', () => {
      const variants = [{ actions: 2, note: '+Con status bonus to damage' }];
      const char = {
        ...baseChar,
        feats: [{
          name: 'Versatile Blast',
          strikes: [{ name: 'Versatile', type: 'melee', traits: [], damage: '1d6', actionCount: 'One to Two', variants }],
        }],
      };
      const result = getStrikes(char);
      expect(result.find(s => s.name === 'Versatile').variants).toEqual(variants);
    });

    it('inventory weapon strike variants survive normalization (#215)', () => {
      const variants = [{ actions: 2, note: 'double dice' }];
      const char = {
        ...baseChar,
        inventory: [{
          name: 'Odd Blade',
          strikes: [{ type: 'melee', traits: [], damage: '1d6', variants }],
        }],
      };
      const result = getStrikes(char);
      expect(result.find(s => s.source === 'Odd Blade').variants).toEqual(variants);
    });

    it('inventory with array of strikes creates multiple strike entries', () => {
      const char = {
        ...baseChar,
        inventory: [{
          name: 'Dual Weapon',
          strikes: [
            { type: 'melee', traits: [], damage: '1d6' },
            { name: 'Off-hand', type: 'melee', traits: [], damage: '1d4' },
          ],
        }],
      };
      const result = getStrikes(char);
      const fromItem = result.filter(s => s.source === 'Dual Weapon');
      expect(fromItem).toHaveLength(2);
    });

    it('inventory strike with potency rune adds potency to positive bonus', () => {
      const char = {
        ...baseChar,
        abilities: { strength: 10, dexterity: 10 },
        proficiencies: { weapons: { simple: { proficiency: 1 } } },
        inventory: [{
          name: 'Magic Sword',
          potency: 2,
          strikes: { type: 'melee', traits: [], damage: '1d8', proficiency: 'simple' },
        }],
      };
      const result = getStrikes(char);
      const sword = result.find(s => s.source === 'Magic Sword');
      // base = +3 (0 STR, +2 trained, +1 level), potency +2 → +5
      expect(sword.attackMod).toBe(5);
    });

    it('resolves type from Ranged trait when type is absent', () => {
      const char = {
        ...baseChar,
        strikes: [{ name: 'Arrow', traits: ['Ranged'], damage: '1d6' }],
      };
      const result = getStrikes(char);
      expect(result.find(s => s.name === 'Arrow').type).toBe('ranged');
    });

    it('character with no strikes, feats, or inventory gets default unarmed', () => {
      const result = getStrikes({ level: 1 });
      expect(result[0].name).toBe('Unarmed Strike');
    });
  });

  describe('getActions — additional branch coverage', () => {
    it('returns [] when no actions, inventory, or feats — basics come from buildActionCatalog', () => {
      expect(getActions({})).toEqual([]);
    });

    it('processes variable action text in character.actions', () => {
      const char = {
        actions: [{ name: 'Blast', actions: 'One to Three Actions' }],
      };
      const result = getActions(char);
      const blast = result.find(a => a.name === 'Blast');
      expect(blast.variableActionCount).toEqual({ min: 1, max: 3 });
    });

    it('processes regular action count text in character.actions', () => {
      const char = {
        actions: [{ name: 'Cast', actions: 'Two Actions' }],
      };
      const result = getActions(char);
      const cast = result.find(a => a.name === 'Cast');
      expect(cast.actionCount).toBe(2);
    });

    it('ignores inventory items without actions', () => {
      const char = {
        actions: [{ name: 'Strike' }],
        inventory: [{ name: 'Sword' }], // no actions
      };
      const result = getActions(char);
      expect(result.some(a => a.name === 'Strike')).toBe(true);
    });

    it('ignores feats without actions', () => {
      const char = {
        actions: [{ name: 'Strike' }],
        feats: [{ name: 'Power Attack' }], // no actions
      };
      const result = getActions(char);
      expect(result.some(a => a.name === 'Strike')).toBe(true);
    });

    it('returns action unchanged when actions field is absent', () => {
      const char = {
        actions: [{ name: 'Stride', actionCount: 1 }],
      };
      const result = getActions(char);
      const stride = result.find(a => a.name === 'Stride');
      expect(stride.actionCount).toBe(1);
    });
  });

  describe('getReactions — additional branch coverage', () => {
    it('returns empty array when character has no reactions, feats, or inventory', () => {
      expect(getReactions({})).toEqual([]);
    });

    it('handles character.reactions being empty', () => {
      const char = { reactions: [] };
      expect(getReactions(char)).toEqual([]);
    });

    it('ignores inventory items without reactions', () => {
      const char = {
        reactions: [{ name: 'React' }],
        inventory: [{ name: 'Sword' }],
      };
      expect(getReactions(char)).toHaveLength(1);
    });

    it('ignores feats without reactions', () => {
      const char = {
        reactions: [{ name: 'React' }],
        feats: [{ name: 'Power Attack' }],
      };
      expect(getReactions(char)).toHaveLength(1);
    });

    it('a worn (non-held) item reaction is active only with noHandRequired (#735)', () => {
      // Dragon Turtle Plate: an armor reaction is usable while the armor is worn,
      // which is not a held state — noHandRequired flips it active.
      const armorReaction = { name: 'Roll the Plates', triggerType: 'attack-melee' };
      const worn = { name: 'Dragon Turtle Plate', state: 'worn', reactions: [armorReaction] };

      const withFlag = getReactions({ inventory: [{ ...worn, noHandRequired: true }] });
      expect(withFlag).toHaveLength(1);
      expect(withFlag[0]).toMatchObject({ source: 'Dragon Turtle Plate', active: true, triggerType: 'attack-melee' });

      // Without the flag the worn armor's reaction stays inactive (not in hand).
      expect(getReactions({ inventory: [worn] })[0].active).toBe(false);
    });
  });

  describe('getFreeActions — additional branch coverage', () => {
    it('returns empty array when character has no freeActions, feats, or inventory', () => {
      expect(getFreeActions({})).toEqual([]);
    });

    it('handles character.freeActions being empty', () => {
      expect(getFreeActions({ freeActions: [] })).toEqual([]);
    });

    it('ignores inventory items without freeActions', () => {
      const char = {
        freeActions: [{ name: 'Quick Draw' }],
        inventory: [{ name: 'Sword' }],
      };
      expect(getFreeActions(char)).toHaveLength(1);
    });

    it('ignores feats without freeActions', () => {
      const char = {
        freeActions: [{ name: 'Quick Draw' }],
        feats: [{ name: 'Power Attack' }],
      };
      expect(getFreeActions(char)).toHaveLength(1);
    });
  });

  describe('etched-rune abilities (#735)', () => {
    // A worn armor with the Swallow-Spike rune etched (resolved property doc).
    const wornArmorWithSpike = (state = 'worn') => ({
      name: 'Wisp Chain',
      state,
      runes: {
        property: [
          {
            id: 'swallow-spike',
            name: 'Swallow-Spike',
            reactions: [{ name: 'Grow Spikes', triggerType: 'grabbed' }],
            actions: [{ name: 'Renewed Assault', actions: 'One Action' }],
          },
        ],
      },
    });

    it('surfaces a property rune reaction from a worn host, sourced as Item (Rune)', () => {
      const out = getReactions({ inventory: [wornArmorWithSpike()] });
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        name: 'Grow Spikes',
        source: 'Wisp Chain (Swallow-Spike)',
        active: true,
        triggerType: 'grabbed',
      });
    });

    it('surfaces a property rune action, processing its action count', () => {
      const out = getActions({ inventory: [wornArmorWithSpike()] });
      const ra = out.find((a) => a.name === 'Renewed Assault');
      expect(ra).toMatchObject({ source: 'Wisp Chain (Swallow-Spike)', active: true, actionCount: 1 });
    });

    it('marks rune abilities inactive when the host is stowed or dropped', () => {
      expect(getReactions({ inventory: [wornArmorWithSpike('dropped')] })[0].active).toBe(false);
    });

    it('ignores unresolved (string-id) property runes', () => {
      const armor = { name: 'Wisp Chain', state: 'worn', runes: { property: ['swallow-spike'] } };
      expect(getReactions({ inventory: [armor] })).toEqual([]);
    });
  });
});

describe('hand gating (active flag)', () => {
  const baseChar = {
    level: 1,
    abilities: { strength: 14, dexterity: 10 },
    proficiencies: { weapons: { simple: { proficiency: 1 } } },
  };

  describe('getStrikes', () => {
    it('marks an inventory weapon strike inactive when the item is worn', () => {
      const char = {
        ...baseChar,
        inventory: [{ name: 'Greatsword', state: 'worn', strikes: { type: 'melee', traits: [], damage: '2d12' } }],
      };
      const s = getStrikes(char).find((x) => x.source === 'Greatsword');
      expect(s.active).toBe(false);
    });

    it('marks it active when the item is held (held1 / held2)', () => {
      const held1 = {
        ...baseChar,
        inventory: [{ name: 'Greatsword', state: 'held1', strikes: { type: 'melee', traits: [], damage: '2d12' } }],
      };
      const held2 = {
        ...baseChar,
        inventory: [{ name: 'Greatsword', state: 'held2', strikes: { type: 'melee', traits: [], damage: '2d12' } }],
      };
      expect(getStrikes(held1).find((x) => x.source === 'Greatsword').active).toBe(true);
      expect(getStrikes(held2).find((x) => x.source === 'Greatsword').active).toBe(true);
    });

    it('honours the noHandRequired catalog override while worn', () => {
      const char = {
        ...baseChar,
        inventory: [{ name: 'Handwraps', state: 'worn', noHandRequired: true, strikes: { type: 'melee', traits: [], damage: '1d4' } }],
      };
      expect(getStrikes(char).find((x) => x.source === 'Handwraps').active).toBe(true);
    });

    it('leaves character-defined and unarmed-fallback strikes ungated', () => {
      const char = { ...baseChar, strikes: [{ name: 'Bite', type: 'melee', traits: [], damage: '1d8' }] };
      expect(getStrikes(char)[0].active).toBeUndefined();

      const unarmed = getStrikes({ ...baseChar }); // no strikes anywhere → fallback
      expect(unarmed[0].name).toBe('Unarmed Strike');
      expect(unarmed[0].active).toBeUndefined();
    });
  });

  describe('getActions / getReactions / getFreeActions', () => {
    it('gates inventory-sourced actions on held state', () => {
      const worn = { inventory: [{ name: 'Wand', state: 'worn', actions: [{ name: 'Activate', actionCount: 1 }] }] };
      const held = { inventory: [{ name: 'Wand', state: 'held1', actions: [{ name: 'Activate', actionCount: 1 }] }] };
      expect(getActions(worn).find((a) => a.source === 'Wand').active).toBe(false);
      expect(getActions(held).find((a) => a.source === 'Wand').active).toBe(true);
    });

    it('gates inventory reactions and free actions, leaves feat-sourced ones ungated', () => {
      const char = {
        reactions: [],
        freeActions: [],
        feats: [
          { name: 'Feat1', reactions: [{ name: 'FeatReaction' }], freeActions: [{ name: 'FeatFree' }] },
        ],
        inventory: [
          { name: 'Buckler', state: 'worn', reactions: [{ name: 'Block' }], freeActions: [{ name: 'Snap' }] },
        ],
      };
      const r = getReactions(char);
      expect(r.find((x) => x.source === 'Buckler').active).toBe(false);
      expect(r.find((x) => x.source === 'Feat1').active).toBeUndefined();

      const fa = getFreeActions(char);
      expect(fa.find((x) => x.source === 'Buckler').active).toBe(false);
      expect(fa.find((x) => x.source === 'Feat1').active).toBeUndefined();
    });
  });
});
