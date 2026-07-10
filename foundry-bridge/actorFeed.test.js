// actorFeed module unit tests — createChatMessage → action feed + economy (#472b).
// Runs against the mocked adapter/globals (test/setup.js). All Foundry reads go
// through pf2eAdapter, so these stay version-independent.

import { initActorFeed } from './actorFeed.js';
import { makeCombat, makeCombatant, makeChatMessage } from './test/foundryMock.js';

let send;

function init() {
  send = jest.fn();
  initActorFeed(send);  // registers hooks on the fresh Hooks from setup.js
}

beforeEach(init);

// Hero (active, init 20) + Foe (init 10). Hero holds the turn by default.
function startCombat({ activeTurnIndex = 0 } = {}) {
  const hero = makeCombatant({ id: 'cbt-hero', name: 'Hero', actorId: 'actor-hero', initiative: 20 });
  const foe  = makeCombatant({ id: 'cbt-foe',  name: 'Foe',  actorId: 'actor-foe',  initiative: 10 });
  const combat = makeCombat({ id: 'c1', combatants: [hero, foe], activeTurnIndex });
  global.game.combat = combat;
  global.Hooks.fire('createCombat', combat);
  return { combat, hero, foe };
}

const lastPayload = () => send.mock.calls.at(-1)[2];

describe('keying in on the active combatant', () => {
  test('createCombat emits an empty feed keyed to the active combatant', () => {
    startCombat();
    expect(lastPayload()).toEqual({
      entryId: 'cbt-hero', actions: 3, spent: 0, reaction: true, feed: [],
    });
  });
});

describe('chat-message parsing', () => {
  test('a strike by the active combatant becomes a feed entry with cost, label, target and degree', () => {
    startCombat();
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'attack-roll', outcome: 'success',
      itemName: 'Longsword', itemType: 'weapon', targetName: 'Foe',
    }));

    const p = lastPayload();
    expect(p.entryId).toBe('cbt-hero');
    expect(p.feed).toHaveLength(1);
    expect(p.feed[0]).toEqual({
      n: 1, cost: 1, label: 'Longsword', detail: 'vs Foe', result: 'Hit',
      type: 'attack-roll', ts: expect.any(Number), state: 'done',
    });
    expect(p.spent).toBe(1);
  });

  test('a miss carries the amber tone; a hit carries none', () => {
    startCombat();
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'attack-roll', outcome: 'criticalFailure', itemName: 'Longsword',
    }));
    expect(lastPayload().feed[0]).toMatchObject({ result: 'Critical Miss', tone: 'amber' });

    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'attack-roll', outcome: 'success', itemName: 'Longsword',
    }));
    expect(lastPayload().feed[1].tone).toBeUndefined();
  });

  test('a spell uses its casting time as the cost', () => {
    startCombat();
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'spell-cast', itemName: 'Fireball', itemType: 'spell', spellTime: '2',
    }));
    expect(lastPayload().feed[0]).toMatchObject({ cost: 2, label: 'Fireball' });
    expect(lastPayload().spent).toBe(2);
  });

  test('a skill check labelled "Success"/"Failure", not "Hit"/"Miss"', () => {
    startCombat();
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'skill-check', outcome: 'failure', itemName: 'Demoralize', actionCount: 1,
    }));
    expect(lastPayload().feed[0]).toMatchObject({ cost: 1, label: 'Demoralize', result: 'Failure' });
  });

  test('a message without roll context is ignored', () => {
    startCombat();
    const before = send.mock.calls.length;
    global.Hooks.fire('createChatMessage', makeChatMessage({ actorId: 'actor-hero' }));
    expect(send.mock.calls.length).toBe(before);
  });

  test('entries carry the neutral facts the app maps to reaction triggers', () => {
    startCombat();
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'attack-roll', itemName: 'Longbow', itemType: 'weapon',
      ranged: true, targetName: 'Kestrel', targetActorId: 'actor-kestrel',
    }));
    expect(lastPayload().feed[0]).toMatchObject({
      type: 'attack-roll', attackRange: 'ranged', targetActorId: 'actor-kestrel', detail: 'vs Kestrel',
    });
  });

  test('a melee weapon is tagged attackRange melee', () => {
    startCombat();
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'attack-roll', itemName: 'Longsword', itemType: 'weapon', ranged: false,
    }));
    expect(lastPayload().feed[0]).toMatchObject({ type: 'attack-roll', attackRange: 'melee' });
  });

  test('a message from a different actor is ignored', () => {
    startCombat();
    const before = send.mock.calls.length;
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-foe', type: 'attack-roll', itemName: 'Claw',
    }));
    expect(send.mock.calls.length).toBe(before);
    expect(lastPayload().feed).toHaveLength(0);
  });
});

describe('action economy', () => {
  test('spent sums parsed costs and caps at 3', () => {
    startCombat();
    const strike = () => global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'spell-cast', itemName: 'Heal', itemType: 'spell', spellTime: '2',
    }));
    strike();
    strike();  // 2 + 2 = 4 → clamped
    expect(lastPayload().spent).toBe(3);
  });

  test('a reaction flips the reaction flag without spending an action', () => {
    startCombat();
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'attack-roll', itemName: 'Reactive Strike', actionType: 'reaction',
    }));
    const p = lastPayload();
    expect(p.feed[0].cost).toBe('r');
    expect(p.reaction).toBe(false);
    expect(p.spent).toBe(0);
  });

  test('a damage roll adds an entry but never accrues an action (the #489 double-count fix)', () => {
    startCombat();
    // A strike that hits: the attack roll (1 action) then a separate damage roll.
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'attack-roll', itemName: 'Longsword', ranged: false,
    }));
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'damage-roll', itemName: 'Longsword',
      targetName: 'Kestrel', targetActorId: 'actor-kestrel',
    }));
    const p = lastPayload();
    expect(p.spent).toBe(1);                       // the strike, counted once
    expect(p.feed).toHaveLength(2);
    expect(p.feed[1]).toMatchObject({ type: 'damage-roll', targetActorId: 'actor-kestrel' });
    expect(p.feed[1].cost).toBeUndefined();
  });

  test('a damage roll with readable instances carries damageTotal + typed instances (#1355)', () => {
    startCombat();
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'damage-roll', itemName: 'Flaming Longsword',
      targetName: 'Kestrel', targetActorId: 'actor-kestrel',
      damageInstances: [{ type: 'piercing', total: 13 }, { type: 'fire', total: 4 }],
    }));
    const entry = lastPayload().feed[0];
    expect(entry.damageTotal).toBe(17);
    expect(entry.damageInstances).toEqual([
      { amount: 13, type: 'piercing' },
      { amount: 4, type: 'fire' },
    ]);
    expect(typeof entry.ts).toBe('number');
  });

  test('a damage roll without readable rolls degrades to the pre-#1355 shape', () => {
    startCombat();
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'damage-roll', itemName: 'Longsword',
      targetActorId: 'actor-kestrel',
    }));
    const entry = lastPayload().feed[0];
    expect(entry.damageTotal).toBeUndefined();
    expect(entry.damageInstances).toBeUndefined();
  });

  test('a saving throw adds an entry but costs nothing', () => {
    startCombat();
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'saving-throw', outcome: 'success', itemName: 'Reflex',
    }));
    const p = lastPayload();
    expect(p.feed[0]).toMatchObject({ label: 'Reflex', result: 'Success', state: 'done' });
    expect(p.feed[0].cost).toBeUndefined();
    expect(p.spent).toBe(0);
  });
});

describe('turn lifecycle', () => {
  test('a turn change clears the feed and re-keys to the new combatant', () => {
    const { combat, foe } = startCombat();
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'attack-roll', itemName: 'Longsword',
    }));
    expect(lastPayload().feed).toHaveLength(1);

    combat.turn = 1;
    combat.combatant = foe;
    global.Hooks.fire('updateCombat', combat, { turn: 1 });

    expect(lastPayload()).toEqual({
      entryId: 'cbt-foe', actions: 3, spent: 0, reaction: true, feed: [],
    });
  });

  test('a non-turn combat update leaves the current feed intact', () => {
    startCombat();
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'attack-roll', itemName: 'Longsword',
    }));
    const calls = send.mock.calls.length;
    global.Hooks.fire('updateCombat', global.game.combat, { flags: {} });
    expect(send.mock.calls.length).toBe(calls);       // no re-emit
    expect(lastPayload().feed).toHaveLength(1);
  });

  test('deleteCombat drops the feed state', () => {
    startCombat();
    global.Hooks.fire('deleteCombat');
    // A later message with no active combat must not throw or emit.
    global.game.combat = null;
    const calls = send.mock.calls.length;
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'attack-roll', itemName: 'Longsword',
    }));
    expect(send.mock.calls.length).toBe(calls);
  });
});
