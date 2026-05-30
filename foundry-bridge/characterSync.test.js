// Character sync unit tests — actor/condition hooks → relay, and relay → actor writes.
// The actor map lives in encounter.js (shared); we set it via updateActorMap.

import { initCharacterSync, handleCharacterUpdate } from './characterSync.js';
import { updateActorMap } from './encounter.js';
import { makeActor, makeConditionItem } from './test/foundryMock.js';
import { BRIDGE_SOURCE_FLAG } from './utils.js';

let send;

beforeEach(() => {
  send = jest.fn();
  updateActorMap({ 'actor-pellias': 'Pellias' });
  initCharacterSync(send);
});

describe('onUpdateActor (Foundry → app)', () => {
  function pellias() {
    return makeActor({ id: 'actor-pellias', hp: { value: 20, max: 40, temp: 0, wounded: 1 }, heroPoints: 2 });
  }

  test('hp diff pushes cnmh_hp with the full hp snapshot', () => {
    const actor = pellias();
    global.Hooks.fire('updateActor', actor, { system: { attributes: { hp: { value: 20 } } } }, {});
    expect(send).toHaveBeenCalledWith('Pellias', 'hp', expect.objectContaining({ current: 20, max: 40, wounded: 1 }));
  });

  test('hero points diff pushes cnmh_heropoints', () => {
    const actor = pellias();
    global.Hooks.fire('updateActor', actor, { system: { resources: { heroPoints: { value: 2 } } } }, {});
    expect(send).toHaveBeenCalledWith('Pellias', 'heropoints', 2);
  });

  test('dying/wounded/doomed diffs also push hp', () => {
    const actor = pellias();
    global.Hooks.fire('updateActor', actor, { system: { attributes: { dying: { value: 1 } } } }, {});
    expect(send).toHaveBeenCalledWith('Pellias', 'hp', expect.any(Object));
  });

  test('the bridge echo flag is ignored', () => {
    global.Hooks.fire('updateActor', pellias(), { system: { attributes: { hp: { value: 20 } } } }, { [BRIDGE_SOURCE_FLAG]: 'app' });
    expect(send).not.toHaveBeenCalled();
  });

  test('unmapped actor is ignored', () => {
    const actor = makeActor({ id: 'actor-unknown', hp: { value: 5 } });
    global.Hooks.fire('updateActor', actor, { system: { attributes: { hp: { value: 5 } } } }, {});
    expect(send).not.toHaveBeenCalled();
  });

  test('irrelevant diff pushes nothing', () => {
    global.Hooks.fire('updateActor', pellias(), { system: { details: { level: { value: 4 } } } }, {});
    expect(send).not.toHaveBeenCalled();
  });
});

describe('onConditionItemChanged (Foundry → app)', () => {
  test('a condition change pushes both conditions and hp', () => {
    const actor = makeActor({
      id: 'actor-pellias',
      hp: { value: 18, max: 30 },
      conditions: [{ slug: 'frightened', value: 2 }],
    });
    const condItem = actor.itemTypes.condition[0];

    global.Hooks.fire('createItem', condItem);

    expect(send).toHaveBeenCalledWith('Pellias', 'conditions', [{ id: 'frightened', value: 2 }]);
    expect(send).toHaveBeenCalledWith('Pellias', 'hp', expect.objectContaining({ current: 18 }));
  });

  test('non-condition items are ignored', () => {
    global.Hooks.fire('updateItem', { type: 'weapon' });
    expect(send).not.toHaveBeenCalled();
  });

  test('condition item with no actor parent is ignored', () => {
    global.Hooks.fire('deleteItem', makeConditionItem({ slug: 'prone', parent: null }));
    expect(send).not.toHaveBeenCalled();
  });
});

describe('handleCharacterUpdate (app → Foundry)', () => {
  test('hp write updates the actor, echo-tagged', async () => {
    const actor = makeActor({ id: 'actor-pellias' });
    global.game.actors.set('actor-pellias', actor);

    await handleCharacterUpdate('Pellias', 'hp', { current: 12, temp: 4 });

    expect(actor.update).toHaveBeenCalledWith(
      { 'system.attributes.hp.value': 12, 'system.attributes.hp.temp': 4 },
      { [BRIDGE_SOURCE_FLAG]: 'app' },
    );
  });

  test('hero points write updates the actor, echo-tagged', async () => {
    const actor = makeActor({ id: 'actor-pellias' });
    global.game.actors.set('actor-pellias', actor);

    await handleCharacterUpdate('Pellias', 'heropoints', 3);

    expect(actor.update).toHaveBeenCalledWith(
      { 'system.resources.heroPoints.value': 3 },
      { [BRIDGE_SOURCE_FLAG]: 'app' },
    );
  });

  test('unknown charId is a no-op', async () => {
    const actor = makeActor({ id: 'actor-pellias' });
    global.game.actors.set('actor-pellias', actor);
    await handleCharacterUpdate('Nobody', 'hp', { current: 1 });
    expect(actor.update).not.toHaveBeenCalled();
  });
});
