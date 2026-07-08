import { getStrikes, resolveItemStrikes } from './strikeUtils';
import { maneuverDamageTalisman } from './talismanActivation';

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

describe('getStrikes damage types (#1018)', () => {
  test('a character strike passes its damageType through', () => {
    const char = {
      ...minimalCharacter,
      strikes: [{ name: 'Longsword', type: 'melee', proficiency: 'martial', damage: '1d8', damageType: 'slashing' }],
    };
    expect(getStrikes(char).find((s) => s.name === 'Longsword').damageType).toBe('slashing');
  });

  test('a feat strike carries its damageType', () => {
    const char = {
      ...minimalCharacter,
      feats: [{
        id: 'f1',
        name: 'Elemental Blast',
        strikes: [{ name: 'Fire Blast', type: 'ranged', damage: '1d6', action: 1, damageType: 'fire' }],
      }],
    };
    expect(getStrikes(char).find((s) => s.name === 'Fire Blast').damageType).toBe('fire');
  });

  test('an inventory weapon strike carries its damageType', () => {
    const char = {
      ...minimalCharacter,
      inventory: [{
        id: 'i1', uid: 'u1', name: 'Warhammer', state: 'held1',
        strikes: [{ name: 'Warhammer Strike', proficiency: 'martial', type: 'melee', damage: '1d8', damageType: 'bludgeoning' }],
      }],
    };
    expect(getStrikes(char).find((s) => s.name === 'Warhammer Strike').damageType).toBe('bludgeoning');
  });

  test('the generated Unarmed Strike fallback is bludgeoning', () => {
    const unarmed = getStrikes(minimalCharacter).find((s) => s.name === 'Unarmed Strike');
    expect(unarmed.damageType).toBe('bludgeoning');
  });

  test('strikes authored without a type stay untyped (no field)', () => {
    const char = {
      ...minimalCharacter,
      strikes: [{ name: 'Mystery Lash', type: 'melee', proficiency: 'simple', damage: '1d6' }],
    };
    expect(getStrikes(char).find((s) => s.name === 'Mystery Lash').damageType).toBeUndefined();
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

describe('resolveItemStrikes (per-item resolution)', () => {
  const char = {
    ...minimalCharacter,
    level: 3,
    abilities: { ...minimalCharacter.abilities, strength: 18 },
    proficiencies: { weapons: { simple: { proficiency: 1 }, martial: { proficiency: 1 } } },
  };

  test('computes attackMod and Str-laden damage for a single-strike item', () => {
    const item = { id: 'i1', name: 'Club', strikes: { name: 'Club Strike', proficiency: 'simple', type: 'melee', damage: '1d6' } };
    const [strike] = resolveItemStrikes(item, char);
    // Str +4 + simple trained(2) + level 3 = +9
    expect(strike.attackMod).toBe(9);
    expect(strike.damage).toBe('1d6+4');
    expect(strike.source).toBe('Club');
  });

  test('resolves an array of strikes in order', () => {
    const item = {
      id: 'i2', name: 'Combo',
      strikes: [
        { name: 'Ranged', proficiency: 'martial', type: 'ranged', damage: '1d6' },
        { name: 'Melee', proficiency: 'martial', type: 'melee', damage: '1d4' },
      ],
    };
    const strikes = resolveItemStrikes(item, char);
    expect(strikes.map((s) => s.name)).toEqual(['Ranged', 'Melee']);
  });

  test('returns [] when item has no strikes or character is missing', () => {
    expect(resolveItemStrikes({ id: 'x', name: 'Rock' }, char)).toEqual([]);
    expect(resolveItemStrikes({ id: 'x', name: 'Club', strikes: {} }, null)).toEqual([]);
  });

  test('honors the spellAttackOrMartial flag', () => {
    const spellChar = {
      ...char,
      abilities: { ...char.abilities, strength: 10, charisma: 20 },
      spellcasting: { ability: 'charisma', proficiency: 2 },
    };
    const item = { id: 'h', name: "Xanderghul's Flawless Hammer", strikes: { name: 'Hammer', proficiency: 'simple', type: 'melee', damage: '1d12', attackStat: 'spellAttackOrMartial' } };
    const [strike] = resolveItemStrikes(item, spellChar);
    // spell attack: Cha +5 + expert(4) + level 3 = +12 (beats martial: Str 0 + trained(2) + 3 = +5)
    expect(strike.attackMod).toBe(12);
  });

  describe('dragonbreath template (#1210 M4b)', () => {
    const dbItem = (tier, dragonType, property) => ({
      id: 'db', name: 'Longsword',
      dragonbreath: { tier, dragonType },
      ...(property ? { runes: { property } } : {}),
      strikes: { name: 'Longsword Strike', proficiency: 'martial', type: 'melee', damage: '1d8' },
    });

    test('scales dice + attack by the tier fundamentals, names + types by the template', () => {
      const [s] = resolveItemStrikes(dbItem('greater', 'Red'), char);
      expect(s.damage).toBe('3d8+4'); // 1d8 + greater striking (+2 dice) + Str 4
      expect(s.attackMod).toBe(11); // Str 4 + martial trained 2 + level 3 + potency 2
      expect(s.source).toBe('Greater Red Dragonbreath Longsword');
      expect(s.damageType).toBe('fire'); // Red → fire (single-option kind)
    });

    test('base tier omits the tier word and applies +1 potency', () => {
      const [s] = resolveItemStrikes(dbItem('base', 'Red'), char);
      expect(s.damage).toBe('2d8+4');
      expect(s.attackMod).toBe(10);
      expect(s.source).toBe('Red Dragonbreath Longsword');
    });

    test('prepends etched property runes; a multi-option kind leaves native damage type', () => {
      const [s] = resolveItemStrikes(dbItem('greater', 'Mirage', [{ id: 'vitalizing', name: 'Vitalizing' }]), char);
      expect(s.source).toBe('Vitalizing Greater Mirage Dragonbreath Longsword');
      expect(s.damageType).toBeUndefined(); // Mirage = force|mental, unrecorded → native (none)
    });
  });
});

describe('getStrikes spell-attack weapon (attackStat: spellAttackOrMartial)', () => {
  // Xanderghul's Flawless Hammer: a special weapon whose attack uses the
  // wielder's spell attack modifier, or its martial-proficiency + Str attack,
  // whichever is higher.
  const hammerStrike = {
    name: "Xanderghul's Flawless Hammer",
    proficiency: 'simple',
    type: 'melee',
    damage: '1d12',
    attackStat: 'spellAttackOrMartial',
  };

  const spellcaster = {
    ...minimalCharacter,
    level: 5,
    abilities: { ...minimalCharacter.abilities, strength: 14, charisma: 20 },
    proficiencies: { weapons: { simple: { proficiency: 1 }, martial: { proficiency: 1 } } },
    spellcasting: { ability: 'charisma', proficiency: 2 },
  };

  test('uses the spell attack modifier when it is higher', () => {
    const char = { ...spellcaster, inventory: [{ id: 'h1', name: "Xanderghul's Flawless Hammer", strikes: hammerStrike }] };
    const hammer = getStrikes(char).find((s) => s.name === "Xanderghul's Flawless Hammer");
    expect(hammer).toBeDefined();
    // spell attack: Cha +5 + expert(4) + level 5 = +14; martial: Str +2 + trained(2) + level 5 = +9
    expect(hammer.attackMod).toBe(14);
  });

  test('falls back to martial proficiency + Str when that is higher', () => {
    const char = {
      ...spellcaster,
      abilities: { ...spellcaster.abilities, strength: 14, charisma: 10 },
      spellcasting: { ability: 'charisma', proficiency: 0 },
      inventory: [{ id: 'h2', name: "Xanderghul's Flawless Hammer", strikes: hammerStrike }],
    };
    const hammer = getStrikes(char).find((s) => s.name === "Xanderghul's Flawless Hammer");
    // spell attack: Cha 0 + untrained(0) = 0; martial: Str +2 + trained(2) + level 5 = +9
    expect(hammer.attackMod).toBe(9);
  });

  test('ignores the strike proficiency rank (uses martial, not simple)', () => {
    const char = {
      ...spellcaster,
      abilities: { ...spellcaster.abilities, strength: 14, charisma: 10 },
      spellcasting: { ability: 'charisma', proficiency: 0 },
      proficiencies: { weapons: { simple: { proficiency: 4 }, martial: { proficiency: 1 } } },
      inventory: [{ id: 'h3', name: "Xanderghul's Flawless Hammer", strikes: hammerStrike }],
    };
    const hammer = getStrikes(char).find((s) => s.name === "Xanderghul's Flawless Hammer");
    // martial (trained) + Str +2 + level 5 = +9 — the high simple rank is not used
    expect(hammer.attackMod).toBe(9);
  });

  test('strikes without the flag are unaffected', () => {
    const char = {
      ...spellcaster,
      inventory: [{ id: 'p1', name: 'Plain Hammer', strikes: { name: 'Plain Hammer', proficiency: 'simple', type: 'melee', damage: '1d8' } }],
    };
    const plain = getStrikes(char).find((s) => s.name === 'Plain Hammer');
    // normal path: Str +2 + simple trained(2) + level 5 = +9
    expect(plain.attackMod).toBe(9);
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

  test('attaches a runeBreakdown to a runed strike (#608)', () => {
    const char = {
      ...martialChar,
      inventory: [{
        id: 'i5', name: 'Pick', runes: { potency: 1, striking: 'striking' },
        strikes: { name: 'Pick Strike', proficiency: 'martial', type: 'melee', damage: '1d6' },
      }],
    };
    const pick = getStrikes(char).find((s) => s.name === 'Pick Strike');
    expect(pick.runeBreakdown).toEqual({
      potencyBonus: 1, extraDice: 1, strikingLabel: 'Striking', properties: [],
    });
  });

  test('non-runed strikes carry no runeBreakdown key', () => {
    const char = {
      ...martialChar,
      inventory: [{ id: 'i6', name: 'Club', strikes: { name: 'Club Strike', proficiency: 'martial', type: 'melee', damage: '1d6' } }],
    };
    const club = getStrikes(char).find((s) => s.name === 'Club Strike');
    expect(club).toBeDefined();
    expect('runeBreakdown' in club).toBe(false);
  });

  test('rune riders and a talisman effect coexist on one weapon, both feeding the damage step (#609)', () => {
    const vitalizingRider = { vsTrait: 'undead', persistent: '1d6', damageType: 'vitality' };
    const axe = {
      id: 'i7', name: 'Greataxe',
      runes: { potency: 2, property: [{ id: 'vitalizing', name: 'Vitalizing', rider: vitalizingRider }] },
      strikes: { name: 'Axe Strike', proficiency: 'martial', type: 'melee', damage: '1d12' },
    };
    // The talisman is a separate inventory item affixed to the same weapon.
    const tripTalisman = {
      uid: 't9', name: 'Fearful Pennant', traits: ['Talisman'],
      talisman: { affixTo: 'weapon', activation: { effect: { kind: 'damage', amount: 3, damageType: 'mental', onManeuver: 'trip' } } },
    };

    // Rune source: the strike carries the translated property-rune rider.
    const strike = getStrikes({ ...martialChar, inventory: [axe] }).find((s) => s.name === 'Axe Strike');
    expect(strike.riders).toEqual([{
      id: 'rune-vitalizing-persistent', label: 'Vitalizing (vs undead)',
      persistent: { dice: '1d6', type: 'vitality' }, appliesVsTrait: 'undead',
    }]);

    // Talisman source: independently retrievable, untouched by the runes.
    expect(maneuverDamageTalisman([tripTalisman], 'trip')).toBe(tripTalisman);
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

describe('chambered weapon gate (#672, S2)', () => {
  // A Crescent Cross held in a hand: ranged Capacity-3 Bolt + melee Blade.
  const heldCrescent = {
    uid: 'e-crescent', id: 'crescent-cross', name: 'Crescent Cross', state: 'held1',
    strikes: [
      { name: 'Crescent Cross Bolt', proficiency: 'martial', type: 'ranged', damage: '1d6', capacity: 3, reload: 1, ammoType: 'bolt', traits: ['Attack', 'Capacity 3', 'Ranged'] },
      { name: 'Crescent Cross Blade', proficiency: 'martial', type: 'melee', damage: '1d4', traits: ['Attack', 'Melee'] },
    ],
  };
  const bolt = { name: 'Crescent Cross Bolt', default: true, infinite: true };
  const loadedState = { chambers: [bolt, null, null], pointer: 0 };
  const charWith = (chambers) =>
    getStrikes({ ...minimalCharacter, inventory: [heldCrescent] }, chambers);

  test('ranged Bolt is inactive with no loaded chamber, even while held', () => {
    const ranged = charWith({}).find((s) => s.name === 'Crescent Cross Bolt');
    expect(ranged.active).toBe(false);
    expect(ranged.capacity).toBe(3);
    expect(ranged.chambersLoaded).toBe(0);
    expect(ranged.loaded).toBe(false);
  });

  test('ranged Bolt becomes active once a chamber is loaded', () => {
    const ranged = charWith({ 'e-crescent': loadedState })
      .find((s) => s.name === 'Crescent Cross Bolt');
    expect(ranged.active).toBe(true);
    expect(ranged.chambersLoaded).toBe(1);
    expect(ranged.loaded).toBe(true);
    // Carries the inventory uid so the fire resolver can reach the overlay (#676).
    expect(ranged.weaponUid).toBe('e-crescent');
  });

  test('the melee Blade is unaffected by chambers — active when held, no capacity fields', () => {
    const blade = charWith({}).find((s) => s.name === 'Crescent Cross Blade');
    expect(blade.active).toBe(true);
    expect('capacity' in blade).toBe(false);
    expect('loaded' in blade).toBe(false);
  });

  test('a loaded chamber does not un-gate the hold requirement', () => {
    const worn = { ...heldCrescent, state: 'worn' };
    const ranged = getStrikes({ ...minimalCharacter, inventory: [worn] }, { 'e-crescent': loadedState })
      .find((s) => s.name === 'Crescent Cross Bolt');
    expect(ranged.active).toBe(false); // loaded but not held
  });

  test('getStrikes routes chamber state to the weapon by its inventory uid', () => {
    const off = charWith({}).find((s) => s.name === 'Crescent Cross Bolt');
    expect(off.active).toBe(false);
    const on = charWith({ 'e-crescent': loadedState })
      .find((s) => s.name === 'Crescent Cross Bolt');
    expect(on.active).toBe(true);
    expect(on.chambersLoaded).toBe(1);
  });
});

describe('nock weapon single-slot load (#1270, AA1)', () => {
  // A held shortbow: ranged strike with typed ammo (arrow), reload 0, no capacity.
  const heldBow = {
    uid: 'e-bow', id: 'shortbow', name: 'Shortbow', state: 'held1',
    strikes: [
      { name: 'Shortbow', proficiency: 'martial', type: 'ranged', damage: '1d6', reload: 0, ammoType: 'arrow', traits: ['Attack', 'Ranged'] },
    ],
  };
  const sleepArrow = { name: 'Sleep Arrow', item: 'Sleep Arrow', default: false, activate: 0, onHit: true, effectId: 'sleep-arrow' };
  const bowWith = (chambers) =>
    getStrikes({ ...minimalCharacter, inventory: [heldBow] }, chambers)
      .find((s) => s.name === 'Shortbow');

  test('the bow joins the chamber rail with a single slot but stays active when empty', () => {
    const bow = bowWith({});
    expect(bow.capacity).toBe(1);
    expect(bow.nock).toBe(true);
    expect(bow.chambersLoaded).toBe(0);
    expect(bow.loaded).toBe(false);
    expect(bow.active).toBe(true); // plain arrows are infinite — no load gate
    expect(bow.weaponUid).toBe('e-bow'); // fire resolver reaches the overlay
  });

  test('a nocked special surfaces as the loaded slot', () => {
    const bow = bowWith({ 'e-bow': { chambers: [sleepArrow], pointer: 0 } });
    expect(bow.chambersLoaded).toBe(1);
    expect(bow.loaded).toBe(true);
    expect(bow.active).toBe(true);
  });

  test('a ranged strike without an ammoType is untouched by the rail', () => {
    const javelin = {
      uid: 'e-jav', name: 'Javelin', state: 'held1',
      strikes: [{ name: 'Javelin', proficiency: 'martial', type: 'ranged', damage: '1d6', traits: ['Attack', 'Thrown 30 ft.'] }],
    };
    const strike = getStrikes({ ...minimalCharacter, inventory: [javelin] }, {})
      .find((s) => s.name === 'Javelin');
    expect('capacity' in strike).toBe(false);
    expect('nock' in strike).toBe(false);
  });
});

describe('thrown Strike tagging (#1230)', () => {
  // A dagger-style thrown weapon: authored melee Strike + ranged throw.
  const dagger = (extra = {}) => ({
    uid: 'e-dagger', name: 'Dagger', state: 'held1',
    strikes: [
      { name: 'Dagger Strike', proficiency: 'simple', type: 'melee', damage: '1d4', traits: ['Attack', 'Agile', 'Finesse', 'Thrown 10ft'] },
      { name: 'Dagger Throw', proficiency: 'simple', type: 'ranged', damage: '1d4', range: '10ft', traits: ['Attack', 'Agile', 'Thrown'] },
    ],
    ...extra,
  });

  test('the ranged throw is tagged thrown + weaponUid; not returning without a rune', () => {
    const toss = resolveItemStrikes(dagger(), minimalCharacter)
      .find((s) => s.type === 'ranged');
    expect(toss).toMatchObject({ thrown: true, weaponUid: 'e-dagger', returning: false });
  });

  test('the melee Strike keeps its Thrown trait but is never tagged for the drop', () => {
    const melee = resolveItemStrikes(dagger(), minimalCharacter)
      .find((s) => s.type === 'melee');
    expect('thrown' in melee).toBe(false);
    expect('weaponUid' in melee).toBe(false);
  });

  test('a returning property rune marks the throw returning (doc or bare id)', () => {
    const runedDoc = dagger({ runes: { potency: 1, property: [{ id: 'returning', type: 'property', name: 'Returning' }] } });
    const runedId = dagger({ runes: { potency: 1, property: ['returning'] } });
    for (const weapon of [runedDoc, runedId]) {
      const toss = resolveItemStrikes(weapon, minimalCharacter).find((s) => s.type === 'ranged');
      expect(toss.returning).toBe(true);
    }
  });

  test('a non-thrown ranged Strike is not tagged (bows stay in hand)', () => {
    const bow = {
      uid: 'e-bow', name: 'Shortbow', state: 'held2',
      strikes: [{ name: 'Shortbow Strike', proficiency: 'martial', type: 'ranged', damage: '1d6', range: '60ft', traits: ['Attack', 'Deadly d10'] }],
    };
    const shot = resolveItemStrikes(bow, minimalCharacter)[0];
    expect('thrown' in shot).toBe(false);
  });
});

describe('whetstone strike alterations (#1214)', () => {
  const runedSword = {
    id: 'i9', uid: 'u9', name: 'Longsword', state: 'held1',
    strikes: [{ name: 'Longsword Strike', proficiency: 'martial', type: 'melee', damage: '1d8', damageType: 'slashing' }],
    runes: { potency: 1, striking: 'striking' },
  };
  const morphEntry = {
    id: 'fx1',
    whetstone: {
      itemId: 'morph-jewel', itemName: 'Morph Jewel', weaponUid: 'u9', weaponName: 'Longsword',
      duration: 'minute', choice: 'bludgeoning', effect: { damageType: 'from-choice' },
    },
  };

  test('resolveItemStrikes applies the bound whetstone after runes', () => {
    const [strike] = resolveItemStrikes(runedSword, minimalCharacter, null, morphEntry);
    expect(strike.damageType).toBe('bludgeoning'); // whetstone override wins
    expect(strike.damage).toBe('2d8+2');           // striking dice untouched
    expect(strike.whetstone).toEqual({ itemName: 'Morph Jewel', choice: 'bludgeoning' });
  });

  test('getStrikes keys whetstone entries by weapon uid; other weapons untouched', () => {
    const other = {
      id: 'i10', uid: 'u10', name: 'Dagger', state: 'held1',
      strikes: [{ name: 'Dagger Strike', proficiency: 'simple', type: 'melee', damage: '1d4', damageType: 'piercing' }],
    };
    const char = { ...minimalCharacter, inventory: [runedSword, other] };
    const strikes = getStrikes(char, {}, { u9: morphEntry });
    expect(strikes.find((s) => s.name === 'Longsword Strike').damageType).toBe('bludgeoning');
    expect(strikes.find((s) => s.name === 'Dagger Strike').damageType).toBe('piercing');
    expect(strikes.find((s) => s.name === 'Dagger Strike').whetstone).toBeUndefined();
  });
});

describe('whetstone proficiency floor (#1216)', () => {
  const advancedChar = {
    ...minimalCharacter,
    level: 11,
    proficiencies: {
      weapons: {
        unarmed: { proficiency: 4 },
        simple:  { proficiency: 4 },
        martial: { proficiency: 6 },
        advanced: { proficiency: 2 },
      },
    },
  };
  const exoticWeapon = {
    id: 'i11', uid: 'u11', name: 'Odd Polearm', state: 'held1',
    strikes: [{ name: 'Polearm Strike', proficiency: 'advanced', type: 'melee', damage: '1d10' }],
  };
  const guideEntry = {
    id: 'fx2',
    whetstone: {
      itemId: 'blade-phantoms-guide', itemName: "Blade Phantom's Guide",
      weaponUid: 'u11', weaponName: 'Odd Polearm', duration: 'minute',
      effect: { proficiencyFloor: 'highest-weapon' },
    },
  };

  test('treats the weapon proficiency as the highest weapon rank while active', () => {
    const [plain] = resolveItemStrikes(exoticWeapon, advancedChar);
    const [floored] = resolveItemStrikes(exoticWeapon, advancedChar, null, guideEntry);
    // advanced (2) floors up to martial (6): +2 per proficiency step.
    expect(floored.attackMod).toBe(plain.attackMod + 8);
  });
});
