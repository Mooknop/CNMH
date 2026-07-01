import {
  applyChainTransform, chainTransformCostNote, buildChainSelfEffect, selfEffectDescriptor,
} from './spellshapeTransform';

describe('applyChainTransform', () => {
  it('reduces a numeric action cost by the delta, clamped to the minimum', () => {
    expect(applyChainTransform(3, { actionDelta: -1 })).toBe(2);
    expect(applyChainTransform(2, { actionDelta: -1 })).toBe(1);
    expect(applyChainTransform(1, { actionDelta: -1 })).toBe(1); // min 1 default
  });

  it('honours an explicit minActions floor', () => {
    expect(applyChainTransform(2, { actionDelta: -3, minActions: 0 })).toBe(0);
    expect(applyChainTransform(2, { actionDelta: -3 })).toBe(1);
  });

  it('supports a positive delta too', () => {
    expect(applyChainTransform(1, { actionDelta: 1 })).toBe(2);
  });

  it('is a no-op without a numeric actionDelta', () => {
    expect(applyChainTransform(2, null)).toBe(2);
    expect(applyChainTransform(2, {})).toBe(2);
    expect(applyChainTransform(2, { actionDelta: 'x' })).toBe(2);
  });

  it('passes non-numeric costs through unchanged', () => {
    expect(applyChainTransform('reaction', { actionDelta: -1 })).toBe('reaction');
    expect(applyChainTransform('free', { actionDelta: -1 })).toBe('free');
  });
});

describe('chainTransformCostNote', () => {
  it('describes a reduction', () => {
    expect(chainTransformCostNote(2, { actionDelta: -1 })).toBe('Spellshape: −1 action (now 1)');
    expect(chainTransformCostNote(3, { actionDelta: -1 })).toBe('Spellshape: −1 action (now 2)');
  });

  it('returns null when the cost does not change', () => {
    expect(chainTransformCostNote(1, { actionDelta: -1 })).toBeNull(); // clamped, no change
    expect(chainTransformCostNote(2, null)).toBeNull();
    expect(chainTransformCostNote('reaction', { actionDelta: -1 })).toBeNull();
  });
});

const ENERGY_ABLATION = {
  effectId: 'energy-ablation',
  name: 'Energy Ablation',
  stat: 'resistance',
  amount: 'castRank',
  choose: { key: 'vs', label: 'Energy type', options: ['acid', 'cold', 'electricity', 'fire', 'force', 'sonic', 'vitality', 'void'] },
  duration: { until: 'rounds', rounds: 1 },
};

describe('selfEffectDescriptor', () => {
  it('prefers the choice, else the first option, else vs, else null', () => {
    expect(selfEffectDescriptor(ENERGY_ABLATION, 'fire')).toBe('fire');
    expect(selfEffectDescriptor(ENERGY_ABLATION, null)).toBe('acid'); // first option
    expect(selfEffectDescriptor({ vs: 'cold' }, null)).toBe('cold');
    expect(selfEffectDescriptor({}, null)).toBeNull();
    expect(selfEffectDescriptor(null, 'fire')).toBeNull();
  });
});

describe('buildChainSelfEffect', () => {
  const caster = { id: 'wiz', name: 'Wizzo' };
  const encounter = { active: true, round: 1 };
  const base = { selfEffect: ENERGY_ABLATION, caster, abilityName: 'Energy Ablation', casterEntryId: 'c1', encounter };

  it('parametrizes the amount from the cast rank and vs from the choice', () => {
    const e = buildChainSelfEffect({ ...base, castRank: 3, choice: 'fire' });
    expect(e.modifiers).toEqual([{ stat: 'resistance', vs: 'fire', amount: 3 }]);
    expect(e.effectId).toBe('energy-ablation');
    expect(e.name).toBe('Energy Ablation (fire)');
    expect(e.source).toBe('Energy Ablation');
    expect(e.appliedBy).toBe('wiz');
    expect(e.expireAt).toBeTruthy(); // {until:'rounds',rounds:1} → an encounter boundary
    expect(e.id).toBeTruthy();
  });

  it('defaults vs to the first offered option when no choice is made', () => {
    const e = buildChainSelfEffect({ ...base, castRank: 5 });
    expect(e.modifiers).toEqual([{ stat: 'resistance', vs: 'acid', amount: 5 }]);
  });

  it('supports a fixed numeric amount instead of castRank', () => {
    const e = buildChainSelfEffect({ ...base, selfEffect: { ...ENERGY_ABLATION, amount: 2 }, castRank: 9, choice: 'cold' });
    expect(e.modifiers[0].amount).toBe(2);
  });

  it('returns null when there is nothing to apply', () => {
    expect(buildChainSelfEffect({ ...base, castRank: 0, choice: 'fire' })).toBeNull(); // amount 0
    expect(buildChainSelfEffect({ ...base, selfEffect: { stat: 'resistance', amount: 'castRank' }, castRank: 3 })).toBeNull(); // no descriptor
    expect(buildChainSelfEffect({ ...base, selfEffect: null, castRank: 3 })).toBeNull();
  });
});
