// Native NPC strike execution (#1531 S3): attack variants, damage/crit,
// target pre-set, and the ok:false nack paths.

import { initStrikes, handleStrikeRequest } from './strikes.js';
import { RELAY } from './syncKeys.js';
import { makeActor, makeToken, makeCombat, makeCombatant, makeNpcStrike } from './test/foundryMock.js';

const lastAck = (send) => {
  const call = send.mock.calls.filter((c) => c[1] === RELAY.STRIKEDONE).at(-1);
  return call ? call[2] : null;
};

const CHECK_ROLL = {
  total: 24,
  dice: [{ faces: 20, results: [{ result: 14, active: true }] }],
  options: { degreeOfSuccess: 2 },
};

const DAMAGE_ROLL = {
  total: 12,
  dice: [{ faces: 8, results: [{ result: 5, active: true }, { result: 3, active: true }] }],
};

// Enemy combatant cbt-gob with a mocked strike, PC combatant cbt-pellias as a
// target candidate.
function strikeWorld(send) {
  initStrikes(send);
  const strike = makeNpcStrike();
  strike.variants[0].roll = jest.fn().mockResolvedValue(CHECK_ROLL);
  strike.variants[2].roll = jest.fn().mockResolvedValue({ ...CHECK_ROLL, total: 14 });
  strike.damage = jest.fn().mockResolvedValue(DAMAGE_ROLL);
  strike.critical = jest.fn().mockResolvedValue({ ...DAMAGE_ROLL, total: 24 });
  const goblin = makeActor({ id: 'actor-gob', name: 'Goblin Warrior', strikes: [strike] });
  const pc = makeActor({ id: 'actor-pellias', name: 'Pellias' });
  const tokG = makeToken({ id: 'tok-gob', actor: goblin });
  const tokP = makeToken({ id: 'tok-pellias', actor: pc });
  global.game.combat = makeCombat({
    combatants: [
      makeCombatant({ id: 'cbt-gob', actorId: 'actor-gob', actor: goblin, tokenId: 'tok-gob' }),
      makeCombatant({ id: 'cbt-pellias', actorId: 'actor-pellias', actor: pc, tokenId: 'tok-pellias' }),
    ],
  });
  global.canvas.tokens.placeables = [tokG, tokP];
  return { strike };
}

describe('strike rail (#1531 S3)', () => {
  test('attack variant rolls through the strike pipeline and acks total/faces/degree', async () => {
    const send = jest.fn();
    const { strike } = strikeWorld(send);

    await handleStrikeRequest({ id: 's1', entryId: 'cbt-gob', actionIndex: 0, variant: 0, ts: 1 });

    expect(strike.variants[0].roll).toHaveBeenCalled();
    expect(lastAck(send)).toEqual(expect.objectContaining({
      id: 's1', ok: true, mode: 'attack', total: 24, degree: 2, faces: [[20, 14]],
    }));
  });

  test('the MAP variant index picks the matching ladder step', async () => {
    const send = jest.fn();
    const { strike } = strikeWorld(send);
    await handleStrikeRequest({ id: 's2', entryId: 'cbt-gob', actionIndex: 0, variant: 2, ts: 1 });
    expect(strike.variants[2].roll).toHaveBeenCalled();
    expect(lastAck(send).total).toBe(14);
  });

  test('damage and critical route to the strike damage methods', async () => {
    const send = jest.fn();
    const { strike } = strikeWorld(send);

    await handleStrikeRequest({ id: 's3', entryId: 'cbt-gob', actionIndex: 0, damage: 'roll', ts: 1 });
    expect(strike.damage).toHaveBeenCalled();
    expect(lastAck(send)).toEqual(expect.objectContaining({ ok: true, mode: 'roll', total: 12 }));

    await handleStrikeRequest({ id: 's4', entryId: 'cbt-gob', actionIndex: 0, damage: 'critical', ts: 1 });
    expect(strike.critical).toHaveBeenCalled();
    expect(lastAck(send)).toEqual(expect.objectContaining({ mode: 'critical', total: 24 }));
  });

  test('targets pre-set the Foundry user target set; omitting them leaves it alone', async () => {
    const send = jest.fn();
    strikeWorld(send);

    await handleStrikeRequest({
      id: 's5', entryId: 'cbt-gob', actionIndex: 0, variant: 0,
      targets: ['cbt-pellias'], ts: 1,
    });
    expect(global.game.user.updateTokenTargets).toHaveBeenCalledWith(['tok-pellias']);

    global.game.user.updateTokenTargets.mockClear();
    await handleStrikeRequest({ id: 's6', entryId: 'cbt-gob', actionIndex: 0, variant: 0, ts: 1 });
    expect(global.game.user.updateTokenTargets).not.toHaveBeenCalled();
  });

  test('nacks: unknown combatant, missing strike index, and a throwing roll', async () => {
    const send = jest.fn();
    const { strike } = strikeWorld(send);

    await handleStrikeRequest({ id: 'n1', entryId: 'cbt-ghost', actionIndex: 0, ts: 1 });
    expect(lastAck(send)).toEqual(expect.objectContaining({ id: 'n1', ok: false }));

    await handleStrikeRequest({ id: 'n2', entryId: 'cbt-gob', actionIndex: 9, ts: 1 });
    expect(lastAck(send)).toEqual(expect.objectContaining({ id: 'n2', ok: false }));

    strike.variants[0].roll.mockRejectedValueOnce(new Error('boom'));
    await handleStrikeRequest({ id: 'n3', entryId: 'cbt-gob', actionIndex: 0, variant: 0, ts: 1 });
    expect(lastAck(send)).toEqual(expect.objectContaining({ id: 'n3', ok: false }));
  });

  test('a request with no id is dropped silently', async () => {
    const send = jest.fn();
    strikeWorld(send);
    await handleStrikeRequest({ entryId: 'cbt-gob', actionIndex: 0, ts: 1 });
    expect(lastAck(send)).toBeNull();
  });
});
