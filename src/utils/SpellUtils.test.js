import {
  calculateSpellStats,
  organizeSpellsByRank,
  getAvailableRanks,
  getDefenseTypes,
  filterSpellsByDefense,
  filterSpellsByRank,
  getSortedRankList,
  formatSpellRank,
  findScrollItems,
  extractScrollSpells,
  findWandItems,
  extractWandSpells,
  extractInnateSpells,
} from './SpellUtils';

describe('SpellUtils', () => {
  describe('calculateSpellStats', () => {
    it('should calculate spell attack and DC correctly', () => {
      const character = {
        abilities: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 16,
          wisdom: 10,
          charisma: 10
        },
        spellcasting: {
          ability: 'intelligence',
          proficiency: 1
        },
        level: 1
      };

      const result = calculateSpellStats(character);
      expect(result.spellAttackMod).toBe(6); // +3 from ability mod, +3 from trained+level proficiency
      expect(result.spellDC).toBe(16); // 10 + 6
    });

    it('should handle missing spellcasting data', () => {
      const character = {
        abilities: {
          intelligence: 10
        },
        level: 1
      };

      const result = calculateSpellStats(character);
      expect(result.spellAttackMod).toBe(0);
      expect(result.spellDC).toBe(10);
    });

    it('should calculate correctly with high ability and proficiency', () => {
      const character = {
        abilities: {
          charisma: 20
        },
        spellcasting: {
          ability: 'charisma',
          proficiency: 4
        },
        level: 20
      };

      const result = calculateSpellStats(character);
      expect(result.spellAttackMod).toBe(33); // +5 from ability, +8 from legendary, +20 from level
      expect(result.spellDC).toBe(43); // 10 + 33
    });
  });

  describe('organizeSpellsByRank', () => {
    it('should organize spells by rank correctly', () => {
      const spells = [
        { name: 'Fire Bolt', level: 0 },
        { name: 'Fireball', level: 3 },
        { name: 'Shield', level: 1 },
        { name: 'Magic Missile', level: 1 },
        { name: 'Wish', level: 10 }
      ];

      const result = organizeSpellsByRank(spells);
      
      expect(result.cantrips).toHaveLength(1);
      expect(result[1]).toHaveLength(2);
      expect(result[3]).toHaveLength(1);
      expect(result[10]).toHaveLength(1);
    });

    it('should handle empty spell array', () => {
      const result = organizeSpellsByRank([]);
      
      Object.keys(result).forEach(rank => {
        expect(result[rank]).toHaveLength(0);
      });
    });

    it('should handle undefined input', () => {
      const result = organizeSpellsByRank(undefined);
      
      Object.keys(result).forEach(rank => {
        expect(result[rank]).toHaveLength(0);
      });
    });

    it('should group all cantrips correctly', () => {
      const spells = [
        { name: 'Fire Bolt', level: 0 },
        { name: 'Mage Hand', level: 0 },
        { name: 'Prestidigitation', level: 0 }
      ];

      const result = organizeSpellsByRank(spells);
      
      expect(result.cantrips).toHaveLength(3);
      expect(result[1]).toHaveLength(0);
    });
  });

  describe('getAvailableRanks', () => {
    it('should return ranks that have spells', () => {
      const spellsByRank = {
        cantrips: [{ name: 'Fire Bolt' }],
        1: [{ name: 'Shield' }],
        2: [],
        3: [{ name: 'Fireball' }]
      };

      const result = getAvailableRanks(spellsByRank);
      
      expect(result).toContain('cantrips');
      expect(result).toContain('1');
      expect(result).toContain('3');
      expect(result).not.toContain('2');
    });

    it('should return empty array for empty spellsByRank', () => {
      const spellsByRank = {
        cantrips: [],
        1: [],
        2: []
      };

      const result = getAvailableRanks(spellsByRank);
      
      expect(result).toHaveLength(0);
    });

    it('should handle empty object', () => {
      const result = getAvailableRanks({});
      
      expect(result).toHaveLength(0);
    });
  });

  describe('getDefenseTypes', () => {
    it('should return all unique defense types', () => {
      const spells = [
        { name: 'Fireball', defense: 'Reflex' },
        { name: 'Magic Missile', defense: 'Reflex' },
        { name: 'Charm', defense: 'Will' },
        { name: 'Ray of Frost', defense: 'Reflex' }
      ];

      const result = getDefenseTypes(spells);
      
      expect(result).toContain('all');
      expect(result).toContain('Reflex');
      expect(result).toContain('Will');
      expect(result.length).toBe(3);
    });

    it('should always include "all"', () => {
      const spells = [];
      const result = getDefenseTypes(spells);
      
      expect(result).toContain('all');
    });

    it('should handle spells without defense property', () => {
      const spells = [
        { name: 'Spell1' },
        { name: 'Spell2', defense: 'Fortitude' },
        { name: 'Spell3' }
      ];

      const result = getDefenseTypes(spells);
      
      expect(result).toContain('all');
      expect(result).toContain('Fortitude');
      expect(result).toHaveLength(2);
    });
  });

  describe('filterSpellsByDefense', () => {
    it('should return all spells when filter is "all"', () => {
      const spells = [
        { name: 'Fireball', defense: 'Reflex' },
        { name: 'Charm', defense: 'Will' },
        { name: 'Heal', defense: 'Fortitude' }
      ];

      const result = filterSpellsByDefense(spells, 'all');
      
      expect(result).toHaveLength(3);
    });

    it('should filter spells by defense type', () => {
      const spells = [
        { name: 'Fireball', defense: 'Reflex' },
        { name: 'Magic Missile', defense: 'Reflex' },
        { name: 'Charm', defense: 'Will' }
      ];

      const result = filterSpellsByDefense(spells, 'Reflex');
      
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Fireball');
      expect(result[1].name).toBe('Magic Missile');
    });

    it('should return empty array when no spells match filter', () => {
      const spells = [
        { name: 'Fireball', defense: 'Reflex' }
      ];

      const result = filterSpellsByDefense(spells, 'Will');
      
      expect(result).toHaveLength(0);
    });

    it('should handle undefined defense property', () => {
      const spells = [
        { name: 'Spell1', defense: 'Reflex' },
        { name: 'Spell2' },
        { name: 'Spell3', defense: 'Reflex' }
      ];

      const result = filterSpellsByDefense(spells, 'Will');

      expect(result).toHaveLength(0);
    });

    it('should match spells with no defense when filter is "none"', () => {
      const spells = [
        { name: 'Spell1', defense: 'Reflex' },
        { name: 'Spell2' },
      ];
      const result = filterSpellsByDefense(spells, 'none');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Spell2');
    });
  });

  describe('filterSpellsByRank', () => {
    const spells = [
      { name: 'Mage Hand', level: 0 },
      { name: 'Shield', level: 1 },
      { name: 'Fireball', level: 3 },
    ];

    it('returns all spells when filter is "all"', () => {
      expect(filterSpellsByRank(spells, 'all')).toHaveLength(3);
    });

    it('returns only cantrips when filter is "cantrips"', () => {
      const result = filterSpellsByRank(spells, 'cantrips');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Mage Hand');
    });

    it('returns only spells of the specified rank', () => {
      const result = filterSpellsByRank(spells, '3');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Fireball');
    });

    it('returns empty array when no spells match rank', () => {
      expect(filterSpellsByRank(spells, '5')).toHaveLength(0);
    });
  });

  describe('getSortedRankList', () => {
    it('always starts with "all"', () => {
      const result = getSortedRankList([]);
      expect(result[0]).toBe('all');
    });

    it('puts cantrips before numbered ranks', () => {
      const result = getSortedRankList(['cantrips', '3', '1']);
      expect(result).toEqual(['all', 'cantrips', '1', '3']);
    });

    it('sorts numbered ranks in ascending order', () => {
      const result = getSortedRankList(['5', '2', '8']);
      expect(result).toEqual(['all', '2', '5', '8']);
    });
  });

  describe('formatSpellRank', () => {
    it('formats cantrips', () => {
      expect(formatSpellRank('cantrips')).toBe('Cantrips');
    });

    it('formats all', () => {
      expect(formatSpellRank('all')).toBe('All Spells');
    });

    it('formats numeric ranks', () => {
      expect(formatSpellRank('3')).toBe('Rank 3');
      expect(formatSpellRank('10')).toBe('Rank 10');
    });
  });

  describe('findScrollItems', () => {
    it('returns empty array when character has no inventory', () => {
      expect(findScrollItems({})).toHaveLength(0);
    });

    it('returns only scroll items', () => {
      const char = {
        inventory: [
          { name: 'Scroll of Fireball', scroll: { name: 'Fireball', level: 3 } },
          { name: 'Sword' },
        ],
      };
      expect(findScrollItems(char)).toHaveLength(1);
      expect(findScrollItems(char)[0].name).toBe('Scroll of Fireball');
    });
  });

  describe('extractScrollSpells', () => {
    it('extracts spells from scroll items', () => {
      const scrollItems = [
        { name: 'Scroll of Fireball', scroll: { name: 'Fireball', level: 3 } },
      ];
      const result = extractScrollSpells(scrollItems);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Fireball');
      expect(result[0].fromScroll).toBe(true);
      expect(result[0].scrollName).toBe('Scroll of Fireball');
    });

    it('gates the spell on the scroll being held', () => {
      const spell = { name: 'Fireball', level: 3 };
      expect(extractScrollSpells([{ name: 'S', state: 'worn', scroll: spell }])[0].active).toBe(false);
      expect(extractScrollSpells([{ name: 'S', state: 'held1', scroll: spell }])[0].active).toBe(true);
      expect(extractScrollSpells([{ name: 'S', noHandRequired: true, scroll: spell }])[0].active).toBe(true);
    });
  });

  describe('findWandItems', () => {
    it('returns only wand items', () => {
      const char = {
        inventory: [
          { name: 'Wand of Fireball', wand: { name: 'Fireball', level: 3 } },
          { name: 'Sword' },
          { name: 'Wand Holster' }, // has "wand" in name but no wand property
        ],
      };
      expect(findWandItems(char)).toHaveLength(1);
    });

    it('returns empty array when no inventory', () => {
      expect(findWandItems({})).toHaveLength(0);
    });
  });

  describe('extractWandSpells', () => {
    it('extracts spells from wand items', () => {
      const wandItems = [
        { name: 'Wand of Fireball', wand: { name: 'Fireball', level: 3 } },
      ];
      const result = extractWandSpells(wandItems);
      expect(result[0].fromWand).toBe(true);
      expect(result[0].wandName).toBe('Wand of Fireball');
    });

    it('gates the spell on the wand being held', () => {
      const spell = { name: 'Fireball', level: 3 };
      expect(extractWandSpells([{ name: 'Wand', state: 'worn', wand: spell }])[0].active).toBe(false);
      expect(extractWandSpells([{ name: 'Wand', state: 'held2', wand: spell }])[0].active).toBe(true);
    });
  });

  describe('extractInnateSpells', () => {
    it('returns empty array when no feats', () => {
      expect(extractInnateSpells({})).toHaveLength(0);
    });

    it('extracts innate spells from feats', () => {
      const char = {
        feats: [
          {
            name: 'Elven Heritage',
            innate: [{ name: 'Detect Magic', level: 0 }],
          },
        ],
      };
      const result = extractInnateSpells(char);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Detect Magic');
      expect(result[0].innateSource).toBe('Elven Heritage');
    });

    it('extracts ancestry spells', () => {
      const char = {
        ancestry: 'Elf',
        ancestry_spells: [{ name: 'Dancing Lights', level: 0 }],
      };
      const result = extractInnateSpells(char);
      expect(result).toHaveLength(1);
      expect(result[0].innateSource).toBe('Elf');
    });
  });
});
