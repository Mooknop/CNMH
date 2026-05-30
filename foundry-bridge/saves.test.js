// Save / degree-of-success handshake tests.
// Bridge side: prompt push, roll dispatch, stale-reqId guard, rollSave adapter.

import { initSaves, handleSavePrompt, handleSaveRoll } from './saves.js';
import { updateActorMap } from './encounter.js';
import { makeActor } from './test/foundryMock.js';

let send;

beforeEach(() => {
  send = jest.fn();
  updateActorMap({ 'actor-pellias': 'Pellias' });
  initSaves(send);
});

describe('handleSavePrompt', () => {
  test('pushes saveprompt to the target character with a unique reqId', () => {
    handleSavePrompt('Pellias', { save: 'reflex', dc: 18, effectName: 'Fireball', basic: true, source: 'GM' });
    expect(send).toHaveBeenCalledWith('Pellias', 'saveprompt', expect.objectContaining({
      save: 'reflex', dc: 18, effectName: 'Fireball', basic: true, source: 'GM',
      reqId: expect.stringContaining('save-Pellias'),
    }));
  });
});

describe('handleSaveRoll', () => {
  function makeSaveActor() {
    const actor = makeActor({ id: 'actor-pellias' });
    // Mock PF2e save roll: resolves with a ChatMessage-like object.
    actor.saves = {
      reflex: {
        roll: jest.fn().mockResolvedValue({
          rolls: [{ total: 22 }],
          flags: { pf2e: { context: { outcome: 'success' } } },
        }),
      },
    };
    global.game.actors.set('actor-pellias', actor);
    return actor;
  }

  test('rolls the save and pushes saveresult', async () => {
    const actor = makeSaveActor();
    handleSavePrompt('Pellias', { save: 'reflex', dc: 18, effectName: 'Fireball', basic: true });
    const { reqId } = send.mock.calls[0][2];

    await handleSaveRoll('Pellias', { reqId, save: 'reflex' });

    expect(actor.saves.reflex.roll).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('Pellias', 'saveresult', { reqId, total: 22, degree: 'success' });
  });

  test('stale reqId is ignored — only the latest prompt is honoured', async () => {
    makeSaveActor();
    handleSavePrompt('Pellias', { save: 'reflex', dc: 18, effectName: 'A', basic: false });
    const staleReqId = send.mock.calls[0][2].reqId;

    // Issue a second prompt, superseding the first.
    handleSavePrompt('Pellias', { save: 'will', dc: 20, effectName: 'B', basic: false });

    await handleSaveRoll('Pellias', { reqId: staleReqId, save: 'reflex' });

    // saveresult should NOT have been pushed (stale).
    expect(send).not.toHaveBeenCalledWith('Pellias', 'saveresult', expect.anything());
  });

  test('unknown charId is a no-op', async () => {
    await handleSaveRoll('Nobody', { reqId: 'save-Nobody-1', save: 'fortitude' });
    expect(send).not.toHaveBeenCalledWith(expect.any(String), 'saveresult', expect.anything());
  });
});

describe('rollSave adapter', () => {
  test('rollSave reads total and degree from the PF2e ChatMessage', async () => {
    // Import via the adapter so the contract path is tested.
    const { rollSave } = await import('./pf2eAdapter.js');
    const actor = makeActor({ id: 'a1' });
    actor.saves = {
      will: {
        roll: jest.fn().mockResolvedValue({
          rolls: [{ total: 5 }],
          flags: { pf2e: { context: { outcome: 'criticalFailure' } } },
        }),
      },
    };
    const result = await rollSave(actor, 'will');
    expect(result).toEqual({ total: 5, degree: 'criticalFailure' });
  });

  test('rollSave throws when the save is not found on the actor', async () => {
    const { rollSave } = await import('./pf2eAdapter.js');
    await expect(rollSave(makeActor(), 'reflex')).rejects.toThrow();
  });
});
