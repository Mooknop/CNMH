// FX animation catalog resolver + emits (#1416 + A4 spells, epic #1414).
import { describe, it, expect, vi } from 'vitest';
import {
  resolveFxRule, strikeFxFacts, spellFxFacts, abilityFxFacts,
  emitAbilityFxPlay, resolveSaveRequestFx, emitSaveFxPlay,
} from './fxPlay';

const RULES = [
  {
    id: 'fx-strike-melee',
    priority: 250,
    when: { kind: 'strike', rangeType: 'melee' },
    play: { shape: 'melee', file: 'jb2a.fallback' },
  },
  {
    id: 'fx-strike-melee-slashing',
    priority: 100,
    when: { kind: 'strike', rangeType: 'melee', damageType: 'slashing' },
    play: { shape: 'melee', file: 'jb2a.slashing' },
  },
  {
    id: 'fx-signature',
    priority: 10,
    when: { abilityName: 'Vindicator Slash' },
    play: { shape: 'melee', file: 'jb2a.signature', opts: { tint: '#ffd700' } },
  },
];

describe('resolveFxRule', () => {
  it('picks the lowest-priority (most specific) matching rule', () => {
    const play = resolveFxRule(RULES, {
      kind: 'strike', rangeType: 'melee', damageType: 'slashing',
    });
    expect(play.file).toBe('jb2a.slashing');
  });

  it('falls through to the family fallback when no specific rule matches', () => {
    const play = resolveFxRule(RULES, {
      kind: 'strike', rangeType: 'melee', damageType: 'bludgeoning',
    });
    expect(play.file).toBe('jb2a.fallback');
  });

  it('per-ability signature outranks family rules', () => {
    const play = resolveFxRule(RULES, {
      kind: 'strike', rangeType: 'melee', damageType: 'slashing',
      abilityName: 'Vindicator Slash',
    });
    expect(play.file).toBe('jb2a.signature');
  });

  it('returns null with no match, an empty catalog, or a non-array', () => {
    expect(resolveFxRule(RULES, { kind: 'spell' })).toBeNull();
    expect(resolveFxRule([], { kind: 'strike' })).toBeNull();
    expect(resolveFxRule(null, { kind: 'strike' })).toBeNull();
  });

  it('array facts match by membership (trait) — scalars still by equality', () => {
    const rules = [
      {
        id: 'bomb',
        priority: 100,
        when: { kind: 'strike', trait: 'Bomb', damageType: 'fire' },
        play: { shape: 'burst', file: 'jb2a.explosion.01.orange' },
      },
      {
        id: 'ranged',
        priority: 200,
        when: { kind: 'strike', rangeType: 'ranged' },
        play: { shape: 'projectile', file: 'jb2a.arrow.physical.white.01' },
      },
    ];
    const bombFacts = {
      kind: 'strike', rangeType: 'ranged', damageType: 'fire',
      trait: ['Attack', 'Bomb', 'Splash', 'Fire', 'Ranged'],
    };
    expect(resolveFxRule(rules, bombFacts).file).toBe('jb2a.explosion.01.orange');
    // A bow shot has no Bomb trait — falls through to the ranged rule.
    const bowFacts = { ...bombFacts, trait: ['Attack', 'Ranged'] };
    expect(resolveFxRule(rules, bowFacts).file).toBe('jb2a.arrow.physical.white.01');
    // Empty trait array never matches a trait rule.
    expect(resolveFxRule(rules, { ...bombFacts, trait: [] }).file).toBe('jb2a.arrow.physical.white.01');
  });

  it('skips malformed rules and rules with future matcher fields', () => {
    const rules = [
      { id: 'bad-no-play', when: { kind: 'strike' } },
      { id: 'bad-no-file', when: { kind: 'strike' }, play: { shape: 'melee' } },
      // `spellTradition` isn't in the strike fact bag — never matches, no throw.
      { id: 'future', when: { spellTradition: 'arcane' }, play: { shape: 'melee', file: 'x' } },
      { id: 'ok', when: { kind: 'strike' }, play: { shape: 'melee', file: 'jb2a.ok' } },
    ];
    expect(resolveFxRule(rules, { kind: 'strike' }).file).toBe('jb2a.ok');
  });
});

describe('strikeFxFacts', () => {
  it('derives facts from a melee strike (type absent = melee)', () => {
    expect(strikeFxFacts({ name: 'Light Hammer Strike', damageType: 'bludgeoning' })).toEqual({
      kind: 'strike',
      abilityName: 'Light Hammer Strike',
      damageType: 'bludgeoning',
      rangeType: 'melee',
      trait: [],
    });
  });

  it('carries the traits array as the trait fact', () => {
    const facts = strikeFxFacts({
      name: 'Acid Flask', type: 'ranged', damageType: 'acid',
      traits: ['Attack', 'Bomb', 'Splash', 'Acid', 'Ranged'],
    });
    expect(facts.trait).toContain('Bomb');
  });

  it('classifies ranged strikes', () => {
    expect(strikeFxFacts({ name: 'Hammer Throw', type: 'ranged' }).rangeType).toBe('ranged');
  });
});

describe('spellFxFacts / abilityFxFacts', () => {
  it('folds defense into defenseKind (attack vs save)', () => {
    expect(spellFxFacts({ defense: 'ac' }).defenseKind).toBe('attack');
    expect(spellFxFacts({ defense: 'reflex' }).defenseKind).toBe('save');
    expect(spellFxFacts({ defense: null }).defenseKind).toBeNull();
  });

  it('routes weapon strikes to strike facts, everything else to spell facts', () => {
    expect(abilityFxFacts({ name: 'Mace Strike', type: 'melee' }).kind).toBe('strike');
    const spell = abilityFxFacts(
      { name: 'Ignition', traits: ['Attack', 'Fire'], damageData: { type: 'fire' } },
      { typeLabel: 'fire' }
    );
    expect(spell).toMatchObject({
      kind: 'spell', abilityName: 'Ignition', damageType: 'fire', defense: 'ac', defenseKind: 'attack',
    });
  });

  it('prefers the resolved damage profile type over the authored one', () => {
    const facts = abilityFxFacts(
      { name: 'Elemental Blast', targetDefense: 'ac', damageData: { type: 'fire' } },
      { typeLabel: 'cold' }
    );
    expect(facts.damageType).toBe('cold');
  });
});

describe('emitAbilityFxPlay', () => {
  const hit = (entryId, degree = 'success') => ({ entryId, degree });
  const base = () => ({
    sendUpdate: vi.fn(),
    fxAnimations: RULES,
    ability: { name: 'Longsword Strike', type: 'melee', damageType: 'slashing' },
    casterEntryId: 'cbt-pc',
    rayGroups: [{ results: [hit('cbt-a'), hit('cbt-b', 'failure')] }],
    chainResults: null,
  });

  it('emits the resolved recipe for hit targets only', () => {
    const args = base();
    emitAbilityFxPlay(args);
    expect(args.sendUpdate).toHaveBeenCalledTimes(1);
    const [scope, key, payload] = args.sendUpdate.mock.calls[0];
    expect(scope).toBe('global');
    expect(key).toBe('fxplay');
    expect(payload).toMatchObject({
      shape: 'melee',
      file: 'jb2a.slashing',
      source: 'cbt-pc',
      targets: ['cbt-a'],
    });
    expect(typeof payload.id).toBe('string');
    expect(typeof payload.ts).toBe('number');
  });

  it('includes chained-strike hits, dedup’d', () => {
    const args = base();
    args.chainResults = { rolls: [[hit('cbt-a', 'criticalSuccess'), hit('cbt-c')]] };
    emitAbilityFxPlay(args);
    expect(args.sendUpdate.mock.calls[0][2].targets).toEqual(['cbt-a', 'cbt-c']);
  });

  it('carries rule opts through to the payload', () => {
    const args = base();
    args.ability = { name: 'Vindicator Slash', type: 'melee', damageType: 'slashing' };
    emitAbilityFxPlay(args);
    expect(args.sendUpdate.mock.calls[0][2].opts).toEqual({ tint: '#ffd700' });
  });

  it('emits nothing when: no hits, no matching rule, no caster, no relay', () => {
    const noHits = base();
    noHits.rayGroups = [{ results: [hit('cbt-a', 'failure')] }];
    emitAbilityFxPlay(noHits);
    expect(noHits.sendUpdate).not.toHaveBeenCalled();

    const noRule = base();
    noRule.fxAnimations = [];
    emitAbilityFxPlay(noRule);
    expect(noRule.sendUpdate).not.toHaveBeenCalled();

    const noCaster = base();
    noCaster.casterEntryId = null;
    emitAbilityFxPlay(noCaster);
    expect(noCaster.sendUpdate).not.toHaveBeenCalled();

    expect(() => emitAbilityFxPlay({ ...base(), sendUpdate: null })).not.toThrow();
  });
});

const SPELL_RULES = [
  {
    id: 'fx-spell-save-fire',
    priority: 100,
    when: { kind: 'spell', defenseKind: 'save', damageType: 'fire' },
    play: { shape: 'burst', file: 'jb2a.fireball.explosion.orange' },
  },
  {
    id: 'fx-spell-save',
    priority: 250,
    when: { kind: 'spell', defenseKind: 'save' },
    play: { shape: 'burst', file: 'jb2a.impact.001.blue' },
  },
];

describe('resolveSaveRequestFx', () => {
  it('resolves the save-spell recipe with the caster riding along', () => {
    const fx = resolveSaveRequestFx({
      fxAnimations: SPELL_RULES,
      ability: { name: 'Fireball' },
      damageProfile: { typeLabel: 'fire' },
      casterEntryId: 'cbt-caster',
      defense: 'reflex',
    });
    expect(fx).toEqual({
      shape: 'burst',
      file: 'jb2a.fireball.explosion.orange',
      source: 'cbt-caster',
    });
  });

  it('returns null when nothing matches or the catalog is absent', () => {
    expect(resolveSaveRequestFx({
      fxAnimations: [], ability: { name: 'Fear' }, defense: 'will',
    })).toBeNull();
    expect(resolveSaveRequestFx({
      ability: { name: 'Fear' }, defense: 'will',
    })).toBeNull();
  });
});

describe('emitSaveFxPlay', () => {
  const results = [
    { entryId: 'e-gob', degree: 'success' },
    { entryId: 'e-ogre', degree: 'failure' },
    { entryId: 'e-gob', degree: 'success' }, // dupe folds
  ];

  it('fires the ridden recipe at every resolved target regardless of degree', () => {
    const sendUpdate = vi.fn();
    emitSaveFxPlay({
      sendUpdate,
      fx: { shape: 'burst', file: 'jb2a.fireball.explosion.orange', source: 'cbt-caster' },
      results,
    });
    const [scope, key, payload] = sendUpdate.mock.calls[0];
    expect(scope).toBe('global');
    expect(key).toBe('fxplay');
    expect(payload).toMatchObject({
      shape: 'burst',
      file: 'jb2a.fireball.explosion.orange',
      source: 'cbt-caster',
      targets: ['e-gob', 'e-ogre'],
    });
  });

  it('a null source still fires (bursts are source-free)', () => {
    const sendUpdate = vi.fn();
    emitSaveFxPlay({
      sendUpdate,
      fx: { shape: 'burst', file: 'jb2a.impact.001.blue', source: null },
      results,
    });
    expect(sendUpdate.mock.calls[0][2].source).toBeNull();
  });

  it('no fx, no results, or no relay → silence', () => {
    const sendUpdate = vi.fn();
    emitSaveFxPlay({ sendUpdate, fx: null, results });
    emitSaveFxPlay({ sendUpdate, fx: { shape: 'burst', file: 'x' }, results: [] });
    expect(sendUpdate).not.toHaveBeenCalled();
    expect(() => emitSaveFxPlay({ sendUpdate: null, fx: { shape: 'burst', file: 'x' }, results })).not.toThrow();
  });
});
