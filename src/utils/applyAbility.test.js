// Tests for the foundryEffect emission path in applyAbility.
// The existing effects[]/grants[] paths are exercised via UseAbilityModal integration
// tests; this file covers only the new foundryEffect → applyeffect sendUpdate block.

import { applyAbility } from './applyAbility';

const caster  = { id: 'Pellias', name: 'Pellias' };
const izzy    = { id: 'IzzyUncut', name: 'Izzy' };

// Minimal encounter order with two PCs.
const order = [
  { kind: 'pc', charId: 'Pellias',  entryId: 'cbt-pellias' },
  { kind: 'pc', charId: 'IzzyUncut', entryId: 'cbt-izzy' },
];

function makeArgs(abilityOverrides = {}, opts = {}) {
  const sendUpdate = jest.fn();
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
      appendLog: jest.fn(),
      verb: 'cast',
    },
    sendUpdate,
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
