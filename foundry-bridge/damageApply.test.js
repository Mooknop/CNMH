// Damage-apply handler unit tests (#1016) — cnmh_dmgapply_global → resolve
// entryIds → apply typed damage through PF2e's actor.applyDamage (IWR nets
// Foundry-side) → ack on cnmh_dmgdone_global.

import { initDamageApply, handleDamageApply } from './damageApply.js';
import { makeCombat, makeCombatant, makeToken, makeActor } from './test/foundryMock.js';

function setupCombat() {
  const goblin = makeActor({ id: 'actor-gob', name: 'Goblin Warrior' });
  const troll  = makeActor({ id: 'actor-troll', name: 'Troll' });
  const tokG   = makeToken({ id: 'tok-gob',   actor: goblin });
  const tokT   = makeToken({ id: 'tok-troll', actor: troll });
  const combat = makeCombat({
    combatants: [
      makeCombatant({ id: 'cbt-gob',   actorId: 'actor-gob',   tokenId: 'tok-gob' }),
      makeCombatant({ id: 'cbt-troll', actorId: 'actor-troll', tokenId: 'tok-troll' }),
    ],
  });
  global.game.combat = combat;
  global.canvas.tokens.placeables = [tokG, tokT];
  return { goblin, troll };
}

describe('handleDamageApply', () => {
  let sendUpdate;

  beforeEach(() => {
    sendUpdate = jest.fn();
    initDamageApply(sendUpdate);
  });

  test('applies a typed hit through the actor and acks it', async () => {
    const { goblin } = setupCombat();

    await handleDamageApply({
      id: 'dmg-1',
      sourceName: 'Fireball',
      hits: [{ entryId: 'cbt-gob', name: 'Goblin Warrior', amount: 8, type: 'fire' }],
      ts: 1,
    });

    expect(goblin.applyDamage).toHaveBeenCalledTimes(1);
    const arg = goblin.applyDamage.mock.calls[0][0];
    expect(arg.damage.formula).toBe('8[fire]'); // typed DamageRoll → PF2e nets IWR
    expect(arg.damage.evaluated).toBe(true);
    expect(sendUpdate).toHaveBeenCalledWith('global', 'dmgdone', expect.objectContaining({
      id: 'dmg-1',
      sourceName: 'Fireball',
      applied: [{ entryId: 'cbt-gob', name: 'Goblin Warrior', amount: 8, type: 'fire' }],
      failed: [],
    }));
  });

  test('applies to multiple targets independently', async () => {
    const { goblin, troll } = setupCombat();

    await handleDamageApply({
      id: 'dmg-2',
      sourceName: 'Chain Lightning',
      hits: [
        { entryId: 'cbt-gob',   name: 'Goblin Warrior', amount: 12, type: 'electricity' },
        { entryId: 'cbt-troll', name: 'Troll',          amount: 6,  type: 'electricity' },
      ],
    });

    expect(goblin.applyDamage).toHaveBeenCalledTimes(1);
    expect(troll.applyDamage).toHaveBeenCalledTimes(1);
    const ack = sendUpdate.mock.calls[0][2];
    expect(ack.applied).toHaveLength(2);
    expect(ack.failed).toHaveLength(0);
  });

  test('untyped hits apply as a plain number (no IWR path)', async () => {
    const { goblin } = setupCombat();

    await handleDamageApply({
      id: 'dmg-3',
      hits: [{ entryId: 'cbt-gob', name: 'Goblin Warrior', amount: 5, type: '' }],
    });

    expect(goblin.applyDamage).toHaveBeenCalledWith(
      expect.objectContaining({ damage: 5 })
    );
  });

  test('unresolvable entryIds land in failed, others still apply', async () => {
    const { goblin } = setupCombat();

    await handleDamageApply({
      id: 'dmg-4',
      sourceName: 'Fireball',
      hits: [
        { entryId: 'cbt-unknown', name: 'Ghost', amount: 8, type: 'fire' },
        { entryId: 'cbt-gob',     name: 'Goblin Warrior', amount: 8, type: 'fire' },
      ],
    });

    expect(goblin.applyDamage).toHaveBeenCalledTimes(1);
    const ack = sendUpdate.mock.calls[0][2];
    expect(ack.applied).toEqual([expect.objectContaining({ entryId: 'cbt-gob' })]);
    expect(ack.failed).toEqual([{ entryId: 'cbt-unknown', name: 'Ghost' }]);
  });

  test('non-positive / non-numeric amounts fail without touching the actor', async () => {
    const { goblin } = setupCombat();

    await handleDamageApply({
      id: 'dmg-5',
      hits: [
        { entryId: 'cbt-gob', name: 'Goblin Warrior', amount: 0, type: 'fire' },
        { entryId: 'cbt-gob', name: 'Goblin Warrior', amount: 'lots', type: 'fire' },
      ],
    });

    expect(goblin.applyDamage).not.toHaveBeenCalled();
    expect(sendUpdate.mock.calls[0][2].failed).toHaveLength(2);
  });

  test('an applyDamage throw is caught, failed, and does not stop later hits', async () => {
    const { goblin, troll } = setupCombat();
    goblin.applyDamage.mockRejectedValueOnce(new Error('boom'));

    await handleDamageApply({
      id: 'dmg-6',
      hits: [
        { entryId: 'cbt-gob',   name: 'Goblin Warrior', amount: 8, type: 'fire' },
        { entryId: 'cbt-troll', name: 'Troll',          amount: 4, type: 'fire' },
      ],
    });

    expect(troll.applyDamage).toHaveBeenCalledTimes(1);
    const ack = sendUpdate.mock.calls[0][2];
    expect(ack.failed).toEqual([{ entryId: 'cbt-gob', name: 'Goblin Warrior' }]);
    expect(ack.applied).toEqual([expect.objectContaining({ entryId: 'cbt-troll' })]);
  });

  test('does nothing (no ack) for empty / missing hits', async () => {
    setupCombat();
    await handleDamageApply({ id: 'dmg-7', hits: [] });
    await handleDamageApply({ id: 'dmg-8' });
    await handleDamageApply(null);
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  test('no active combat — every hit fails, ack still sent', async () => {
    global.game.combat = null;

    await handleDamageApply({
      id: 'dmg-9',
      hits: [{ entryId: 'cbt-gob', name: 'Goblin Warrior', amount: 8, type: 'fire' }],
    });

    const ack = sendUpdate.mock.calls[0][2];
    expect(ack.applied).toHaveLength(0);
    expect(ack.failed).toEqual([{ entryId: 'cbt-gob', name: 'Goblin Warrior' }]);
  });
});
