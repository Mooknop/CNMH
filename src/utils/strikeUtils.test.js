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

describe('getStrikes stance tagging (#224)', () => {
  const dragonFeat = {
    id: 'feat-2',
    name: 'Dragon Stance',
    actions: [{ name: 'Dragon Stance', actionCount: 1, traits: ['Monk', 'Stance'] }],
    strikes: [{ name: 'Dragon Tail Strike', type: 'melee', proficiency: 'unarmed', damage: '1d10', action: 1, traits: ['Unarmed'] }],
  };

  test('a strike from a feat with a Stance action is tagged with the stance name', () => {
    const strikes = getStrikes({ ...minimalCharacter, feats: [dragonFeat] });
    const tail = strikes.find((s) => s.name === 'Dragon Tail Strike');
    expect(tail).toBeDefined();
    expect(tail.stance).toBe('Dragon Stance');
  });

  test('strikes from a feat without a Stance action carry no stance tag', () => {
    const char = {
      ...minimalCharacter,
      feats: [{
        id: 'f1',
        name: 'Draconic Ravager',
        strikes: [{ name: 'Ravager Claw', type: 'melee', proficiency: 'unarmed', damage: '1d6', action: 1, traits: ['Agile'] }],
      }],
    };
    const claw = getStrikes(char).find((s) => s.name === 'Ravager Claw');
    expect(claw).toBeDefined();
    expect(claw.stance).toBeUndefined();
  });
});

describe('getStrikes weapon runes (#548)', () => {
  const martialChar = {
    ...minimalCharacter,
    proficiencies: { weapons: { unarmed: { proficiency: 2 }, simple: { proficiency: 2 }, martial: { proficiency: 4 } } },
  };

  test('legacy flat-potency weapon resolves unchanged', () => {
    const char = {
      ...martialChar,
      inventory: [{
        id: 'i1', name: '+1 Striking Pick', potency: 1,
        strikes: { name: 'Pick Strike', proficiency: 'martial', type: 'melee', damage: '2d6' },
      }],
    };
    const pick = getStrikes(char).find((s) => s.name === 'Pick Strike');
    expect(pick).toBeDefined();
    expect(pick.damage).toBe('2d6+2'); // literal dice + Str mod (+2), no scaling
    expect(pick.source).toBe('+1 Striking Pick');
  });

  test('new-model runes weapon scales dice and applies derived name + potency', () => {
    const char = {
      ...martialChar,
      inventory: [{
        id: 'i2', name: 'Pick', price: 0.1, runes: { potency: 1, striking: 'striking' },
        strikes: { name: 'Pick Strike', proficiency: 'martial', type: 'melee', damage: '1d6' },
      }],
    };
    const noRunes = getStrikes({
      ...martialChar,
      inventory: [{ id: 'i3', name: 'Pick', strikes: { name: 'Pick Strike', proficiency: 'martial', type: 'melee', damage: '1d6' } }],
    }).find((s) => s.name === 'Pick Strike');

    const pick = getStrikes(char).find((s) => s.name === 'Pick Strike');
    expect(pick).toBeDefined();
    expect(pick.damage).toBe('2d6+2'); // 1d6 scaled to 2d6 by striking, + Str mod
    expect(pick.attackMod).toBe(noRunes.attackMod + 1); // +1 potency item bonus
    expect(pick.source).toBe('+1 Striking Pick'); // derived display name
  });

  test('property-rune riders are translated onto the strike', () => {
    const rider = { vsTrait: 'undead', persistent: '1d6', damageType: 'vitality' };
    const char = {
      ...martialChar,
      inventory: [{
        id: 'i4', name: 'Greataxe',
        runes: { potency: 2, striking: 'greater', property: [{ id: 'vitalizing', name: 'Vitalizing', price: 150, rider }] },
        strikes: { name: 'Axe Strike', proficiency: 'martial', type: 'melee', damage: '1d12' },
      }],
    };
    const axe = getStrikes(char).find((s) => s.name === 'Axe Strike');
    expect(axe).toBeDefined();
    expect(axe.damage).toBe('3d12+2'); // 1d12 scaled +2 dice
    expect(axe.source).toBe('+2 Greater Striking Vitalizing Greataxe');
    expect(axe.riders).toEqual([
      {
        id: 'rune-vitalizing-persistent',
        label: 'Vitalizing (vs undead)',
        persistent: { dice: '1d6', type: 'vitality' },
        appliesVsTrait: 'undead',
      },
    ]);
  });
});
