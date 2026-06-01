import { getStrikes } from './strikeUtils';

const minimalCharacter = {
  id: 'char1',
  name: 'Test',
  level: 1,
  abilities: { strength: 14, dexterity: 12, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  proficiencies: {
    weapons: {
      unarmed:  { proficiency: 2 },
      simple:   { proficiency: 2 },
      martial:  { proficiency: 0 },
    },
  },
};

describe('getStrikes targetDefense', () => {
  test('every resolved strike carries targetDefense: "ac"', () => {
    const strikes = getStrikes(minimalCharacter);
    expect(strikes.length).toBeGreaterThan(0);
    for (const strike of strikes) {
      expect(strike.targetDefense).toBe('ac');
    }
  });

  test('character strikes carry targetDefense: "ac"', () => {
    const char = {
      ...minimalCharacter,
      strikes: [{ name: 'Longsword', type: 'melee', proficiency: 'martial', damage: '1d8' }],
    };
    const strikes = getStrikes(char);
    const longsword = strikes.find((s) => s.name === 'Longsword');
    expect(longsword).toBeDefined();
    expect(longsword.targetDefense).toBe('ac');
  });

  test('feat strikes carry targetDefense: "ac"', () => {
    const char = {
      ...minimalCharacter,
      feats: [{
        id: 'f1',
        name: 'Elemental Blast',
        strikes: [{ name: 'Fire Blast', type: 'ranged', damage: '1d6', action: 1 }],
      }],
    };
    const strikes = getStrikes(char);
    const blast = strikes.find((s) => s.name === 'Fire Blast');
    expect(blast).toBeDefined();
    expect(blast.targetDefense).toBe('ac');
  });
});
