// Shield-talisman buff spine (#1246) — pure-util coverage for the four
// self-side shield talismans' machinery: effect detection, the cnmh_effects_
// entry builder (round vs clock expiry), the replace-on-reactivate write, the
// readers useShield / the trait display consume, and the Heartstone split.
import {
  SHIELD_BUFF_KINDS,
  shieldTalismanEffect,
  buildShieldBuffEntry,
  withShieldBuffApplied,
  shieldBuffsFor,
  shieldBuffHardnessBonus,
  shieldBuffGrantedTraits,
  shieldBuffEnergyBlock,
  heartstoneSplit,
} from './shieldTalismans';

const flake = (bonus = 2) => ({
  id: 'adamantine-flake',
  name: 'Adamantine Flake',
  talisman: {
    affixTo: 'shield',
    activation: {
      cost: 1,
      effect: { kind: 'shield-hardness', bonus, durationMinutes: 1 },
    },
  },
});

const treeSap = {
  id: 'tree-sap',
  name: 'Tree Sap',
  talisman: {
    affixTo: 'shield',
    activation: {
      cost: 1,
      effect: { kind: 'shield-trait', traits: ['Grapple'], durationRounds: 1 },
    },
  },
};

const crystal = {
  id: 'prismatic-crystal',
  name: 'Prismatic Crystal',
  talisman: {
    affixTo: 'shield',
    activation: {
      cost: 1,
      effect: {
        kind: 'shield-energy-block',
        choose: ['acid', 'cold', 'electricity', 'fire', 'poison', 'sonic'],
        durationMinutes: 1,
      },
    },
  },
};

const shield = { uid: 's1', name: 'Steel Shield', shield: { hardness: 5, health: 20, breakThreshold: 10 } };

describe('shieldTalismanEffect', () => {
  it('returns the structured effect for every shield-buff kind', () => {
    expect(shieldTalismanEffect(flake())).toEqual({ kind: 'shield-hardness', bonus: 2, durationMinutes: 1 });
    expect(SHIELD_BUFF_KINDS).toContain('shield-temp-hp');
  });

  it('returns null for non-shield talismans and effectless activations', () => {
    expect(shieldTalismanEffect({ talisman: { activation: { cost: 1 } } })).toBeNull();
    expect(
      shieldTalismanEffect({ talisman: { activation: { cost: 1, effect: { kind: 'save-bonus', save: 'will', bonus: 2 } } } })
    ).toBeNull();
    expect(shieldTalismanEffect(null)).toBeNull();
  });
});

describe('buildShieldBuffEntry', () => {
  it('binds the buff to the shield uid with the flake hardness bonus', () => {
    const entry = buildShieldBuffEntry({ item: flake(6), shield, charId: 'hero', nowSecs: 1000 });
    expect(entry.shieldBuff).toEqual(expect.objectContaining({
      itemId: 'adamantine-flake',
      shieldUid: 's1',
      shieldName: 'Steel Shield',
      hardnessBonus: 6,
    }));
    expect(entry.name).toBe('Adamantine Flake (Steel Shield)');
    expect(entry.appliedBy).toBe('hero');
  });

  it('minutes tick as rounds in an active encounter (1 min = 10 rounds at caster turn-end)', () => {
    const encounter = { active: true, round: 3, currentTurnIndex: 0, order: [{ entryId: 'e1' }] };
    const entry = buildShieldBuffEntry({
      item: flake(), shield, charId: 'hero', encounter, casterEntryId: 'e1', nowSecs: 1000,
    });
    expect(entry.expireAt).toEqual({ round: 13, entryId: 'e1', boundary: 'turn-end' });
    expect(entry.expireAtSecs).toBeUndefined();
  });

  it('minutes fall back to the game clock outside an encounter', () => {
    const entry = buildShieldBuffEntry({ item: flake(), shield, charId: 'hero', nowSecs: 1000 });
    expect(entry.expireAt).toBeUndefined();
    expect(entry.expireAtSecs).toBe(1060);
  });

  it("tree sap's 1 round expires next round in combat, 6 clock seconds outside", () => {
    const encounter = { active: true, round: 2, currentTurnIndex: 0, order: [{ entryId: 'e1' }] };
    const inCombat = buildShieldBuffEntry({
      item: treeSap, shield, charId: 'hero', encounter, casterEntryId: 'e1', nowSecs: 500,
    });
    expect(inCombat.expireAt).toEqual({ round: 3, entryId: 'e1', boundary: 'turn-end' });
    const outside = buildShieldBuffEntry({ item: treeSap, shield, charId: 'hero', nowSecs: 500 });
    expect(outside.expireAtSecs).toBe(506);
    expect(outside.shieldBuff.grantTraits).toEqual(['Grapple']);
  });

  it("carries the crystal's chosen energy type", () => {
    const entry = buildShieldBuffEntry({ item: crystal, shield, charId: 'hero', choice: 'fire', nowSecs: 0 });
    expect(entry.shieldBuff.energyBlock).toBe('fire');
    expect(entry.expireAtSecs).toBe(60);
  });
});

describe('withShieldBuffApplied', () => {
  it('replaces a prior buff from the same talisman on the same shield, keeps others', () => {
    const oldFlake = buildShieldBuffEntry({ item: flake(2), shield, charId: 'hero', nowSecs: 0 });
    const sap = buildShieldBuffEntry({ item: treeSap, shield, charId: 'hero', nowSecs: 0 });
    const unrelated = { id: 'x', name: 'Bless' };
    const newFlake = buildShieldBuffEntry({ item: flake(2), shield, charId: 'hero', nowSecs: 30 });
    const next = withShieldBuffApplied([oldFlake, sap, unrelated], newFlake);
    expect(next).toHaveLength(3);
    expect(next).not.toContain(oldFlake);
    expect(next).toContain(sap);
    expect(next).toContain(unrelated);
    expect(next[next.length - 1]).toBe(newFlake);
  });
});

describe('readers', () => {
  const effects = [
    buildShieldBuffEntry({ item: flake(6), shield, charId: 'hero', nowSecs: 0 }),
    buildShieldBuffEntry({ item: treeSap, shield, charId: 'hero', nowSecs: 0 }),
    buildShieldBuffEntry({ item: crystal, shield, charId: 'hero', choice: 'cold', nowSecs: 0 }),
    { id: 'other', name: 'Bless' },
  ];

  it('scopes to the shield uid', () => {
    expect(shieldBuffsFor(effects, 's1')).toHaveLength(3);
    expect(shieldBuffsFor(effects, 's2')).toHaveLength(0);
    expect(shieldBuffsFor(null, 's1')).toEqual([]);
  });

  it('hardness bonus takes the highest (item bonuses do not stack)', () => {
    expect(shieldBuffHardnessBonus(effects, 's1')).toBe(6);
    expect(shieldBuffHardnessBonus([], 's1')).toBe(0);
  });

  it('granted traits dedupe, energy block reports the chosen type', () => {
    expect(shieldBuffGrantedTraits(effects, 's1')).toEqual(['Grapple']);
    expect(shieldBuffEnergyBlock(effects, 's1')).toBe('cold');
    expect(shieldBuffEnergyBlock(effects, 's2')).toBeNull();
  });
});

describe('heartstoneSplit', () => {
  it('shield gets the total, wielder half rounded down', () => {
    expect(heartstoneSplit(27)).toEqual({ shield: 27, wielder: 13 });
    expect(heartstoneSplit(40)).toEqual({ shield: 40, wielder: 20 });
  });

  it('clamps junk to 0', () => {
    expect(heartstoneSplit(-4)).toEqual({ shield: 0, wielder: 0 });
    expect(heartstoneSplit('nope')).toEqual({ shield: 0, wielder: 0 });
  });
});
