// Encounter module unit tests — combat hooks → encounter payload, turn command.
// Runs against the mocked adapter/globals (test/setup.js). Version-independent:
// all Foundry reads go through pf2eAdapter.

import {
  initEncounter, handleTurnCommand, updateActorMap, getActorMap,
} from './encounter.js';
import { makeCombat, makeCombatant, makeActor } from './test/foundryMock.js';

let send;

function init() {
  send = jest.fn();
  updateActorMap({});       // reset module-level actor map between tests
  initEncounter(send);      // registers hooks on the fresh Hooks from setup.js
}

beforeEach(init);

// Goblin (init 22) and Pellias (init 18); Pellias is mapped to a PC.
function combatWithGoblinAndPellias({ activeTurnIndex = 0, ...rest } = {}) {
  const pellias = makeCombatant({ id: 'cbt-pellias', name: 'Pellias', actorId: 'actor-pellias', initiative: 18 });
  const goblin  = makeCombatant({ id: 'cbt-goblin',  name: 'Goblin',  actorId: 'actor-goblin',  initiative: 22 });
  return makeCombat({ id: 'combat1', combatants: [pellias, goblin], activeTurnIndex, ...rest });
}

describe('actor map', () => {
  test('updateActorMap / getActorMap round-trip; null resets to {}', () => {
    updateActorMap({ 'actor-pellias': 'Pellias' });
    expect(getActorMap()).toEqual({ 'actor-pellias': 'Pellias' });
    updateActorMap(null);
    expect(getActorMap()).toEqual({});
  });
});

describe('encounter payload push', () => {
  test('createCombat pushes a sorted encounter to global/encounter', () => {
    updateActorMap({ 'actor-pellias': 'Pellias' });
    const combat = combatWithGoblinAndPellias({ activeTurnIndex: 0 });

    global.Hooks.fire('createCombat', combat);

    expect(send).toHaveBeenCalledTimes(1);
    const [characterId, key, payload] = send.mock.calls[0];
    expect(characterId).toBe('global');
    expect(key).toBe('encounter');

    // Sorted by initiative desc: Goblin (22) then Pellias (18).
    expect(payload.order.map((e) => e.name)).toEqual(['Goblin', 'Pellias']);
    expect(payload.phase).toBe('in-progress');
    expect(payload.round).toBe(1);
    expect(payload.foundryCombatId).toBe('combat1');
  });

  test('mapped combatant is a pc with charId; unmapped is an enemy', () => {
    updateActorMap({ 'actor-pellias': 'Pellias' });
    global.Hooks.fire('createCombat', combatWithGoblinAndPellias());

    const { order } = send.mock.calls[0][2];
    const goblin = order.find((e) => e.name === 'Goblin');
    const pellias = order.find((e) => e.name === 'Pellias');
    expect(goblin.kind).toBe('enemy');
    expect(goblin.charId).toBeUndefined();
    expect(pellias.kind).toBe('pc');
    expect(pellias.charId).toBe('Pellias');
  });

  test('enemy combatant entry includes defenses when an actor is present', () => {
    const goblinActor = makeActor({ id: 'actor-goblin' });
    goblinActor.system.attributes.ac = { value: 15 };
    goblinActor.system.saves = { fortitude: { value: 8 }, reflex: { value: 5 }, will: { value: 3 } };
    goblinActor.system.attributes.immunities  = [];
    goblinActor.system.attributes.resistances = [];
    goblinActor.system.attributes.weaknesses  = [];
    global.game.actors.set('actor-goblin', goblinActor);

    global.Hooks.fire('createCombat', combatWithGoblinAndPellias());

    const { order } = send.mock.calls[0][2];
    const goblin = order.find((e) => e.name === 'Goblin');
    expect(goblin.defenses).toEqual({
      ac: 15,
      saves: { fortitude: 8, reflex: 5, will: 3 },
      immunities: [], resistances: [], weaknesses: [],
    });
  });

  test('combatant entry without an actor omits defenses', () => {
    // Pellias has an actor; Goblin has no actor in game.actors in this test variant.
    global.Hooks.fire('createCombat', combatWithGoblinAndPellias());

    const { order } = send.mock.calls[0][2];
    const goblin = order.find((e) => e.name === 'Goblin');
    expect(goblin.defenses).toBeUndefined();
  });

  test('currentTurnIndex maps the active combatant into the sorted order', () => {
    // Pellias is combatants[0] but sorts second by initiative; make him active.
    global.Hooks.fire('createCombat', combatWithGoblinAndPellias({ activeTurnIndex: 0 }));
    const { currentTurnIndex, order } = send.mock.calls[0][2];
    expect(order[currentTurnIndex].name).toBe('Pellias');
  });

  test('phase reflects combat lifecycle', () => {
    global.Hooks.fire('createCombat', makeCombat({ active: true, started: false, round: 0, combatants: [] }));
    expect(send.mock.calls[0][2].phase).toBe('setup');

    send.mockClear();
    global.Hooks.fire('createCombat', makeCombat({ active: false, started: true, round: 3, combatants: [] }));
    expect(send.mock.calls[0][2].phase).toBe('ended');
  });

  test('deleteCombat pushes idle state', () => {
    global.Hooks.fire('deleteCombat', makeCombat());
    const [characterId, key, payload] = send.mock.calls.at(-1);
    expect(characterId).toBe('global');
    expect(key).toBe('encounter');
    expect(payload).toMatchObject({ active: false, phase: 'idle', order: [], foundryCombatId: null });
  });

  test('updateCombat with the bridge echo flag does not re-push', () => {
    const combat = combatWithGoblinAndPellias();
    global.Hooks.fire('updateCombat', combat, {}, { _bridgeUpdate: true });
    expect(send).not.toHaveBeenCalled();
  });

  test('createCombatant re-pushes via its combat', () => {
    const combat = combatWithGoblinAndPellias();
    const combatant = makeCombatant({ combat });
    global.Hooks.fire('createCombatant', combatant);
    expect(send).toHaveBeenCalledWith('global', 'encounter', expect.objectContaining({ foundryCombatId: 'combat1' }));
  });
});

describe('handleTurnCommand', () => {
  test('next-turn advances the active combat', async () => {
    const combat = combatWithGoblinAndPellias();
    global.game.combat = combat;
    await handleTurnCommand({ action: 'next-turn' });
    expect(combat.nextTurn).toHaveBeenCalledTimes(1);
  });

  test('prefers the stored combat id over the active combat', async () => {
    const stored = combatWithGoblinAndPellias();
    global.Hooks.fire('createCombat', stored);     // sets _activeCombatId = combat1
    global.game.combats.set('combat1', stored);
    global.game.combat = makeCombat({ id: 'other' }); // different active combat
    await handleTurnCommand({ action: 'next-turn' });
    expect(stored.nextTurn).toHaveBeenCalledTimes(1);
  });

  test('ignores non next-turn actions', async () => {
    const combat = combatWithGoblinAndPellias();
    global.game.combat = combat;
    await handleTurnCommand({ action: 'something-else' });
    expect(combat.nextTurn).not.toHaveBeenCalled();
  });

  test('no-op when there is no combat', async () => {
    global.game.combat = null;
    await expect(handleTurnCommand({ action: 'next-turn' })).resolves.toBeUndefined();
  });
});
