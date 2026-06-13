import {
  minionRoster,
  minionStrikeAttackMod,
  minionStrikeDamage,
  minionTurnId,
  MINION_COMPANION,
  MINION_FAMILIAR,
} from './minionUtils';

// Zevira — Young Shadow Hound (Ashka's companion, from snapshot data).
const zevira = {
  name: 'Zevira',
  type: 'Young Shadow Hound',
  hp: 32,
  abilities: { strength: 14, dexterity: 16, constitution: 13 },
  strikes: [{ name: 'Bite', proficiency: 1, type: 'melee', damage: '1d8', traits: ['Attack', 'Finesse'] }],
};
const lazarus = { name: 'Lazarus', type: 'Squox', hp: 20 };

describe('minionRoster', () => {
  it('lists companion then familiar, skipping absent slots', () => {
    expect(minionRoster({ animalCompanion: zevira, familiar: lazarus })).toEqual([
      { role: MINION_COMPANION, name: 'Zevira', maxHp: 32, data: zevira },
      { role: MINION_FAMILIAR, name: 'Lazarus', maxHp: 20, data: lazarus },
    ]);
    expect(minionRoster({ animalCompanion: zevira })).toHaveLength(1);
    expect(minionRoster({})).toEqual([]);
    expect(minionRoster(null)).toEqual([]);
  });
});

describe('minionStrikeAttackMod', () => {
  it('uses best of Str/Dex plus proficiency bonus at the owner level', () => {
    // best mod = Dex 16 → +3; trained (rank 1) at level 5 → 2 + 5 = 7; total +10
    expect(minionStrikeAttackMod(zevira.strikes[0], zevira, 5)).toBe(10);
  });
});

describe('minionStrikeDamage', () => {
  it('folds the Str mod into a melee strike', () => {
    expect(minionStrikeDamage(zevira.strikes[0], zevira)).toBe('1d8+2'); // Str 14 → +2
  });

  it('leaves a ranged strike without the Str mod', () => {
    const ranged = { name: 'Spit', type: 'ranged', damage: '1d6' };
    expect(minionStrikeDamage(ranged, zevira)).toBe('1d6');
  });
});

describe('minionTurnId', () => {
  it('is owner-scoped so two PCs do not share a MAP counter', () => {
    expect(minionTurnId('Ashka', MINION_COMPANION)).toBe('Ashka-companion');
    expect(minionTurnId('Izzy', MINION_COMPANION)).toBe('Izzy-companion');
  });
});
