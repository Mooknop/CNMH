// Dice-tower rail unit tests (#1490 S1) — cnmh_rollreq_global → plain core
// Roll in Foundry chat (speaker from the actor map, app-composed flavor) →
// ack total + per-die faces on cnmh_rolldone_global. All resolution math
// stays app-side; a failed roll still acks ok:false so the requester falls
// back to manual entry immediately.

import { initDice, handleRollRequest } from './dice.js';
import { updateActorMap } from './encounter.js';
import { makeActor } from './test/foundryMock.js';

// Configurable core-Roll mock: set `nextRoll` to the evaluated shape (or an
// Error to make evaluate throw); toMessage calls are captured per instance.
let nextRoll = null;
let rollValid = true;
const toMessageCalls = [];

class MockRoll {
  constructor(formula) {
    this.formula = formula;
    MockRoll.lastInstance = this;
  }

  static validate() {
    return rollValid;
  }

  async evaluate() {
    if (nextRoll instanceof Error) throw nextRoll;
    Object.assign(this, nextRoll ?? { total: 0, dice: [] });
    return this;
  }

  async toMessage(messageData, opts) {
    toMessageCalls.push({ messageData, opts });
  }
}

function setupWorld() {
  const pellias = makeActor({ id: 'actor-pellias', name: 'Pellias' });
  global.game.actors.set('actor-pellias', pellias);
  updateActorMap({ 'actor-pellias': 'Pellias' });
  return { pellias };
}

describe('handleRollRequest', () => {
  let sendUpdate;

  beforeEach(() => {
    sendUpdate = jest.fn();
    initDice(sendUpdate);
    nextRoll = null;
    rollValid = true;
    toMessageCalls.length = 0;
    global.Roll = MockRoll;
    global.ChatMessage = {
      getSpeaker: jest.fn((opts) => ({
        actor: opts?.actor?.id ?? null,
        alias: opts?.actor?.name ?? 'Gamemaster',
      })),
    };
  });

  afterEach(() => {
    delete global.Roll;
    delete global.ChatMessage;
    updateActorMap({});
  });

  test('rolls the formula as the mapped actor and acks total + faces', async () => {
    const { pellias } = setupWorld();
    nextRoll = { total: 14, dice: [{ faces: 20, results: [{ result: 14, active: true }] }] };

    await handleRollRequest({
      id: 'roll-1', charId: 'Pellias', formula: '1d20', flavor: 'Strike: Longsword (MAP 0)', ts: 1,
    });

    expect(global.ChatMessage.getSpeaker).toHaveBeenCalledWith({ actor: pellias });
    expect(toMessageCalls).toEqual([{
      messageData: { speaker: { actor: 'actor-pellias', alias: 'Pellias' }, flavor: 'Strike: Longsword (MAP 0)' },
      opts: { rollMode: 'publicroll' },
    }]);
    expect(sendUpdate).toHaveBeenCalledWith('global', 'rolldone', expect.objectContaining({
      id: 'roll-1', charId: 'Pellias', ok: true, total: 14, faces: [[20, 14]],
    }));
  });

  test('an unmapped charId still rolls, speaking as GM', async () => {
    nextRoll = { total: 9, dice: [{ faces: 20, results: [{ result: 9 }] }] };

    await handleRollRequest({ id: 'roll-2', charId: 'Nobody', formula: '1d20', flavor: '' });

    expect(global.ChatMessage.getSpeaker).toHaveBeenCalledWith();
    expect(sendUpdate).toHaveBeenCalledWith('global', 'rolldone', expect.objectContaining({
      id: 'roll-2', charId: 'Nobody', ok: true, total: 9, faces: [[20, 9]],
    }));
  });

  test('damage formulas ack one [sides, face] pair per KEPT die', async () => {
    setupWorld();
    nextRoll = {
      total: 25,
      dice: [
        // kh keep-highest: the discarded die is active:false and excluded.
        { faces: 20, results: [{ result: 3, active: false }, { result: 17, active: true }] },
        // active undefined counts as kept (plain core dice don't stamp it).
        { faces: 6, results: [{ result: 4 }, { result: 4, active: true }] },
      ],
    };

    await handleRollRequest({ id: 'roll-3', charId: 'Pellias', formula: '2d20kh+2d6', flavor: 'Damage' });

    const ack = sendUpdate.mock.calls[0][2];
    expect(ack.faces).toEqual([[20, 17], [6, 4], [6, 4]]);
  });

  test('an invalid formula nacks ok:false without posting to chat', async () => {
    rollValid = false;

    await handleRollRequest({ id: 'roll-4', charId: 'Pellias', formula: 'not dice', flavor: '' });

    expect(toMessageCalls).toHaveLength(0);
    expect(sendUpdate).toHaveBeenCalledWith('global', 'rolldone', expect.objectContaining({
      id: 'roll-4', ok: false, total: null, faces: [],
    }));
  });

  test('an overlong formula nacks without touching the Roll parser', async () => {
    const validate = jest.spyOn(MockRoll, 'validate');

    await handleRollRequest({ id: 'roll-5', charId: null, formula: '1d20+'.repeat(40), flavor: '' });

    expect(validate).not.toHaveBeenCalled();
    expect(sendUpdate).toHaveBeenCalledWith('global', 'rolldone', expect.objectContaining({
      id: 'roll-5', ok: false,
    }));
    validate.mockRestore();
  });

  test('a roll throw is caught and nacks ok:false', async () => {
    nextRoll = new Error('boom');

    await handleRollRequest({ id: 'roll-6', charId: null, formula: '1d20', flavor: '' });

    expect(sendUpdate).toHaveBeenCalledWith('global', 'rolldone', expect.objectContaining({
      id: 'roll-6', ok: false, total: null, faces: [],
    }));
  });

  test('does nothing (no ack) without an id or a string formula', async () => {
    await handleRollRequest({ charId: 'Pellias', formula: '1d20' });
    await handleRollRequest({ id: 'roll-7', charId: 'Pellias', formula: 20 });
    await handleRollRequest(null);
    expect(sendUpdate).not.toHaveBeenCalled();
  });
});
