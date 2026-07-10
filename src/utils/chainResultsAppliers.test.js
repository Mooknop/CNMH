// Chain-results appliers (extracted #1317 D3) — confirm-time consumption of a
// ChainedStrikeSection / ChainedSpellSection result. The UseAbilityModal chain
// suites (chainmultiray / chainattackdamage / chainsavedamage / splitshot /
// harrowcast / energyablation) stay the integration gate; these cover the two
// pure appliers directly.

import { applyChainStrikeResults, applyChainSpellResults } from './chainResultsAppliers';
import { applyAbility } from './applyAbility';
import { applyHealing } from './consumables';
import { buildChainSelfEffect } from './spellshapeTransform';
import { APP, syncKey } from '../sync/keys';

vi.mock('./applyAbility', () => ({ applyAbility: vi.fn() }));
vi.mock('./consumables', () => ({ applyHealing: vi.fn() }));
vi.mock('./spellshapeTransform', () => ({ buildChainSelfEffect: vi.fn(() => null) }));

const character = { id: 'char-a', name: 'Izzy' };
// Minimal computeTargetDamage-shaped result for formatDamageBreakdown.
const dmg = (final) => ({ final, parts: { base: final, riders: [], weaknesses: [] } });
const appendLog = vi.fn();
const logTexts = () => appendLog.mock.calls.map((c) => c[0].text);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('applyChainStrikeResults', () => {
  const ctx = { character, ability: { name: 'Inner Upheaval' }, effectiveVerb: 'use', appendLog };

  it('logs each resolved strike with degree, adjust suffix and the dice fallback', () => {
    applyChainStrikeResults({
      mode: 'single',
      strikeName: 'Fist',
      damage: '2d8+4',
      rolls: [[
        { entryId: 'e1', name: 'Goblin', dc: 15, total: 21, degree: 'success', adjust: 2, adjustSources: ['Off-guard target'] },
      ]],
    }, ctx);
    expect(logTexts()).toEqual([
      'Izzy use Inner Upheaval — Fist vs Goblin (AC 15): 21 → Hit (incl. +2: Off-guard target) · dmg 2d8+4',
    ]);
  });

  it('skips null roll sets and logs a plain dice line for empty ones', () => {
    applyChainStrikeResults({
      mode: 'single', strikeName: 'Fist', damage: '2d8+4',
      rolls: [null, []],
    }, ctx);
    expect(logTexts()).toEqual(['Izzy use Inner Upheaval — Fist · dmg 2d8+4']);
  });

  it('numbers flurry strikes and logs the combined per-target damage line', () => {
    applyChainStrikeResults({
      mode: 'flurry',
      damage: '2d8+4',
      rolls: [
        [{ entryId: 'e1', name: 'Goblin', dc: 15, total: 22, degree: 'success', damage: dmg(9) }],
        [{ entryId: 'e1', name: 'Goblin', dc: 15, total: 18, degree: 'success', damage: dmg(4) }],
      ],
    }, ctx);
    const texts = logTexts();
    expect(texts[0]).toContain('Flurry of Blows (1) vs Goblin');
    expect(texts[1]).toContain('Flurry of Blows (2) vs Goblin');
    expect(texts[2]).toBe('Flurry of Blows combined vs Goblin: 13 damage (apply resistance/weakness once)');
  });

  it('does not log a combined line when only one flurry strike dealt damage', () => {
    applyChainStrikeResults({
      mode: 'flurry',
      damage: '2d8+4',
      rolls: [
        [{ entryId: 'e1', name: 'Goblin', dc: 15, total: 22, degree: 'success', damage: dmg(9) }],
        [{ entryId: 'e1', name: 'Goblin', dc: 15, total: 8, degree: 'failure' }],
      ],
    }, ctx);
    expect(logTexts().some((t) => t.includes('combined'))).toBe(false);
  });
});

describe('applyChainSpellResults', () => {
  const addSaveRequest = vi.fn();
  const getState = vi.fn(() => []);
  const sendUpdate = vi.fn();
  const omen = { flagPendingLoss: vi.fn(), suit: 'Keys' };
  const makeResources = () => ({
    spend: vi.fn(() => ({ label: 'rank 3 slot' })),
    slots: { remainingFor: vi.fn(() => 1), spend: vi.fn() },
  });

  const baseCtx = () => ({
    character,
    ability: { name: 'Reach Spell' },
    effectiveVerb: 'cast',
    casterEntryId: 'e-caster',
    targetCharIds: [],
    order: [],
    encounter: { round: 1 },
    characters: [character, { id: 'char-b', name: 'Jade' }],
    getState,
    sendUpdate,
    appendLog,
    addSaveRequest,
    resources: makeResources(),
    omen,
    nowSecs: 1000,
  });

  const baseResults = { spellName: 'Ignition', castRank: 3, spellRank: 3 };

  it('spends the picked cast option and folds its label into the log', () => {
    const ctx = baseCtx();
    const castOption = { enabled: true, type: 'slot', rank: 3 };
    applyChainSpellResults({ ...baseResults, castOption }, ctx);
    expect(ctx.resources.spend).toHaveBeenCalledWith(castOption);
    expect(logTexts()).toEqual(['Izzy cast Reach Spell → Ignition (rank 3 slot)']);
  });

  it('notes an exhausted cast option without spending', () => {
    const ctx = baseCtx();
    applyChainSpellResults({ ...baseResults, castOption: { enabled: false, rank: 3 } }, ctx);
    expect(ctx.resources.spend).not.toHaveBeenCalled();
    expect(logTexts()[0]).toContain('(no rank-3 slots left — not spent)');
  });

  it('falls back to the native-rank slot spend when the section reported no option', () => {
    const ctx = baseCtx();
    applyChainSpellResults({ ...baseResults }, ctx);
    expect(ctx.resources.slots.spend).toHaveBeenCalledWith(3);
    expect(logTexts()[0]).toContain('(rank 3 slot)');
  });

  it('notes the empty native-rank pool without spending', () => {
    const ctx = baseCtx();
    ctx.resources.slots.remainingFor = vi.fn(() => 0);
    applyChainSpellResults({ ...baseResults }, ctx);
    expect(ctx.resources.slots.spend).not.toHaveBeenCalled();
    expect(logTexts()[0]).toContain('(no rank-3 slots left — not spent)');
  });

  it('logs per-target roll results, suppressing damage on the Split Shot second target', () => {
    const ctx = baseCtx();
    applyChainSpellResults({
      ...baseResults,
      castOption: { enabled: true },
      modifier: 'Split Shot',
      rollProfile: { defense: 'ac' },
      splitShot: { secondaryEntryId: 'e2' },
      rollResults: [
        { entryId: 'e1', name: 'Goblin', total: 25, degree: 'success', damage: dmg(12) },
        { entryId: 'e2', name: 'Orc', total: 25, degree: 'success', damage: dmg(12) },
      ],
    }, ctx);
    const texts = logTexts();
    expect(texts[0]).toContain('Ignition [Split Shot] (rank 3 slot) vs Goblin: 25 → Hit · damage');
    expect(texts[1]).toContain('vs Orc: 25 → Hit · second target — half damage, no other effects');
    expect(texts[1]).not.toContain('· damage');
  });

  it('normalises multi-ray grouped results and prefixes the ray number', () => {
    const ctx = baseCtx();
    applyChainSpellResults({
      ...baseResults,
      castOption: { enabled: true },
      multiRay: true,
      rollProfile: { defense: 'ac' },
      rollResults: [
        { rayIndex: 0, results: [{ entryId: 'e1', name: 'Goblin', total: 20, degree: 'success' }] },
        { rayIndex: 1, results: [{ entryId: 'e1', name: 'Goblin', total: 9, degree: 'failure' }] },
      ],
    }, ctx);
    const texts = logTexts();
    expect(texts[0]).toContain('— ray 1 vs Goblin: 20 → Hit');
    expect(texts[1]).toContain('— ray 2 vs Goblin: 9 → Miss');
  });

  it('logs a plain cast line when the chained spell had no roll', () => {
    const ctx = baseCtx();
    applyChainSpellResults({ ...baseResults, castOption: { enabled: true } }, ctx);
    expect(logTexts()).toEqual(['Izzy cast Reach Spell → Ignition (rank 3 slot)']);
  });

  it('pushes the chained save request with mapped save mods and damage', () => {
    const ctx = baseCtx();
    const damage = { entered: 14, expression: '6d6', typeLabel: 'fire', riders: [] };
    applyChainSpellResults({
      ...baseResults,
      castOption: { enabled: true },
      spellBasic: true,
      rollProfile: { mode: 'target-save', defense: 'reflex', dc: 21 },
      saveTargets: [
        { entryId: 'e1', name: 'Goblin', defenses: { saves: { reflex: 6 } } },
        { entryId: 'e2', name: 'Orc' },
      ],
      damage,
    }, ctx);
    expect(addSaveRequest).toHaveBeenCalledWith({
      casterId: 'char-a',
      casterName: 'Izzy',
      abilityName: 'Reach Spell → Ignition',
      save: 'reflex',
      dc: 21,
      basic: true,
      rank: 3,
      targets: [
        { entryId: 'e1', name: 'Goblin', saveMod: 6 },
        { entryId: 'e2', name: 'Orc', saveMod: null },
      ],
      damage,
    });
  });

  it('harrow draw logs the card + flat check and flags the pending omen loss on a failure', () => {
    const ctx = baseCtx();
    applyChainSpellResults({
      ...baseResults,
      castOption: { enabled: true },
      harrow: { drawnSuit: 'Shields', match: true, flatD20: 3, flatPassed: false },
    }, ctx);
    const texts = logTexts();
    expect(texts[1]).toBe('Izzy draws Shields — omen match! — flat check DC 11: 3 (failed)');
    expect(omen.flagPendingLoss).toHaveBeenCalledTimes(1);
    expect(texts[2]).toContain("Izzy's harrow omen (Keys) will be lost at the end of their turn");
  });

  it('harrow self-effect suits apply a catalog effect on the caster', () => {
    const ctx = baseCtx();
    applyChainSpellResults({
      ...baseResults,
      castOption: { enabled: true },
      harrow: { drawnSuit: 'Keys', flatD20: 15, flatPassed: true, effect: { kind: 'self-effect', effectId: 'harrow-keys' } },
    }, ctx);
    expect(applyAbility).toHaveBeenCalledTimes(1);
    expect(applyAbility.mock.calls[0][0]).toMatchObject({
      ability: {
        name: 'Harrow Casting — Keys',
        effects: [{ effectId: 'harrow-keys', applyTo: 'self', duration: { until: 'caster-turn-start' } }],
      },
      verb: 'gains',
    });
    expect(omen.flagPendingLoss).not.toHaveBeenCalled();
  });

  it('harrow self-heal applies the entered healing to the caster', () => {
    const ctx = baseCtx();
    applyChainSpellResults({
      ...baseResults,
      castOption: { enabled: true },
      harrow: { drawnSuit: 'Shields', flatPassed: true, healEntered: 7, effect: { kind: 'self-heal', note: 'roll it' } },
    }, ctx);
    expect(applyHealing).toHaveBeenCalledWith(expect.objectContaining({
      target: character,
      amount: 7,
      logText: 'Izzy healed 7 HP (Harrow Casting — Shields)',
    }));
  });

  it('harrow target-heal heals the picked ally and grants its rider effect', () => {
    const ctx = { ...baseCtx(), targetCharIds: ['char-b'] };
    applyChainSpellResults({
      ...baseResults,
      castOption: { enabled: true },
      harrow: { drawnSuit: 'Stars', flatPassed: true, healEntered: 5, effect: { kind: 'target-heal', effectId: 'harrow-stars', note: 'n' } },
    }, ctx);
    expect(applyHealing).toHaveBeenCalledWith(expect.objectContaining({
      target: { id: 'char-b', name: 'Jade' },
      amount: 5,
    }));
    expect(applyAbility).toHaveBeenCalledWith(expect.objectContaining({
      targetCharIds: ['char-b'],
      verb: 'grants',
    }));
  });

  it('note-only harrow effects log a system reminder', () => {
    const ctx = baseCtx();
    applyChainSpellResults({
      ...baseResults,
      castOption: { enabled: true },
      harrow: { drawnSuit: 'Hammers', flatPassed: true, effect: { kind: 'note', note: 'extra damage rider' } },
    }, ctx);
    expect(appendLog).toHaveBeenCalledWith({ type: 'system', text: 'Izzy — Hammers: extra damage rider' });
    expect(applyAbility).not.toHaveBeenCalled();
    expect(applyHealing).not.toHaveBeenCalled();
  });

  it('spellshape self-effect appends to the effects overlay, persists and logs (#1001 S2)', () => {
    const ctx = baseCtx();
    ctx.ability = { name: 'Energy Ablation', chain: { selfEffect: { kind: 'resistance' } } };
    const existing = [{ id: 'prior' }];
    ctx.getState = vi.fn(() => existing);
    const built = {
      name: 'Energy Ablation (fire)',
      modifiers: [{ stat: 'resistance', amount: 3, vs: 'fire' }],
    };
    buildChainSelfEffect.mockReturnValueOnce(built);
    applyChainSpellResults({ ...baseResults, castOption: { enabled: true }, selfEffectChoice: 'fire' }, ctx);
    expect(buildChainSelfEffect).toHaveBeenCalledWith(expect.objectContaining({
      selfEffect: { kind: 'resistance' },
      castRank: 3,
      choice: 'fire',
      caster: character,
      abilityName: 'Energy Ablation',
    }));
    const nextEffects = [...existing, built];
    expect(sendUpdate).toHaveBeenCalledWith('char-a', APP.EFFECTS, nextEffects);
    expect(window.localStorage.getItem(syncKey(APP.EFFECTS, 'char-a'))).toBe(JSON.stringify(nextEffects));
    expect(logTexts().at(-1)).toBe('Izzy gains Energy Ablation (fire) (resistance 3 vs fire)');
  });

  it('no spellshape effect is written when the parent has no chain.selfEffect', () => {
    const ctx = baseCtx();
    applyChainSpellResults({ ...baseResults, castOption: { enabled: true } }, ctx);
    expect(buildChainSelfEffect).not.toHaveBeenCalled();
    expect(sendUpdate).not.toHaveBeenCalled();
  });
});
