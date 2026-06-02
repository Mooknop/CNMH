// Effects handler unit tests — cnmh_applyeffect → resolve entryIds → apply
// compendium item to each target actor. Apply-only; removal is Foundry's.
// Version-independent (all Foundry access goes through the adapter).

import { handleApplyEffect } from './effects.js';
import { makeCombat, makeCombatant, makeToken, makeActor } from './test/foundryMock.js';

function makeEffectSource(name = 'Effect: Courageous Anthem') {
  return { toObject: jest.fn().mockReturnValue({ type: 'effect', name }) };
}

function setupCombat() {
  const actor    = makeActor({ id: 'actor-pellias' });
  const actorB   = makeActor({ id: 'actor-izzy' });
  const tokA     = makeToken({ id: 'tok-pellias', actor });
  const tokB     = makeToken({ id: 'tok-izzy',    actor: actorB });
  const combat   = makeCombat({
    combatants: [
      makeCombatant({ id: 'cbt-pellias', actorId: 'actor-pellias', tokenId: 'tok-pellias' }),
      makeCombatant({ id: 'cbt-izzy',    actorId: 'actor-izzy',    tokenId: 'tok-izzy' }),
    ],
  });
  global.game.combat = combat;
  global.canvas.tokens.placeables = [tokA, tokB];
  return { actor, actorB };
}

describe('handleApplyEffect', () => {
  test('resolves a single entryId → token → actor and creates embedded document', async () => {
    const { actor } = setupCombat();
    const src = makeEffectSource();
    global.fromUuid = jest.fn().mockResolvedValue(src);

    await handleApplyEffect('Pellias', {
      ref: 'Compendium.pf2e.spell-effects.Item.abc',
      op: 'apply',
      targets: ['cbt-pellias'],
      source: 'Courageous Anthem',
      ts: 1,
    });

    expect(global.fromUuid).toHaveBeenCalledWith('Compendium.pf2e.spell-effects.Item.abc');
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith(
      'Item',
      [{ type: 'effect', name: 'Effect: Courageous Anthem' }],
      expect.objectContaining({ _bridgeSource: 'app' }),
    );
  });

  test('applies to multiple targets', async () => {
    const { actor, actorB } = setupCombat();
    global.fromUuid = jest.fn().mockResolvedValue(makeEffectSource());

    await handleApplyEffect('Pellias', {
      ref: 'Compendium.pf2e.spell-effects.Item.abc',
      targets: ['cbt-pellias', 'cbt-izzy'],
    });

    expect(actor.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(actorB.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
  });

  test('skips entryIds that resolve to no token', async () => {
    setupCombat();
    global.fromUuid = jest.fn().mockResolvedValue(makeEffectSource());

    await handleApplyEffect('Pellias', {
      ref: 'Compendium.pf2e.spell-effects.Item.abc',
      targets: ['cbt-unknown'],
    });

    // No token resolved — fromUuid never reached
    expect(global.fromUuid).not.toHaveBeenCalled();
  });

  test('does nothing when ref is missing', async () => {
    setupCombat();
    global.fromUuid = jest.fn();

    await handleApplyEffect('Pellias', { targets: ['cbt-pellias'] });
    expect(global.fromUuid).not.toHaveBeenCalled();
  });

  test('does nothing when targets is not an array', async () => {
    setupCombat();
    global.fromUuid = jest.fn();

    await handleApplyEffect('Pellias', { ref: 'Compendium.pf2e.x.Item.1' });
    expect(global.fromUuid).not.toHaveBeenCalled();
  });

  test('does nothing when value is null/missing', async () => {
    setupCombat();
    global.fromUuid = jest.fn();

    await handleApplyEffect('Pellias', null);
    await handleApplyEffect('Pellias', undefined);
    expect(global.fromUuid).not.toHaveBeenCalled();
  });

  test('no active combat — skips silently (no throw)', async () => {
    global.game.combat = null;
    global.fromUuid = jest.fn().mockResolvedValue(makeEffectSource());

    await expect(
      handleApplyEffect('Pellias', {
        ref: 'Compendium.pf2e.x.Item.1',
        targets: ['cbt-pellias'],
      })
    ).resolves.not.toThrow();
    expect(global.fromUuid).not.toHaveBeenCalled();
  });

  test('fromUuid returns null (bad UUID) — skips actor write silently', async () => {
    const { actor } = setupCombat();
    global.fromUuid = jest.fn().mockResolvedValue(null);

    await handleApplyEffect('Pellias', {
      ref: 'Compendium.pf2e.bad.Item.nope',
      targets: ['cbt-pellias'],
    });

    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });
});
