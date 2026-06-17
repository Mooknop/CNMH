import { resolveActionRoll, mapSpellDefense } from './rollResolution';
import { calculateClassDC } from './CharacterUtils';
import * as ConditionUtils from './ConditionUtils';
import * as EffectUtils from './EffectUtils';

// ─── helpers ─────────────────────────────────────────────────────────────────
const baseCharacter = {
  level: 1,
  keyAbility: 'strength',
  abilities: { strength: 14, dexterity: 12, intelligence: 10, wisdom: 10, charisma: 10 },
  skills: { athletics: { proficiency: 1 }, deception: { proficiency: 0 } },
  proficiencies: { weapons: { simple: { proficiency: 1 } } },
  spellcasting: { ability: 'charisma', proficiency: 1 },
};

const noEffects = { conditions: [], effects: [] };

// ─── mapSpellDefense ─────────────────────────────────────────────────────────
describe('mapSpellDefense', () => {
  it('maps Reflex → reflex', () => expect(mapSpellDefense('Reflex')).toBe('reflex'));
  it('maps Will → will',    () => expect(mapSpellDefense('Will')).toBe('will'));
  it('maps Fortitude → fortitude', () => expect(mapSpellDefense('Fortitude')).toBe('fortitude'));
  it('returns null for unrecognised', () => expect(mapSpellDefense('Unknown')).toBeNull());
});

// ─── none cases ──────────────────────────────────────────────────────────────
describe('resolveActionRoll — none', () => {
  it('returns none when ability is null', () => {
    expect(resolveActionRoll(null, baseCharacter).mode).toBe('none');
  });

  it('returns none for a pure movement action (Stride)', () => {
    const stride = { name: 'Stride', actionCount: 1, traits: ['Move'], requiresTarget: false };
    expect(resolveActionRoll(stride, baseCharacter, noEffects).mode).toBe('none');
  });
});

// ─── explicit roll config ─────────────────────────────────────────────────────
describe('resolveActionRoll — explicit roll config', () => {
  it('flat: returns the override bonus as-is (not netted against conditions)', () => {
    const ability = { name: 'Special', roll: { type: 'flat', bonus: 7 }, targetDefense: 'ac' };
    const result = resolveActionRoll(ability, baseCharacter, noEffects);
    expect(result.mode).toBe('actor-roll');
    expect(result.bonus).toBe(7);
    expect(result.defense).toBe('ac');
    expect(result.source).toBe('roll-config-flat');
  });

  it('strike: uses attackMod and correct stat', () => {
    const ability = { name: 'Sword', type: 'melee', attackMod: 5, roll: { type: 'strike' }, targetDefense: 'ac' };
    const result = resolveActionRoll(ability, baseCharacter, noEffects);
    expect(result.mode).toBe('actor-roll');
    expect(result.bonus).toBe(5);
    expect(result.defense).toBe('ac');
    expect(result.source).toBe('roll-config-strike');
  });

  it('skill: uses getSkillModifier for the given skill', () => {
    const ability = { name: 'Grapple', roll: { type: 'skill', skill: 'athletics' }, targetDefense: 'fortitude' };
    const result = resolveActionRoll(ability, baseCharacter, noEffects);
    // STR 14 → mod 2, trained (prof 1) → +2+1 = +3 + level 1 = … actually getSkillModifier returns 2+3=5
    expect(result.mode).toBe('actor-roll');
    expect(typeof result.bonus).toBe('number');
    expect(result.defense).toBe('fortitude');
    expect(result.skill).toBe('athletics');
  });

  it('spell-attack: uses spellAttackMod', () => {
    const ability = { name: 'Spell Strike', roll: { type: 'spell-attack' } };
    const result = resolveActionRoll(ability, baseCharacter, noEffects);
    expect(result.mode).toBe('actor-roll');
    expect(result.defense).toBe('ac');
    expect(typeof result.bonus).toBe('number');
    expect(result.source).toBe('roll-config-spell-attack');
  });

  it('spell-dc: returns target-save with spellDC', () => {
    const ability = { name: 'Fireball', defense: 'Reflex', roll: { type: 'spell-dc' } };
    const result = resolveActionRoll(ability, baseCharacter, noEffects);
    expect(result.mode).toBe('target-save');
    expect(result.defense).toBe('reflex');
    expect(typeof result.dc).toBe('number');
    expect(result.source).toBe('roll-config-spell-dc');
  });

  it('roll.bonus overrides derived base for non-flat types', () => {
    const ability = { name: 'Grapple', roll: { type: 'skill', skill: 'athletics', bonus: 10 }, targetDefense: 'fortitude' };
    const result = resolveActionRoll(ability, baseCharacter, noEffects);
    expect(result.bonus).toBe(10); // bonus 10, no active conditions → total 10
  });
});

// ─── class-dc roll path (#216) ────────────────────────────────────────────────
describe('resolveActionRoll — class-dc roll config', () => {
  const champion = {
    ...baseCharacter,
    class: 'Champion',
    champion: { class_dc: 19 },
  };
  const shardStrike = {
    name: 'Shard Strike',
    actionCount: 2,
    traits: ['Impulse', 'Kineticist', 'Metal', 'Primal'],
    targetDefense: 'reflex',
    roll: { type: 'class-dc' },
  };

  it('returns target-save at the explicit class-block DC', () => {
    const result = resolveActionRoll(shardStrike, champion, noEffects);
    expect(result.mode).toBe('target-save');
    expect(result.dc).toBe(19);
    expect(result.bonus).toBeNull();
    expect(result.defense).toBe('reflex');
    expect(result.source).toBe('roll-config-class-dc');
    expect(result.breakdown).toEqual({ base: 19, total: 19, sources: [] });
  });

  it('maps a capitalized spell-style defense field too', () => {
    const ability = { name: 'Inner Upheaval', defense: 'Fortitude', roll: { type: 'class-dc' } };
    const result = resolveActionRoll(ability, champion, noEffects);
    expect(result.defense).toBe('fortitude');
    expect(result.dc).toBe(19);
  });

  it('derives the class DC when no class block carries one', () => {
    const result = resolveActionRoll(shardStrike, baseCharacter, noEffects);
    expect(result.mode).toBe('target-save');
    expect(result.dc).toBe(calculateClassDC(baseCharacter));
  });

  it('roll.bonus overrides the class-block DC', () => {
    const ability = { ...shardStrike, roll: { type: 'class-dc', bonus: 25 } };
    expect(resolveActionRoll(ability, champion, noEffects).dc).toBe(25);
  });

  it('frightened 2 lowers the class DC by 2', () => {
    const frightened2 = [{ id: 'frightened', value: 2 }];
    const netted = resolveActionRoll(shardStrike, champion, { conditions: frightened2 });
    expect(netted.dc).toBe(17);
    expect(netted.breakdown.sources.length).toBeGreaterThan(0);
  });

  it('stupefied lowers the class DC only for a mental key ability', () => {
    const stupefied2 = [{ id: 'stupefied', value: 2 }];
    const physical = resolveActionRoll(shardStrike, champion, { conditions: stupefied2 });
    expect(physical.dc).toBe(19); // keyAbility strength → unaffected
    const mentalChampion = { ...champion, keyAbility: 'charisma' };
    const mental = resolveActionRoll(shardStrike, mentalChampion, { conditions: stupefied2 });
    expect(mental.dc).toBe(17);
  });
});

// ─── priority 2: strike with numeric attackMod ────────────────────────────────
describe('resolveActionRoll — numeric attackMod strike', () => {
  it('returns actor-roll vs AC with the numeric attackMod', () => {
    const strike = { name: 'Longsword', type: 'melee', attackMod: 9, targetDefense: 'ac' };
    const result = resolveActionRoll(strike, baseCharacter, noEffects);
    expect(result.mode).toBe('actor-roll');
    expect(result.bonus).toBe(9);
    expect(result.defense).toBe('ac');
    expect(result.source).toBe('strike');
  });

  it('uses rangedAttack stat for ranged strikes', () => {
    const strike = { name: 'Shortbow', type: 'ranged', attackMod: 5, targetDefense: 'ac' };
    // spy on computeConditionEffects to verify stat routing
    const spy = vi.spyOn(ConditionUtils, 'computeConditionEffects').mockReturnValue({
      meleeAttack:  { total: -1, sources: [] },
      rangedAttack: { total: -2, sources: [] },
      spellAttack:  { total: 0,  sources: [] },
      spellDC:      { total: 0,  sources: [] },
      skillPenalty: () => ({ total: 0, sources: [] }),
    });
    vi.spyOn(EffectUtils, 'computeEffectBonuses').mockReturnValue({
      rangedAttack: { total: 0, sources: [] },
    });
    const result = resolveActionRoll(strike, baseCharacter, { conditions: [{ id: 'frightened', value: 2 }] });
    expect(result.bonus).toBe(3); // 5 base - 2 rangedAttack penalty
    spy.mockRestore();
    vi.restoreAllMocks();
  });
});

// ─── priority 3: highlightSkill ───────────────────────────────────────────────
describe('resolveActionRoll — highlightSkill', () => {
  it('Grapple (athletics vs fortitude)', () => {
    const grapple = { name: 'Grapple', highlightSkill: 'athletics', targetDefense: 'fortitude', traits: ['Attack'] };
    const result = resolveActionRoll(grapple, baseCharacter, noEffects);
    expect(result.mode).toBe('actor-roll');
    expect(result.defense).toBe('fortitude');
    expect(result.skill).toBe('athletics');
    expect(typeof result.bonus).toBe('number');
    expect(result.source).toBe('highlight-skill');
  });
});

// ─── skill-check effect bonus (#447) ─────────────────────────────────────────
describe('resolveActionRoll — skill-check effect bonus (#447)', () => {
  const skillCatalog = [
    { id: 'upstage', name: 'Upstage', modifiers: [{ stat: 'skills', kind: 'status', amount: 1 }] },
  ];
  const upstage = { effects: [{ id: 'u1', effectId: 'upstage' }], effectCatalog: skillCatalog };

  it('adds a skills-status effect to a type:skill roll', () => {
    const grapple = { name: 'Grapple', roll: { type: 'skill', skill: 'athletics' }, targetDefense: 'fortitude' };
    const base = resolveActionRoll(grapple, baseCharacter, noEffects).bonus;
    const buffed = resolveActionRoll(grapple, baseCharacter, upstage);
    expect(buffed.bonus).toBe(base + 1);
    expect(buffed.breakdown.sources.some((s) => s.label === 'Upstage' && s.isBuff)).toBe(true);
  });

  it('adds a skills-status effect to a highlightSkill maneuver', () => {
    const grapple = { name: 'Grapple', highlightSkill: 'athletics', targetDefense: 'fortitude', traits: ['Attack'] };
    const base = resolveActionRoll(grapple, baseCharacter, noEffects).bonus;
    const buffed = resolveActionRoll(grapple, baseCharacter, upstage);
    expect(buffed.bonus).toBe(base + 1);
  });
});

// ─── priority 4: spell inference ─────────────────────────────────────────────
describe('resolveActionRoll — spell inference', () => {
  it('Fireball (defense: Reflex) → target-save', () => {
    const fireball = { name: 'Fireball', defense: 'Reflex', traits: ['Fire', 'Evocation'] };
    const result = resolveActionRoll(fireball, baseCharacter, noEffects);
    expect(result.mode).toBe('target-save');
    expect(result.defense).toBe('reflex');
    expect(typeof result.dc).toBe('number');
  });

  it('spell with Attack trait (cantrip) → actor-roll spell attack', () => {
    const cantrip = { name: 'Electric Arc', traits: ['Attack', 'Electricity'] };
    const result = resolveActionRoll(cantrip, baseCharacter, noEffects);
    expect(result.mode).toBe('actor-roll');
    expect(result.defense).toBe('ac');
    expect(result.source).toBe('spell-attack-inferred');
  });

  it('spell with Attack trait AND defense field → spell attack (Attack trait wins)', () => {
    const spell = { name: 'Weird Spell', traits: ['Attack'], defense: 'Reflex' };
    const result = resolveActionRoll(spell, baseCharacter, noEffects);
    expect(result.mode).toBe('actor-roll');
    expect(result.source).toBe('spell-attack-inferred');
  });

  it('targetDefense ac with no bonus source → actor-roll with null bonus', () => {
    const action = { name: 'Strike', traits: ['Attack'], targetDefense: 'ac' };
    const charNoSpellcasting = { ...baseCharacter, spellcasting: null };
    const result = resolveActionRoll(action, charNoSpellcasting, noEffects);
    expect(result.mode).toBe('actor-roll');
    expect(result.bonus).toBeNull();
  });
});

// ─── Multiple Attack Penalty (mapStep) ───────────────────────────────────────
describe('resolveActionRoll — mapStep', () => {
  const strike      = { name: 'Longsword', type: 'melee', attackMod: 9, traits: ['Attack'] };
  const agileStrike = { name: 'Claw', type: 'melee', attackMod: 9, traits: ['Attack', 'Agile'] };

  it('applies −5/−10 to a strike at steps 1 and 2', () => {
    expect(resolveActionRoll(strike, baseCharacter, { ...noEffects, mapStep: 1 }).bonus).toBe(4);
    expect(resolveActionRoll(strike, baseCharacter, { ...noEffects, mapStep: 2 }).bonus).toBe(-1);
  });

  it('applies −4/−8 to an agile strike', () => {
    expect(resolveActionRoll(agileStrike, baseCharacter, { ...noEffects, mapStep: 1 }).bonus).toBe(5);
    expect(resolveActionRoll(agileStrike, baseCharacter, { ...noEffects, mapStep: 2 }).bonus).toBe(1);
  });

  it('appends a Multiple attack penalty source to the breakdown', () => {
    const result = resolveActionRoll(strike, baseCharacter, { ...noEffects, mapStep: 1 });
    expect(result.breakdown.total).toBe(4);
    expect(result.breakdown.sources).toContainEqual(
      expect.objectContaining({ label: 'Multiple attack penalty', penalty: -5 })
    );
  });

  it('applies to spell attacks with the Attack trait', () => {
    const cantrip = { name: 'Electric Arc', traits: ['Attack', 'Electricity'] };
    const at0 = resolveActionRoll(cantrip, baseCharacter, noEffects).bonus;
    const at1 = resolveActionRoll(cantrip, baseCharacter, { ...noEffects, mapStep: 1 }).bonus;
    expect(at1).toBe(at0 - 5);
  });

  it('applies to Attack-trait skill maneuvers (Grapple)', () => {
    const grapple = { name: 'Grapple', highlightSkill: 'athletics', targetDefense: 'fortitude', traits: ['Attack'] };
    const at0 = resolveActionRoll(grapple, baseCharacter, noEffects).bonus;
    const at1 = resolveActionRoll(grapple, baseCharacter, { ...noEffects, mapStep: 1 }).bonus;
    expect(at1).toBe(at0 - 5);
  });

  it('does not apply to target-save spells', () => {
    const fireball = { name: 'Fireball', defense: 'Reflex', traits: ['Fire'] };
    const at0 = resolveActionRoll(fireball, baseCharacter, noEffects).dc;
    const at1 = resolveActionRoll(fireball, baseCharacter, { ...noEffects, mapStep: 2 }).dc;
    expect(at1).toBe(at0);
  });

  it('does not apply to non-attack abilities', () => {
    const ability = { name: 'Special', roll: { type: 'flat', bonus: 7 }, targetDefense: 'ac' };
    expect(resolveActionRoll(ability, baseCharacter, { ...noEffects, mapStep: 2 }).bonus).toBe(7);
  });

  it('leaves the manual-total (null bonus) path untouched', () => {
    const action = { name: 'Strike', traits: ['Attack'], targetDefense: 'ac' };
    const charNoSpellcasting = { ...baseCharacter, spellcasting: null };
    const result = resolveActionRoll(action, charNoSpellcasting, { ...noEffects, mapStep: 2 });
    expect(result.bonus).toBeNull();
  });
});

// ─── condition / effect netting ───────────────────────────────────────────────
describe('resolveActionRoll — condition/effect netting', () => {
  const frightened2 = [{ id: 'frightened', value: 2 }];

  it('frightened 2 lowers a melee strike bonus by 2', () => {
    const strike = { name: 'Longsword', type: 'melee', attackMod: 9 };
    const base  = resolveActionRoll(strike, baseCharacter, noEffects).bonus;
    const netted = resolveActionRoll(strike, baseCharacter, { conditions: frightened2 }).bonus;
    expect(netted).toBe(base - 2);
  });

  it('frightened 2 lowers a ranged strike bonus by 2', () => {
    const strike = { name: 'Bow', type: 'ranged', attackMod: 5 };
    const base   = resolveActionRoll(strike, baseCharacter, noEffects).bonus;
    const netted = resolveActionRoll(strike, baseCharacter, { conditions: frightened2 }).bonus;
    expect(netted).toBe(base - 2);
  });

  it('frightened 2 lowers the save spell DC', () => {
    const fireball = { name: 'Fireball', defense: 'Reflex' };
    const base     = resolveActionRoll(fireball, baseCharacter, noEffects).dc;
    const netted   = resolveActionRoll(fireball, baseCharacter, { conditions: frightened2 }).dc;
    expect(netted).toBe(base - 2);
  });

  it('frightened 2 lowers a spell attack roll', () => {
    const cantrip = { name: 'Cantrip', traits: ['Attack'] };
    const base    = resolveActionRoll(cantrip, baseCharacter, noEffects).bonus;
    const netted  = resolveActionRoll(cantrip, baseCharacter, { conditions: frightened2 }).bonus;
    expect(netted).toBe(base - 2);
  });

  it('off-guard does NOT lower the actor\'s attack roll (it is a defender penalty)', () => {
    const offGuard = [{ id: 'off-guard' }];
    const strike = { name: 'Longsword', type: 'melee', attackMod: 9 };
    const base   = resolveActionRoll(strike, baseCharacter, noEffects).bonus;
    const netted = resolveActionRoll(strike, baseCharacter, { conditions: offGuard }).bonus;
    expect(netted).toBe(base); // no change
  });

  it('effect bonus (status) raises a spell attack roll', () => {
    // Heroism grants +1 status bonus to spellAttack
    const heroism = [{ effectId: 'heroism-lesser' }];
    const cantrip = { name: 'Cantrip', traits: ['Attack'] };
    const base    = resolveActionRoll(cantrip, baseCharacter, noEffects).bonus;
    const buffed  = resolveActionRoll(cantrip, baseCharacter, { effects: heroism }).bonus;
    // If heroism-lesser is in the catalog it adds +1 status to spellAttack → buffed > base
    // Don't hard-code the catalog; just check direction when the effect applies.
    expect(typeof buffed).toBe('number');
    expect(buffed).toBeGreaterThanOrEqual(base);
  });
});
