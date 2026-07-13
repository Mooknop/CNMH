// FX animation catalog resolver + strike emit (#1416, epic #1414).
import { describe, it, expect, vi } from 'vitest';
import { resolveFxRule, strikeFxFacts, emitStrikeFxPlay } from './fxPlay';

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
    });
  });

  it('classifies ranged strikes', () => {
    expect(strikeFxFacts({ name: 'Hammer Throw', type: 'ranged' }).rangeType).toBe('ranged');
  });
});

describe('emitStrikeFxPlay', () => {
  const hit = (entryId, degree = 'success') => ({ entryId, degree });
  const base = () => ({
    sendUpdate: vi.fn(),
    fxAnimations: RULES,
    ability: { name: 'Longsword Strike', damageType: 'slashing' },
    casterEntryId: 'cbt-pc',
    rayGroups: [{ results: [hit('cbt-a'), hit('cbt-b', 'failure')] }],
    chainResults: null,
  });

  it('emits the resolved recipe for hit targets only', () => {
    const args = base();
    emitStrikeFxPlay(args);
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
    emitStrikeFxPlay(args);
    expect(args.sendUpdate.mock.calls[0][2].targets).toEqual(['cbt-a', 'cbt-c']);
  });

  it('carries rule opts through to the payload', () => {
    const args = base();
    args.ability = { name: 'Vindicator Slash', damageType: 'slashing' };
    emitStrikeFxPlay(args);
    expect(args.sendUpdate.mock.calls[0][2].opts).toEqual({ tint: '#ffd700' });
  });

  it('emits nothing when: no hits, no matching rule, no caster, no relay', () => {
    const noHits = base();
    noHits.rayGroups = [{ results: [hit('cbt-a', 'failure')] }];
    emitStrikeFxPlay(noHits);
    expect(noHits.sendUpdate).not.toHaveBeenCalled();

    const noRule = base();
    noRule.fxAnimations = [];
    emitStrikeFxPlay(noRule);
    expect(noRule.sendUpdate).not.toHaveBeenCalled();

    const noCaster = base();
    noCaster.casterEntryId = null;
    emitStrikeFxPlay(noCaster);
    expect(noCaster.sendUpdate).not.toHaveBeenCalled();

    expect(() => emitStrikeFxPlay({ ...base(), sendUpdate: null })).not.toThrow();
  });
});
