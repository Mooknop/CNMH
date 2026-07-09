// Relay-contract tests (#1308) — the bridge half of the tripwire.
//
// For every bridge→app channel this file drives the real feature module
// against the mocked Foundry world, captures the actual emission, and
// shape-compares it (field names + types, via __fixtures__/relay/shape.js)
// against the committed fixture in __fixtures__/relay/<channel>.json.
// The app's vitest suite consumes the SAME fixture files (src/test/
// relayFixtures.js), so renaming a payload field fails a named test on both
// sides without either test being edited.
//
// Re-record after an intentional payload change:
//   RELAY_FIXTURES=record npm run test:bridge -- --testPathPattern=relayContract
// then re-run the app suite — consumers of the changed field will fail until
// they're updated, which is exactly the point.

import fs from 'fs';
import path from 'path';
import { diffShapes } from './__fixtures__/relay/shape.js';
import { RELAY } from './syncKeys.js';

import { initMovement, handleMoveRequest, handleMoveConfirm } from './movement.js';
import { initEncounter, updateActorMap } from './encounter.js';
import { initCharacterSync } from './characterSync.js';
import { initMinionSync, cacheMinions, _resetMinionCache } from './minionSync.js';
import { initMinionActors, pushMinionActors } from './minionActors.js';
import { initSummonPool, pushSummonPool } from './summonPool.js';
import { initDoors, handleDoorRequest } from './doors.js';
import { initDamageApply, handleDamageApply } from './damageApply.js';
import { initSaves, handleSaveRoll } from './saves.js';
import { initFlankingPush, pushFlankedState } from './flankingPush.js';
import { initAdjacencyPush, pushAdjacencyState } from './adjacencyPush.js';
import { initPositions, pushPositions } from './positions.js';
import { initActorFeed } from './actorFeed.js';
import {
  installFoundryGlobals, makeActor, makeToken, makeCombat, makeCombatant,
  makeGame, makeChatMessage,
} from './test/foundryMock.js';

const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'relay');
const RECORD = process.env.RELAY_FIXTURES === 'record';

// Last emission on the channel: { characterId, value }.
const grab = (send, key) => {
  const call = send.mock.calls.filter((c) => c[1] === key).at(-1);
  if (!call) throw new Error(`no '${key}' emission captured`);
  return { characterId: call[0], value: call[2] };
};

// Stamp a stable ts when recording (dmgdone/savedone carry Date.now(); the
// contract only checks the field's TYPE).
const stableTs = (captured) => {
  if (captured.value && typeof captured.value === 'object' && typeof captured.value.ts === 'number') {
    return { ...captured, value: { ...captured.value, ts: 1700000000000 } };
  }
  return captured;
};

// --- shared worlds -----------------------------------------------------------

// PC token at grid (5,5), speed 10, with an adjacent ally (pass-through) and
// enemy (blocked) so the reachable/blocked arrays carry representative rows.
function movementWorld() {
  const send = jest.fn();
  updateActorMap({ 'actor-pellias': 'Pellias' });
  initMovement(send);
  const ally  = makeToken({ id: 'tok-ally',  x: 600, y: 500, disposition: 1 });
  const enemy = makeToken({ id: 'tok-enemy', x: 400, y: 500, disposition: -1 });
  const token = makeToken({ id: 'tok-pellias', x: 500, y: 500 });
  const actor = makeActor({ id: 'actor-pellias', speed: 10, tokens: [token] });
  token.actor = actor;
  global.game.actors.set('actor-pellias', actor);
  global.canvas.tokens.placeables = [token, ally, enemy];
  return send;
}

function combatWorld({ saves } = {}) {
  const goblin = makeActor({ id: 'actor-gob', name: 'Goblin Warrior', saves: saves ?? null });
  const tokG = makeToken({ id: 'tok-gob', actor: goblin });
  const combat = makeCombat({
    combatants: [makeCombatant({ id: 'cbt-gob', actorId: 'actor-gob', tokenId: 'tok-gob' })],
  });
  global.game.combat = combat;
  global.canvas.tokens.placeables = [tokG];
  return { goblin };
}

const OWNED = { gm: 3, player1: 3 };
function minionWorld({ zeviraHp } = {}) {
  const ashka = makeActor({
    id: 'actor-ashka', name: 'Ashka', type: 'character',
    hasPlayerOwner: true, ownership: OWNED,
  });
  const lazarus = makeActor({
    id: 'actor-laz', name: 'Lazarus', type: 'familiar',
    hasPlayerOwner: true, ownership: OWNED, hp: { value: 20, max: 20, temp: 0 },
  });
  const zevira = makeActor({
    id: 'actor-zev', name: 'Zevira', type: 'npc',
    hasPlayerOwner: true, ownership: OWNED, hp: zeviraHp ?? { value: 10, max: 32, temp: 0 },
  });
  global.game = makeGame({
    actors: [ashka, lazarus, zevira],
    users: [{ id: 'gm', isGM: true }, { id: 'player1', isGM: false }],
  });
  updateActorMap({ 'actor-ashka': 'Ashka' });
  return { zevira };
}

// --- one capture recipe per channel -------------------------------------------

const RECIPES = {
  [RELAY.MOVEOPTS]: async () => {
    const send = movementWorld();
    await handleMoveRequest('Pellias', { moveType: 'step', ts: 999 });
    return grab(send, RELAY.MOVEOPTS);
  },

  [RELAY.MOVEDONE]: async () => {
    const send = movementWorld();
    await handleMoveConfirm('Pellias', { destination: { col: 6, row: 5 }, moveType: 'step', ts: 42 });
    return grab(send, RELAY.MOVEDONE);
  },

  [RELAY.ROSTER]: () => {
    // bridge.js registers hooks at module evaluation, so mirror bridge.test.js:
    // isolate the module, fire 'ready', open the tracked socket → pushRoster().
    jest.useFakeTimers();
    try {
      let lastInstance = null;
      class TrackedWS {
        constructor() { this.readyState = 1; this.sentMsgs = []; lastInstance = this; }
        send(data) { this.sentMsgs.push(data); }
        close() { this.readyState = 3; }
      }
      TrackedWS.CONNECTING = 0; TrackedWS.OPEN = 1; TrackedWS.CLOSING = 2; TrackedWS.CLOSED = 3;
      global.WebSocket = TrackedWS;
      const pc = makeActor({ id: 'actor-pellias', name: 'Pellias', speed: 30 });
      pc.type = 'character';
      pc.hasPlayerOwner = true;
      global.game = makeGame({ actors: [pc] });
      jest.isolateModules(() => {
        require('./bridge.js');
        global.Hooks.fire('ready');
        lastInstance.onopen();
      });
      const msg = lastInstance.sentMsgs.map((s) => JSON.parse(s)).find((m) => m.key === RELAY.ROSTER);
      if (!msg) throw new Error('no roster emission captured');
      return { characterId: msg.characterId, value: msg.value };
    } finally {
      jest.useRealTimers();
    }
  },

  [RELAY.ENCOUNTER]: () => {
    const send = jest.fn();
    updateActorMap({ 'actor-pellias': 'Pellias' });
    initEncounter(send);
    global.game.actors.set('actor-goblin', makeActor({ id: 'actor-goblin', name: 'Goblin', hp: { value: 12, max: 12 } }));
    const combat = makeCombat({
      id: 'combat1',
      combatants: [
        makeCombatant({ id: 'cbt-pellias', name: 'Pellias', actorId: 'actor-pellias', initiative: 18 }),
        makeCombatant({ id: 'cbt-goblin', name: 'Goblin', actorId: 'actor-goblin', initiative: 22 }),
      ],
      activeTurnIndex: 0,
    });
    global.Hooks.fire('createCombat', combat);
    return grab(send, RELAY.ENCOUNTER);
  },

  [RELAY.HP]: () => {
    const send = jest.fn();
    updateActorMap({ 'actor-pellias': 'Pellias' });
    initCharacterSync(send);
    const actor = makeActor({ id: 'actor-pellias', hp: { value: 20, max: 40, temp: 3, wounded: 1 }, heroPoints: 2 });
    global.Hooks.fire('updateActor', actor, { system: { attributes: { hp: { value: 20 } } } }, {});
    return grab(send, RELAY.HP);
  },

  [RELAY.HEROPOINTS]: () => {
    const send = jest.fn();
    updateActorMap({ 'actor-pellias': 'Pellias' });
    initCharacterSync(send);
    const actor = makeActor({ id: 'actor-pellias', hp: { value: 20, max: 40 }, heroPoints: 2 });
    global.Hooks.fire('updateActor', actor, { system: { resources: { heroPoints: { value: 2 } } } }, {});
    return grab(send, RELAY.HEROPOINTS);
  },

  [RELAY.CONDITIONS]: () => {
    const send = jest.fn();
    updateActorMap({ 'actor-pellias': 'Pellias' });
    initCharacterSync(send);
    const actor = makeActor({
      id: 'actor-pellias',
      hp: { value: 18, max: 30 },
      conditions: [{ slug: 'frightened', value: 2 }],
    });
    global.Hooks.fire('createItem', actor.itemTypes.condition[0]);
    return grab(send, RELAY.CONDITIONS);
  },

  [RELAY.FOUNDRYEFFECTS]: () => {
    const send = jest.fn();
    updateActorMap({ 'actor-pellias': 'Pellias' });
    initCharacterSync(send);
    const actor = makeActor({
      id: 'actor-pellias',
      effects: [{ slug: 'spell-effect-courageous-anthem', name: 'Spell Effect: Courageous Anthem' }],
    });
    global.Hooks.fire('createItem', actor.itemTypes.effect[0]);
    return grab(send, RELAY.FOUNDRYEFFECTS);
  },

  [RELAY.MINIONS]: () => {
    const send = jest.fn();
    _resetMinionCache();
    initMinionSync(send);
    const { zevira } = minionWorld();
    cacheMinions('Ashka', {
      companion: { hp: { current: 32, max: 32, temp: 0 } },
      familiar: { hp: { current: 20, max: 20, temp: 0 } },
    });
    global.Hooks.fire('updateActor', zevira, { system: { attributes: { hp: { value: 10 } } } }, {});
    return grab(send, RELAY.MINIONS);
  },

  [RELAY.MINIONACTORS]: () => {
    const send = jest.fn();
    minionWorld();
    initMinionActors(send);
    pushMinionActors();
    return grab(send, RELAY.MINIONACTORS);
  },

  [RELAY.SUMMONPOOL]: () => {
    const zombie = makeActor({
      folderName: 'Summons', id: 'a-zombie', name: 'Zombie Shambler', level: 1, hp: { max: 24 },
    });
    zombie.system.attributes.ac = { value: 12 };
    installFoundryGlobals({ gameOpts: { actors: [zombie], settings: { summonFolder: 'Summons' } } });
    const send = jest.fn();
    initSummonPool(send);
    pushSummonPool();
    return grab(send, RELAY.SUMMONPOOL);
  },

  [RELAY.DOOROPTS]: () => {
    const send = movementWorld();
    initDoors(send);
    const doc = { id: 'w1', door: 1, ds: 0, c: [400, 500, 500, 500], update: jest.fn() };
    global.canvas.walls = { placeables: [{ id: 'w1', document: doc }], get: jest.fn() };
    handleDoorRequest('Pellias', { ts: 42 });
    return grab(send, RELAY.DOOROPTS);
  },

  [RELAY.DMGDONE]: async () => {
    const send = jest.fn();
    initDamageApply(send);
    combatWorld();
    await handleDamageApply({
      id: 'dmg-1',
      sourceName: 'Fireball',
      hits: [{ entryId: 'cbt-gob', name: 'Goblin Warrior', amount: 8, type: 'fire' }],
      ts: 1,
    });
    return grab(send, RELAY.DMGDONE);
  },

  [RELAY.SAVEDONE]: async () => {
    const send = jest.fn();
    initSaves(send);
    combatWorld({
      saves: { reflex: { roll: jest.fn().mockResolvedValue({ total: 21, dice: [{ total: 14 }] }) } },
    });
    await handleSaveRoll({
      id: 'savereq-1',
      save: 'reflex',
      dc: 25,
      targets: [{ entryId: 'cbt-gob', name: 'Goblin Warrior' }],
      ts: 1,
    });
    return grab(send, RELAY.SAVEDONE);
  },

  [RELAY.FLANKED]: () => {
    const send = jest.fn();
    global.canvas.tokens.placeables = [];
    const pcTok = makeToken({ id: 'tok-pellias', isFlanking: true });
    const enemyTok = makeToken({ id: 'tok-goblin' });
    global.canvas.tokens.placeables = [pcTok, enemyTok];
    updateActorMap({ 'actor-pellias': 'Pellias' });
    global.game.combat = makeCombat({
      combatants: [
        makeCombatant({ id: 'cbt-pellias', actorId: 'actor-pellias', tokenId: 'tok-pellias' }),
        makeCombatant({ id: 'cbt-goblin', actorId: null, tokenId: 'tok-goblin' }),
      ],
    });
    initFlankingPush(send);
    pushFlankedState();
    return grab(send, RELAY.FLANKED);
  },

  [RELAY.ADJACENCY]: () => {
    // No dedicated emission test existed for adjacency — this doubles as one.
    const send = jest.fn();
    const tokA = makeToken({ id: 'tok-a', x: 0, y: 0 });
    const tokB = makeToken({ id: 'tok-b', x: 100, y: 0 });
    global.canvas.tokens.placeables = [tokA, tokB];
    global.game.combat = makeCombat({
      combatants: [
        makeCombatant({ id: 'cbt-a', actorId: 'actor-a', tokenId: 'tok-a' }),
        makeCombatant({ id: 'cbt-b', actorId: 'actor-b', tokenId: 'tok-b' }),
      ],
    });
    initAdjacencyPush(send);
    pushAdjacencyState();
    return grab(send, RELAY.ADJACENCY);
  },

  [RELAY.POSITIONS]: () => {
    const send = jest.fn();
    const tok = makeToken({ id: 'tok-ashka', x: 300, y: 100 });
    global.canvas.tokens.placeables = [tok];
    global.game.combat = makeCombat({
      combatants: [makeCombatant({ id: 'cbt-ashka', actorId: 'actor-ashka', tokenId: 'tok-ashka' })],
    });
    initPositions(send);
    pushPositions();
    return grab(send, RELAY.POSITIONS);
  },

  [RELAY.ACTORFEED]: () => {
    const send = jest.fn();
    initActorFeed(send);
    const combat = makeCombat({
      id: 'c1',
      combatants: [
        makeCombatant({ id: 'cbt-hero', name: 'Hero', actorId: 'actor-hero', initiative: 20 }),
        makeCombatant({ id: 'cbt-foe', name: 'Foe', actorId: 'actor-foe', initiative: 10 }),
      ],
      activeTurnIndex: 0,
    });
    global.game.combat = combat;
    global.Hooks.fire('createCombat', combat);
    // Populate feed[] with a representative strike entry.
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'attack-roll', outcome: 'success',
      itemName: 'Longsword', itemType: 'weapon', targetName: 'Foe',
    }));
    return grab(send, RELAY.ACTORFEED);
  },

  [RELAY.EXPLOREMOVE]: () => {
    const send = movementWorld();
    initDoors(send);
    global.canvas.walls = { placeables: [], get: jest.fn() };
    global.Hooks.callAll('updateWall', { door: 1 }, { ds: 1 }, {}, 'user1');
    return grab(send, RELAY.EXPLOREMOVE);
  },
};

// --- the contract ------------------------------------------------------------

describe('bridge relay contract (#1308)', () => {
  for (const [channel, capture] of Object.entries(RECIPES)) {
    test(`${channel} emission matches __fixtures__/relay/${channel}.json`, async () => {
      const emitted = stableTs(await capture());
      const file = path.join(FIXTURE_DIR, `${channel}.json`);

      if (RECORD) {
        fs.writeFileSync(file, JSON.stringify(emitted, null, 2) + '\n');
        return;
      }

      if (!fs.existsSync(file)) {
        throw new Error(`missing fixture ${channel}.json — run RELAY_FIXTURES=record npm run test:bridge -- --testPathPattern=relayContract`);
      }
      const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(typeof emitted.characterId).toBe('string');
      expect(diffShapes(emitted, fixture)).toEqual([]);
    });
  }
});
