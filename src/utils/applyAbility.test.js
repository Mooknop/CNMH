// Tests for the foundryEffect emission path in applyAbility.
// The existing effects[]/grants[] paths are exercised via UseAbilityModal integration
// tests; this file covers only the new foundryEffect → applyeffect sendUpdate block.

import { applyAbility, applyRiderChoice } from './applyAbility';

const caster  = { id: 'Pellias', name: 'Pellias' };
const izzy    = { id: 'IzzyUncut', name: 'Izzy' };

// Minimal encounter order with two PCs.
const order = [
  { kind: 'pc', charId: 'Pellias',  entryId: 'cbt-pellias' },
  { kind: 'pc', charId: 'IzzyUncut', entryId: 'cbt-izzy' },
];

function makeArgs(abilityOverrides = {}, opts = {}) {
  const sendUpdate = vi.fn();
  const appendLog = vi.fn();
  return {
    args: {
      ability: {
        name: 'Courageous Anthem',
        effects: [],
        grants: [],
        ...abilityOverrides,
      },
      caster,
      casterEntryId: 'cbt-pellias',
      targetCharIds: opts.targetCharIds ?? [],
      enemyTargetNames: [],
      order,
      encounter: {},
      characters: [caster, izzy],
      getState: () => [],
      sendUpdate,
      appendLog,
      verb: 'cast',
    },
    sendUpdate,
    appendLog,
  };
}

describe('applyAbility — foundryEffect emission', () => {
  it('emits applyeffect when ability has a foundryEffect ref', () => {
    const { args, sendUpdate } = makeArgs({
      foundryEffect: { ref: 'Compendium.pf2e.spell-effects.Item.abc', applyTo: 'all-allies' },
    });

    applyAbility(args);

    const call = sendUpdate.mock.calls.find(([, key]) => key === 'applyeffect');
    expect(call).toBeDefined();
    const [charId, , payload] = call;
    expect(charId).toBe('Pellias');
    expect(payload.ref).toBe('Compendium.pf2e.spell-effects.Item.abc');
    expect(payload.op).toBe('apply');
    expect(payload.targets).toEqual(['cbt-pellias', 'cbt-izzy']); // all-allies
    expect(payload.source).toBe('Courageous Anthem');
    expect(typeof payload.ts).toBe('number');
  });

  it('defaults applyTo to self when not set', () => {
    const { args, sendUpdate } = makeArgs({
      foundryEffect: { ref: 'Compendium.pf2e.spell-effects.Item.xyz' },
    });

    applyAbility(args);

    const call = sendUpdate.mock.calls.find(([, key]) => key === 'applyeffect');
    expect(call).toBeDefined();
    expect(call[2].targets).toEqual(['cbt-pellias']); // self only
  });

  it('resolves target entryIds for applyTo: target using targetCharIds', () => {
    const { args, sendUpdate } = makeArgs(
      { foundryEffect: { ref: 'Compendium.pf2e.spell-effects.Item.xyz', applyTo: 'target' } },
      { targetCharIds: ['IzzyUncut'] },
    );

    applyAbility(args);

    const call = sendUpdate.mock.calls.find(([, key]) => key === 'applyeffect');
    expect(call[2].targets).toEqual(['cbt-izzy']);
  });

  it('does not emit applyeffect when foundryEffect is absent', () => {
    const { args, sendUpdate } = makeArgs({ foundryEffect: undefined });

    applyAbility(args);

    expect(sendUpdate.mock.calls.some(([, key]) => key === 'applyeffect')).toBe(false);
  });

  it('does not emit applyeffect when ref is empty', () => {
    const { args, sendUpdate } = makeArgs({ foundryEffect: { ref: '', applyTo: 'self' } });

    applyAbility(args);

    expect(sendUpdate.mock.calls.some(([, key]) => key === 'applyeffect')).toBe(false);
  });

  it('filters out null entryIds (entryId missing from order)', () => {
    const { args, sendUpdate } = makeArgs(
      { foundryEffect: { ref: 'Compendium.pf2e.spell-effects.Item.abc', applyTo: 'target' } },
      { targetCharIds: ['UnknownChar'] }, // not in order → entryId null
    );

    applyAbility(args);

    const call = sendUpdate.mock.calls.find(([, key]) => key === 'applyeffect');
    // null entryId filtered; targets is empty (still sends so bridge can no-op gracefully)
    expect(call[2].targets).toEqual([]);
  });
});

describe('applyAbility — daily-prep effect flag', () => {
  it('flags expireOnDailyPrep on an until:daily-prep effect', () => {
    const { args, sendUpdate } = makeArgs({
      effects: [{ effectId: 'mystic-armor', applyTo: 'self', duration: { until: 'daily-prep' } }],
    });
    applyAbility(args);
    const call = sendUpdate.mock.calls.find(([, key]) => key === 'effects');
    expect(call[2][0]).toMatchObject({ effectId: 'mystic-armor', expireOnDailyPrep: true });
    expect(call[2][0].expireAt).toBeUndefined();
  });

  it('does not flag a normal encounter-boundary effect', () => {
    const { args, sendUpdate } = makeArgs({
      effects: [{ effectId: 'heroism-1', applyTo: 'self', duration: { until: 'round-end' } }],
    });
    applyAbility(args);
    const call = sendUpdate.mock.calls.find(([, key]) => key === 'effects');
    expect(call[2][0].expireOnDailyPrep).toBeUndefined();
  });
});

describe('applyAbility — minute durations (#225)', () => {
  it('stamps expireAtSecs from duration.minutes when nowSecs is provided', () => {
    const { args, sendUpdate } = makeArgs({
      effects: [{ effectId: 'eld-rust-cloud', applyTo: 'self', duration: { minutes: 10 } }],
    });
    applyAbility({ ...args, nowSecs: 1000 });
    const call = sendUpdate.mock.calls.find(([, key]) => key === 'effects');
    expect(call[2][0]).toMatchObject({ effectId: 'eld-rust-cloud', expireAtSecs: 1600 });
    expect(call[2][0].expireAt).toBeUndefined();
  });

  it('falls back to no expiry when nowSecs is missing', () => {
    const { args, sendUpdate } = makeArgs({
      effects: [{ effectId: 'eld-rust-cloud', applyTo: 'self', duration: { minutes: 10 } }],
    });
    applyAbility(args);
    const call = sendUpdate.mock.calls.find(([, key]) => key === 'effects');
    expect(call[2][0].expireAtSecs).toBeUndefined();
    expect(call[2][0].expireAt).toBeUndefined();
  });
});

describe('applyAbility — effectDurationOverride (Lingering Composition #226-B)', () => {
  it('replaces the authored duration so expireAt reflects the override rounds', () => {
    const { args, sendUpdate } = makeArgs({
      effects: [{ effectId: 'inspire-courage', applyTo: 'self', duration: { until: 'rounds', rounds: 1 } }],
    });
    applyAbility({ ...args, effectDurationOverride: { until: 'rounds', rounds: 3 } });
    const call = sendUpdate.mock.calls.find(([, key]) => key === 'effects');
    // encounter.round defaults to 1; resolveExpireAt for rounds:3 → round 1+3 = 4.
    expect(call[2][0].expireAt).toEqual({ round: 4, entryId: 'cbt-pellias', boundary: 'turn-end' });
  });

  it('leaves the authored 1-round duration intact without the override', () => {
    const { args, sendUpdate } = makeArgs({
      effects: [{ effectId: 'inspire-courage', applyTo: 'self', duration: { until: 'rounds', rounds: 1 } }],
    });
    applyAbility(args);
    const call = sendUpdate.mock.calls.find(([, key]) => key === 'effects');
    // Native 1 round → round 1+1 = 2.
    expect(call[2][0].expireAt).toEqual({ round: 2, entryId: 'cbt-pellias', boundary: 'turn-end' });
  });

  it('does not override an effect that has no authored duration', () => {
    const { args, sendUpdate } = makeArgs({
      effects: [{ effectId: 'inspire-courage', applyTo: 'self' }],
    });
    applyAbility({ ...args, effectDurationOverride: { until: 'rounds', rounds: 3 } });
    const call = sendUpdate.mock.calls.find(([, key]) => key === 'effects');
    expect(call[2][0].expireAt).toBeUndefined();
  });
});

describe('applyRiderChoice (#225)', () => {
  const ability = { name: 'Electric Surge' };
  const makeRiderArgs = (option, currentEffects = []) => {
    const sendUpdate = vi.fn();
    const appendLog = vi.fn();
    return {
      args: {
        option,
        ability,
        caster,
        casterEntryId: 'cbt-pellias',
        encounter: {},
        nowSecs: 1000,
        getState: () => currentEffects,
        sendUpdate,
        appendLog,
      },
      sendUpdate,
      appendLog,
    };
  };

  it('applies the option effect to the caster and logs the choice', () => {
    const { args, sendUpdate, appendLog } = makeRiderArgs({
      id: 'charge', label: 'Become Charged', appliesEffect: { effectId: 'eld-charged' },
    });
    applyRiderChoice(args);
    const call = sendUpdate.mock.calls.find(([, key]) => key === 'effects');
    expect(call[0]).toBe('Pellias');
    expect(call[2]).toHaveLength(1);
    expect(call[2][0]).toMatchObject({ effectId: 'eld-charged', appliedBy: 'Pellias', source: 'Electric Surge' });
    expect(appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Pellias chose Become Charged (Electric Surge)' })
    );
  });

  it('removes the consumed effect on a discharge-style option, noting it in the log', () => {
    const existing = [
      { id: 'e1', effectId: 'eld-charged' },
      { id: 'e2', effectId: 'heroism-1' },
    ];
    const { args, sendUpdate, appendLog } = makeRiderArgs(
      { id: 'discharge', label: 'Discharge', note: '40-foot line and d8s', removesEffectId: 'eld-charged' },
      existing,
    );
    applyRiderChoice(args);
    const call = sendUpdate.mock.calls.find(([, key]) => key === 'effects');
    expect(call[2]).toEqual([{ id: 'e2', effectId: 'heroism-1' }]);
    expect(appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Pellias chose Discharge (Electric Surge) — 40-foot line and d8s' })
    );
  });

  it('logs without writing state when the option changes nothing', () => {
    const { args, sendUpdate, appendLog } = makeRiderArgs(
      { id: 'discharge', label: 'Discharge', removesEffectId: 'eld-charged' },
      [], // nothing to remove
    );
    applyRiderChoice(args);
    expect(sendUpdate).not.toHaveBeenCalled();
    expect(appendLog).toHaveBeenCalledTimes(1);
  });

  it('no-ops entirely without an option', () => {
    const { args, sendUpdate, appendLog } = makeRiderArgs(null);
    applyRiderChoice(args);
    expect(sendUpdate).not.toHaveBeenCalled();
    expect(appendLog).not.toHaveBeenCalled();
  });
});

describe('applyAbility — heightened cast rank (#235)', () => {
  it('decorates effect log lines with the rank when provided', () => {
    const { args, appendLog } = makeArgs({
      effects: [{ effectId: 'heroism-1', applyTo: 'self', duration: { until: 'round-end' } }],
    });
    applyAbility({ ...args, rank: 3 });
    expect(appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Pellias cast Courageous Anthem (rank 3) on Pellias' })
    );
  });

  it('leaves log lines unchanged without a rank', () => {
    const { args, appendLog } = makeArgs({
      effects: [{ effectId: 'heroism-1', applyTo: 'self', duration: { until: 'round-end' } }],
    });
    applyAbility(args);
    expect(appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Pellias cast Courageous Anthem on Pellias' })
    );
  });
});
