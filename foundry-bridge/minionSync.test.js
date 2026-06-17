// Minion state write-back unit tests (#362 stretch) — app↔Foundry for companion/
// familiar HP + conditions. Links are ownership-derived (getMinionActorLinks), so
// the world mirrors minionActors.test.js: a PC, her familiar, and her companion.

import {
  initMinionSync, handleMinionsUpdate, cacheMinions, _resetMinionCache,
} from './minionSync.js';
import { updateActorMap } from './encounter.js';
import { makeActor, makeConditionItem, makeGame } from './test/foundryMock.js';
import { BRIDGE_SOURCE_FLAG } from './utils.js';

const GM = { id: 'gm', isGM: true };
const PLAYER = { id: 'player1', isGM: false };
const OWNED = { gm: 3, player1: 3 };

// Ashka (PC) + familiar Lazarus + companion Zevira (an NPC actor), all owned by
// the same player; the actor map ties Ashka's actor to her app charId.
function makeWorld({
  zeviraHp = {}, lazarusHp = {}, zeviraTokens = [],
  zeviraConditions = [], lazarusConditions = [],
} = {}) {
  const ashka = makeActor({
    id: 'actor-ashka', name: 'Ashka', type: 'character',
    hasPlayerOwner: true, ownership: OWNED,
  });
  const lazarus = makeActor({
    id: 'actor-laz', name: 'Lazarus', type: 'familiar',
    hasPlayerOwner: true, ownership: OWNED, hp: lazarusHp, conditions: lazarusConditions,
  });
  const zevira = makeActor({
    id: 'actor-zev', name: 'Zevira', type: 'npc',
    hasPlayerOwner: true, ownership: OWNED, hp: zeviraHp, tokens: zeviraTokens,
    conditions: zeviraConditions,
  });
  global.game = makeGame({ actors: [ashka, lazarus, zevira], users: [GM, PLAYER] });
  updateActorMap({ 'actor-ashka': 'Ashka' });
  return { ashka, lazarus, zevira };
}

let send;
beforeEach(() => {
  send = jest.fn();
  _resetMinionCache();
  initMinionSync(send);
});

describe('handleMinionsUpdate (app → Foundry)', () => {
  test('writes each role HP to its linked actor, echo-tagged', async () => {
    const { lazarus, zevira } = makeWorld();
    await handleMinionsUpdate('Ashka', {
      companion: { hp: { current: 15, temp: 2 } },
      familiar:  { hp: { current: 8,  temp: 0 } },
    });
    expect(zevira.update).toHaveBeenCalledWith(
      { 'system.attributes.hp.value': 15, 'system.attributes.hp.temp': 2 },
      { [BRIDGE_SOURCE_FLAG]: 'app' },
    );
    expect(lazarus.update).toHaveBeenCalledWith(
      { 'system.attributes.hp.value': 8, 'system.attributes.hp.temp': 0 },
      { [BRIDGE_SOURCE_FLAG]: 'app' },
    );
  });

  test('skips a role with no hp payload', async () => {
    const { zevira, lazarus } = makeWorld();
    await handleMinionsUpdate('Ashka', { companion: { hp: { current: 5, temp: 0 } }, familiar: {} });
    expect(zevira.update).toHaveBeenCalledTimes(1);
    expect(lazarus.update).not.toHaveBeenCalled();
  });

  test('unknown owner / malformed value is a no-op', async () => {
    const { zevira, lazarus } = makeWorld();
    await handleMinionsUpdate('Nobody', { companion: { hp: { current: 5 } } });
    await handleMinionsUpdate('Ashka', null);
    expect(zevira.update).not.toHaveBeenCalled();
    expect(lazarus.update).not.toHaveBeenCalled();
  });
});

describe('onUpdateActorMinion (Foundry → app)', () => {
  test('a minion HP change pushes a merged minions object preserving the other role', () => {
    const { zevira } = makeWorld({ zeviraHp: { value: 10, max: 32, temp: 0 } });
    // The owner already has both roles tracked app-side.
    cacheMinions('Ashka', {
      companion: { hp: { current: 32, max: 32, temp: 0 } },
      familiar:  { hp: { current: 20, max: 20, temp: 0 } },
    });

    global.Hooks.fire('updateActor', zevira, { system: { attributes: { hp: { value: 10 } } } }, {});

    expect(send).toHaveBeenCalledWith('Ashka', 'minions', {
      companion: { hp: { current: 10, max: 32, temp: 0 } },
      familiar:  { hp: { current: 20, max: 20, temp: 0 } },
    });
  });

  test('pushes the changed role even with no prior cache', () => {
    const { lazarus } = makeWorld({ lazarusHp: { value: 6, max: 20, temp: 0 } });
    global.Hooks.fire('updateActor', lazarus, { system: { attributes: { hp: { value: 6 } } } }, {});
    expect(send).toHaveBeenCalledWith('Ashka', 'minions', {
      familiar: { hp: { current: 6, max: 20, temp: 0 } },
    });
  });

  test('the bridge echo flag is ignored', () => {
    const { zevira } = makeWorld({ zeviraHp: { value: 10, max: 32 } });
    global.Hooks.fire('updateActor', zevira,
      { system: { attributes: { hp: { value: 10 } } } },
      { [BRIDGE_SOURCE_FLAG]: 'app' });
    expect(send).not.toHaveBeenCalled();
  });

  test('a non-HP diff pushes nothing', () => {
    const { zevira } = makeWorld();
    global.Hooks.fire('updateActor', zevira, { system: { details: { level: { value: 4 } } } }, {});
    expect(send).not.toHaveBeenCalled();
  });

  test('a PC (non-minion) actor update is ignored', () => {
    const { ashka } = makeWorld();
    global.Hooks.fire('updateActor', ashka, { system: { attributes: { hp: { value: 30 } } } }, {});
    expect(send).not.toHaveBeenCalled();
  });
});

describe('onMinionConditionItemChanged (Foundry → app)', () => {
  test('a condition change merges conditions + hp into the owner object, preserving the other role', () => {
    const { zevira } = makeWorld({
      zeviraHp: { value: 28, max: 32, temp: 0 },
      zeviraConditions: [{ slug: 'frightened', value: 2 }],
    });
    cacheMinions('Ashka', {
      companion: { hp: { current: 32, max: 32, temp: 0 } },
      familiar:  { hp: { current: 20, max: 20, temp: 0 } },
    });

    global.Hooks.fire('createItem', zevira.itemTypes.condition[0]);

    expect(send).toHaveBeenCalledWith('Ashka', 'minions', {
      companion: {
        hp: { current: 28, max: 32, temp: 0 },
        conditions: [{ id: 'frightened', value: 2 }],
      },
      familiar: { hp: { current: 20, max: 20, temp: 0 } },
    });
  });

  test('clearing the last condition pushes an empty list for the role', () => {
    const { lazarus } = makeWorld({ lazarusHp: { value: 6, max: 20, temp: 0 } });
    // No condition items remain on the actor → empty list.
    global.Hooks.fire('deleteItem', makeConditionItem({ slug: 'sickened', parent: lazarus }));
    expect(send).toHaveBeenCalledWith('Ashka', 'minions', {
      familiar: { hp: { current: 6, max: 20, temp: 0 }, conditions: [] },
    });
  });

  test('non-condition items are ignored', () => {
    makeWorld();
    global.Hooks.fire('updateItem', { type: 'weapon' });
    expect(send).not.toHaveBeenCalled();
  });

  test('a condition on a non-minion (PC) actor is ignored', () => {
    const { ashka } = makeWorld({});
    global.Hooks.fire('createItem', makeConditionItem({ slug: 'prone', parent: ashka }));
    expect(send).not.toHaveBeenCalled();
  });

  test('a condition item with no actor parent is ignored', () => {
    makeWorld();
    global.Hooks.fire('deleteItem', makeConditionItem({ slug: 'prone', parent: null }));
    expect(send).not.toHaveBeenCalled();
  });
});
