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

import { initMovement, handleMoveRequest, handleMovePlan, handleMoveConfirm } from './movement.js';
import { initEncounter, updateActorMap } from './encounter.js';
import { initCharacterSync } from './characterSync.js';
import { initMinionSync, cacheMinions, _resetMinionCache } from './minionSync.js';
import { initMinionActors, pushMinionActors } from './minionActors.js';
import { initSummonPool, pushSummonPool } from './summonPool.js';
import { initDoors, handleDoorRequest, handleSceneDoorRequest } from './doors.js';
import { initDamageApply, handleDamageApply } from './damageApply.js';
import { initSaves, handleSaveRoll } from './saves.js';
import { initDice, handleRollRequest } from './dice.js';
import { initFoeKit } from './foekit.js';
import { initStrikes, handleStrikeRequest } from './strikes.js';
import { initCasts, handleCastRequest } from './casts.js';
import { initSnapshots, handleSnapshotRequest } from './snapshots.js';
import { initFlankingPush, pushFlankedState } from './flankingPush.js';
import { initAdjacencyPush, pushAdjacencyState } from './adjacencyPush.js';
import { initPositions, pushPositions } from './positions.js';
import { initPathPreview, _resetPathPreview } from './pathPreview.js';
import { initActorFeed } from './actorFeed.js';
import { initAuras, handleAuraSet, _resetAuras } from './auras.js';
import {
  installFoundryGlobals, makeActor, makeToken, makeCombat, makeCombatant,
  makeGame, makeChatMessage, equipV14Movement, makeTokenMovement,
  makeNpcStrike, makeSpellcastingEntry, makeSpellItem, makeAbilityItem,
  installTokenEmanation, makeWallDocument, installWalls,
} from './test/foundryMock.js';

const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'relay');
const RECORD = process.env.RELAY_FIXTURES === 'record';

// Last emission on the channel: { characterId, value }.
const grab = (send, key) => {
  const call = send.mock.calls.filter((c) => c[1] === key).at(-1);
  if (!call) throw new Error(`no '${key}' emission captured`);
  return { characterId: call[0], value: call[2] };
};

// Stamp a stable ts when recording (dmgdone/savedone/bridgehello carry
// Date.now(), actorfeed stamps each entry; the contract only checks the
// field's TYPE).
const STABLE_TS = 1700000000000;
const stableTs = (captured) => {
  let value = captured.value;
  if (value && typeof value === 'object') {
    if (typeof value.ts === 'number') value = { ...value, ts: STABLE_TS };
    if (Array.isArray(value.feed)) {
      value = {
        ...value,
        feed: value.feed.map((e) => (typeof e?.ts === 'number' ? { ...e, ts: STABLE_TS } : e)),
      };
    }
  }
  return value === captured.value ? captured : { ...captured, value };
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

// The pathpreview world (#1736 S3, #1744 WS-1): the movement world plus one
// `moveToken` hook fire for the PC token, with its visibility/disposition set
// so each channel's recipe drives its own audience.
function pathPreviewWorld({ disposition = 1, hidden = false, name = 'Pellias' } = {}) {
  const send = movementWorld();
  _resetPathPreview();
  initPathPreview(send);
  const token = global.canvas.tokens.placeables.find((t) => t.id === 'tok-pellias');
  Object.assign(token.document, { disposition, hidden, name });
  const { document, movement } = makeTokenMovement(token, {
    pending: [{ x: 600, y: 500 }, { x: 700, y: 600 }],
  });
  global.Hooks.fire('moveToken', document, movement, {}, 'user1');
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

  // Path rail (#1736 S1) — recorded on the v14 pipeline, which is where it
  // lives: findMovementPath → constrainMovementPath → measureMovementPath.
  [RELAY.MOVEPLANNED]: async () => {
    const send = movementWorld();
    global.game.release = { generation: 14 };
    equipV14Movement(global.canvas.tokens.get('tok-pellias'));
    await handleMovePlan('Pellias', {
      waypoints: [{ col: 6, row: 5 }, { col: 7, row: 5 }, { col: 8, row: 6 }],
      moveType: 'stride',
      ts: 999,
    });
    return grab(send, RELAY.MOVEPLANNED);
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
        makeCombatant({
          id: 'cbt-pellias', name: 'Pellias', actorId: 'actor-pellias', initiative: 18,
          token: { disposition: 1 },
        }),
        makeCombatant({
          id: 'cbt-goblin', name: 'Goblin', actorId: 'actor-goblin', initiative: 22,
          token: { disposition: -1 },
        }),
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
    installWalls([makeWallDocument({ id: 'w1', door: 1, ds: 0, c: [400, 500, 500, 500] })]);
    handleDoorRequest('Pellias', { ts: 42 });
    return grab(send, RELAY.DOOROPTS);
  },

  // The scene-scoped twin (#1805). Same RELAY type, `global` id, and a payload
  // the per-character feed does not carry: `sceneId` plus a `secret: true`
  // entry. Recorded with one regular, one SECRET and one LOCKED door so the
  // committed fixture covers every door row the GM overlay will meet.
  // Fixture: __fixtures__/relay/dooropts_global.json.
  dooropts_global: () => {
    const send = movementWorld();
    initDoors(send);
    // Secret door FIRST: diffShapes checks arrays against element [0], so this
    // is what makes `secret` part of the recorded contract rather than an
    // untested extra field.
    installWalls([
      makeWallDocument({ id: 'w2', door: 2, ds: 0, c: [800, 500, 900, 500] }),
      makeWallDocument({ id: 'w1', door: 1, ds: 0, c: [400, 500, 500, 500] }),
      makeWallDocument({ id: 'w3', door: 1, ds: 2, c: [100, 100, 200, 100] }),
    ]);
    handleSceneDoorRequest({ ts: 42 });
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

  [RELAY.ROLLDONE]: async () => {
    const send = jest.fn();
    initDice(send);
    updateActorMap({ 'actor-pellias': 'Pellias' });
    global.game.actors.set('actor-pellias', makeActor({ id: 'actor-pellias', name: 'Pellias' }));
    // Minimal core-Roll world: dice.js only touches validate/evaluate/toMessage
    // and ChatMessage.getSpeaker.
    global.Roll = class {
      static validate() { return true; }
      async evaluate() {
        this.total = 14;
        this.dice = [{ faces: 20, results: [{ result: 14, active: true }] }];
        return this;
      }
      async toMessage() {}
    };
    global.ChatMessage = { getSpeaker: () => ({ actor: 'actor-pellias', alias: 'Pellias' }) };
    try {
      await handleRollRequest({
        id: 'roll-1', charId: 'Pellias', formula: '1d20', flavor: 'Strike: Longsword (MAP 0)', ts: 1,
      });
    } finally {
      delete global.Roll;
      delete global.ChatMessage;
    }
    return grab(send, RELAY.ROLLDONE);
  },

  [RELAY.FOEKIT]: () => {
    const send = jest.fn();
    updateActorMap({ 'actor-pellias': 'Pellias' });
    initFoeKit(send);
    // A representative offensive kit: strike with MAP variants + typed damage,
    // an innate caster entry with a per-rank slot + a save spell, a reaction
    // ability, and listed skills — every optional field of the contract present.
    const goblin = makeActor({
      id: 'actor-gob', name: 'Goblin Warrior', level: 1,
      conditions: [{ slug: 'frightened', value: 1 }],
      strikes: [makeNpcStrike({ attackEffects: ['grab'] })],
      spellcasting: [makeSpellcastingEntry({
        castingType: 'innate',
        slots: { slot1: { value: 2, max: 2, prepared: [{ id: 'sp-fear', expended: false }] } },
        spells: [makeSpellItem({
          id: 'sp-fear', name: 'Fear', rank: 1,
          uses: { value: 1, max: 1 },
          save: { statistic: 'will', basic: false },
          traits: ['emotion', 'fear'],
          description: '<p>The target is frightened.</p>',
        })],
      })],
      abilities: [makeAbilityItem({
        name: 'Goblin Scuttle', actionType: 'reaction', actions: null,
        traits: ['goblin'], description: '<p>Step when an ally ends a move adjacent.</p>',
      })],
      skills: { acrobatics: { base: 5 } },
    });
    const combat = makeCombat({
      combatants: [makeCombatant({ id: 'cbt-gob', actorId: 'actor-gob', actor: goblin, initiative: 20 })],
      activeTurnIndex: 0,
    });
    global.game.combat = combat;
    global.Hooks.fire('createCombat', combat);
    return grab(send, RELAY.FOEKIT);
  },

  [RELAY.STRIKEDONE]: async () => {
    const send = jest.fn();
    initStrikes(send);
    const strike = makeNpcStrike();
    strike.variants[0].roll = jest.fn().mockResolvedValue({
      total: 24,
      dice: [{ faces: 20, results: [{ result: 14, active: true }] }],
      options: { degreeOfSuccess: 2 },
    });
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
    await handleStrikeRequest({
      id: 'strike-1', entryId: 'cbt-gob', actionIndex: 0, variant: 0,
      targets: ['cbt-pellias'], ts: 1,
    });
    return grab(send, RELAY.STRIKEDONE);
  },

  [RELAY.CASTDONE]: async () => {
    const send = jest.fn();
    initCasts(send);
    const fear = makeSpellItem({ id: 'sp-fear', name: 'Fear', rank: 1 });
    const entry = makeSpellcastingEntry({ id: 'sce-1', spells: [fear] });
    const goblin = makeActor({ id: 'actor-gob', name: 'Goblin Warrior', spellcasting: [entry] });
    global.game.combat = makeCombat({
      combatants: [makeCombatant({ id: 'cbt-gob', actorId: 'actor-gob', actor: goblin })],
    });
    await handleCastRequest({
      id: 'cast-1', entryId: 'cbt-gob', entryItemId: 'sce-1', spellId: 'sp-fear', rank: 1, ts: 1,
    });
    return grab(send, RELAY.CASTDONE);
  },

  [RELAY.SNAPDONE]: async () => {
    const send = jest.fn();
    initSnapshots(send);
    // Minimal PIXI/canvas world for the real adapter capture (#1573 B1) plus a
    // mocked secret + upload — the same seams snapshots.test.js drives.
    const out = {
      width: 0, height: 0,
      getContext: () => ({ drawImage: jest.fn() }),
      toDataURL: () => 'data:image/webp;base64,QUJD',
    };
    global.document = { createElement: () => out };
    global.PIXI = {
      RenderTexture: { create: () => ({ destroy: jest.fn() }) },
      Point: class { constructor(x, y) { this.x = x; this.y = y; } },
    };
    global.canvas = {
      app: {
        renderer: {
          screen: { width: 1200, height: 800 },
          render: jest.fn(),
          extract: { canvas: () => ({}) },
        },
        view: {},
      },
      stage: {
        worldTransform: { a: 1.5, b: 0, c: 0, d: 1.5, tx: -100, ty: -50 },
        toLocal: ({ x, y }) => ({ x: (x + 100) / 1.5, y: (y + 50) / 1.5 }),
      },
      scene: { id: 'scene-1', grid: { size: 100 } },
      notes: { visible: true },
      drawings: { visible: true },
      controls: { hud: { visible: true }, rulers: { visible: true } },
      tiles: { placeables: [] },
      tokens: { placeables: [] },
      dimensions: { width: 4000, height: 3000 },
    };
    global.game.settings = { get: (_m, key) => (key === 'bridgeSecret' ? 's3cret' : '') };
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'tok_abc.webp', url: '/api/images/tok_abc.webp' }),
    }));
    try {
      await handleSnapshotRequest({ id: 'snap-1', ts: 1 });
    } finally {
      delete global.fetch;
      delete global.document;
      delete global.PIXI;
    }
    return grab(send, RELAY.SNAPDONE);
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

  [RELAY.PATHPREVIEW]: () => {
    // Drive the real v14 `moveToken` hook against the mocked world (#1736 S3):
    // a mapped PC striding two cells, so `id` carries a charId and `path`
    // carries more than one row. FRIENDLY and visible — the only combination
    // the public channel carries at all (#1744 WS-1).
    const send = pathPreviewWorld({ disposition: 1 });
    return grab(send, RELAY.PATHPREVIEW);
  },

  [RELAY.PATHPREVIEWGM]: () => {
    // The unfiltered twin (#1744 WS-1): same payload shape, driven by a HIDDEN
    // HOSTILE mover — precisely the emission the public channel drops.
    const send = pathPreviewWorld({ disposition: -1, hidden: true, name: 'Ambusher' });
    if (send.mock.calls.some((c) => c[1] === RELAY.PATHPREVIEW)) {
      throw new Error('a hidden hostile mover reached the PUBLIC pathpreview channel');
    }
    return grab(send, RELAY.PATHPREVIEWGM);
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
    // Populate feed[] with a representative strike entry + its typed damage
    // roll (#1355 — damageTotal/damageInstances are part of the contract).
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'attack-roll', outcome: 'success',
      itemName: 'Longsword', itemType: 'weapon', targetName: 'Foe',
    }));
    global.Hooks.fire('createChatMessage', makeChatMessage({
      actorId: 'actor-hero', type: 'damage-roll',
      itemName: 'Longsword', itemType: 'weapon',
      targetName: 'Foe', targetActorId: 'actor-foe',
      damageInstances: [{ type: 'slashing', total: 9 }, { type: 'fire', total: 3 }],
    }));
    return grab(send, RELAY.ACTORFEED);
  },

  [RELAY.BRIDGEHELLO]: () => {
    // Mirrors the ROSTER recipe: isolate bridge.js, fire 'ready', open the
    // tracked socket → pushHello() (#1310).
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
      global.game = makeGame({});
      jest.isolateModules(() => {
        require('./bridge.js');
        global.Hooks.fire('ready');
        lastInstance.onopen();
      });
      const msg = lastInstance.sentMsgs.map((s) => JSON.parse(s)).find((m) => m.key === RELAY.BRIDGEHELLO);
      if (!msg) throw new Error('no bridgehello emission captured');
      return { characterId: msg.characterId, value: msg.value };
    } finally {
      jest.useRealTimers();
    }
  },

  // Aura membership (#1733 S2). The movement world plus one combatant ally and
  // one non-combatant bystander standing inside the ring, so the recorded
  // payload carries BOTH `inside` forms: `entryId` present for a token in the
  // current combat, absent for one that isn't. Hidden rides as a flag rather
  // than as an omission (#1749 OQ-5); the aura's own token is excluded.
  [RELAY.AURAMEMBERS]: async () => {
    const send = movementWorld();
    _resetAuras();
    initAuras(send);
    const ally = makeToken({ id: 'tok-ally-aura', x: 600, y: 500, disposition: 1, name: 'Zevira' });
    const lurker = makeToken({
      id: 'tok-lurker', x: 400, y: 500, disposition: -1, name: 'Shadow', hidden: true,
    });
    global.canvas.tokens.placeables = [...global.canvas.tokens.placeables, ally, lurker];
    global.game.combat = makeCombat({
      combatants: [makeCombatant({ id: 'cbt-ally-aura', actorId: null, tokenId: 'tok-ally-aura' })],
    });
    installTokenEmanation({ contains: [ally, lurker] });
    try {
      await handleAuraSet('Pellias', {
        active: true, feet: 10, label: 'Kinetic Aura', color: '#4a9c6d', ts: 1700000000000,
      });
      return grab(send, RELAY.AURAMEMBERS);
    } finally {
      delete global.foundry;
      _resetAuras();
    }
  },

  [RELAY.EXPLOREMOVE]: () => {
    const send = movementWorld();
    initDoors(send);
    const door = makeWallDocument({ id: 'w1', door: 1, ds: 1, c: [400, 500, 500, 500] });
    installWalls([door]);
    global.Hooks.callAll('updateWall', door, { ds: 1 }, {}, 'user1');
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
