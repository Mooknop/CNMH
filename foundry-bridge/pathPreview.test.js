// pathPreview tests (#1736 S3, #1744 WS-1): hook wiring against the VERIFIED
// v14 movement hooks, the public/GM visibility split, scene identity + the
// token's-own-grid conversion, reverse mover-id resolution across all three id
// spaces, pixel→cell path conversion, plan-phase throttling, and init
// resilience when the running build has no such hook.

import {
  initPathPreview, getLatestPathPreview, isPubliclyVisible, _resetPathPreview,
  PLAN_THROTTLE_MS,
} from './pathPreview.js';
import { resolveMoverId } from './movement.js';
import { updateActorMap } from './encounter.js';
import {
  makeActor, makeCombat, makeCombatant, makeGame, makeScene, makeToken, makeTokenMovement,
} from './test/foundryMock.js';

let send;

beforeEach(() => {
  _resetPathPreview();
  send = jest.fn();
  global.canvas.tokens.placeables = [];
  updateActorMap({});
});

afterEach(() => {
  _resetPathPreview();
});

// A mapped PC (Pellias) with a FRIENDLY, visible token at grid (5,5) — the one
// combination that reaches the public channel.
function pcWorld(tokenOpts = {}) {
  const token = makeToken({
    id: 'tok-pellias', x: 500, y: 500, disposition: 1, name: 'Pellias', ...tokenOpts,
  });
  const actor = makeActor({ id: 'actor-pellias', name: 'Pellias', tokens: [token] });
  token.actor = actor;
  global.game.actors.set('actor-pellias', actor);
  global.canvas.tokens.placeables = [token];
  updateActorMap({ 'actor-pellias': 'Pellias' });
  return token;
}

// Emissions per channel.
const previews = (key = 'pathpreview') =>
  send.mock.calls.filter((c) => c[1] === key).map((c) => c[2]);
const gmPreviews = () => previews('pathpreviewgm');
const lastSend = (key = 'pathpreview') =>
  send.mock.calls.filter((c) => c[1] === key).at(-1);

// Fire one `moveToken` for a token, one cell east.
const fireMove = (token, x = token.x + 100, y = token.y) => {
  const { document, movement } = makeTokenMovement(token, { pending: [{ x, y }] });
  global.Hooks.fire('moveToken', document, movement, {}, 'user1');
};

describe('hook wiring', () => {
  test('registers the verified v14 movement hooks — planToken and moveToken', () => {
    initPathPreview(send);
    expect(Object.keys(global.Hooks._handlers)).toEqual(
      expect.arrayContaining(['planToken', 'moveToken'])
    );
  });

  // preMoveToken only executes on the client that initiated the update, i.e.
  // never for the GM-drag / other-player moves this push exists to surface.
  test('does not register preMoveToken', () => {
    initPathPreview(send);
    expect(global.Hooks._handlers.preMoveToken).toBeUndefined();
  });

  test('init survives a build whose hook registry rejects the name', () => {
    global.Hooks.on = jest.fn(() => { throw new Error('unknown hook'); });
    expect(() => initPathPreview(send)).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  test('a hook that never fires emits nothing', () => {
    initPathPreview(send);
    global.Hooks.fire('someOtherHook', {});
    expect(send).not.toHaveBeenCalled();
  });

  test('moveToken emits on the global channel with phase "move"', () => {
    const token = pcWorld();
    initPathPreview(send);
    fireMove(token, 600, 500);

    const [characterId, key, payload] = lastSend();
    expect(characterId).toBe('global');
    expect(key).toBe('pathpreview');
    expect(payload).toMatchObject({
      tokenId: 'tok-pellias',
      id: 'Pellias',
      name: 'Pellias',
      disposition: 1,
      sceneId: 'scene-1',
      origin: { col: 5, row: 5 },
      path: [{ col: 6, row: 5 }],
      phase: 'move',
      source: 'foundry',
    });
    expect(typeof payload.ts).toBe('number');
    expect(getLatestPathPreview()).toBe(payload);
  });

  test('planToken reads the plan off document.movement and emits phase "plan"', () => {
    const token = pcWorld();
    initPathPreview(send);
    const { document } = makeTokenMovement(token, { pending: [{ x: 500, y: 600 }] });
    global.Hooks.fire('planToken', document);

    expect(lastSend()[2]).toMatchObject({
      phase: 'plan',
      origin: { col: 5, row: 5 },
      path: [{ col: 5, row: 6 }],
    });
  });

  test('emits nothing when the movement record carries no waypoints at all', () => {
    const token = pcWorld();
    initPathPreview(send);
    global.Hooks.fire('planToken', { ...token.document, id: token.id, actor: token.actor });
    expect(send).not.toHaveBeenCalled();
  });
});

// The correctness fix behind the whole slice (#1744 WS-1, epic OQ-2): the
// channel as merged in #1741 broadcast EVERY mover's route to every player
// device, hidden ambushers and GM drag-plans included.
describe('visibility filtering', () => {
  // [ label, token overrides, reaches the public channel? ]
  const MATRIX = [
    ['a visible friendly mover', { disposition: 1 }, true],
    ['a visible neutral mover', { disposition: 0 }, false],
    ['a visible hostile mover', { disposition: -1 }, false],
    ['a SECRET-disposition mover', { disposition: -2 }, false],
    ['a hidden friendly mover', { disposition: 1, hidden: true }, false],
    ['a hidden hostile mover', { disposition: -1, hidden: true }, false],
  ];

  test.each(MATRIX)('%s: public = %j', (_label, overrides, isPublic) => {
    const token = pcWorld(overrides);
    initPathPreview(send);
    fireMove(token);

    expect(previews()).toHaveLength(isPublic ? 1 : 0);
    // The GM channel carries every one of them, unfiltered.
    expect(gmPreviews()).toHaveLength(1);
  });

  test('both channels carry the SAME payload for a public mover', () => {
    const token = pcWorld();
    initPathPreview(send);
    fireMove(token);
    expect(previews()[0]).toBe(gmPreviews()[0]);
  });

  test('the GM payload of a hidden foe still names it', () => {
    const token = pcWorld({ disposition: -1, hidden: true, name: 'Ambusher' });
    initPathPreview(send);
    fireMove(token);
    expect(gmPreviews()[0]).toMatchObject({ name: 'Ambusher', disposition: -1 });
    // …and the payload never carries the hidden flag itself.
    expect(gmPreviews()[0].hidden).toBeUndefined();
  });

  test('the plan phase of a hostile mover never reaches players either', () => {
    const token = pcWorld({ disposition: -1 });
    initPathPreview(send);
    const { document } = makeTokenMovement(token, { pending: [{ x: 600, y: 500 }] });
    global.Hooks.fire('planToken', document);

    expect(previews()).toHaveLength(0);
    expect(gmPreviews()).toHaveLength(1);
  });

  test('isPubliclyVisible states the rule once', () => {
    expect(isPubliclyVisible({ hidden: false, disposition: 1 })).toBe(true);
    expect(isPubliclyVisible({ hidden: true, disposition: 1 })).toBe(false);
    expect(isPubliclyVisible({ hidden: false, disposition: 0 })).toBe(false);
    expect(isPubliclyVisible({ hidden: false, disposition: -2 })).toBe(false);
  });
});

// moveToken fires for every TokenDocument in the world, not just the scene the
// GM is looking at (#1744 WS-1).
describe('scene identity', () => {
  test('names the TOKEN\'s scene, not the active one', () => {
    const other = makeScene({ id: 'scene-dungeon', gridSize: 100 });
    const token = pcWorld({ scene: other });
    initPathPreview(send);
    fireMove(token, 600, 500);
    expect(lastSend()[2].sceneId).toBe('scene-dungeon');
  });

  test('converts cells against the token\'s OWN scene grid', () => {
    // Active canvas is 100px/square; the token lives on a 50px/square scene.
    const other = makeScene({ id: 'scene-tiny', gridSize: 50 });
    const token = pcWorld({ scene: other, x: 250, y: 250 });
    initPathPreview(send);
    fireMove(token, 300, 250);

    expect(lastSend()[2]).toMatchObject({
      sceneId: 'scene-tiny',
      origin: { col: 5, row: 5 },
      path: [{ col: 6, row: 5 }],
    });
  });

  test('a token with no scene of its own falls back to the active canvas', () => {
    const token = pcWorld();
    initPathPreview(send);
    fireMove(token, 600, 500);
    expect(lastSend()[2].sceneId).toBe('scene-1');
  });
});

describe('reverse mover-id resolution', () => {
  test('a mapped PC actor resolves to its charId', () => {
    const token = pcWorld();
    expect(resolveMoverId(token)).toBe('Pellias');
  });

  test('a player-owned companion resolves to <ownerCharId>-<role>', () => {
    const OWNED = { gm: 3, player1: 3 };
    const ashka = makeActor({
      id: 'actor-ashka', name: 'Ashka', type: 'character',
      hasPlayerOwner: true, ownership: OWNED,
    });
    const zevToken = makeToken({ id: 'tok-zev', x: 500, y: 500 });
    const zevira = makeActor({
      id: 'actor-zev', name: 'Zevira', type: 'npc',
      hasPlayerOwner: true, ownership: OWNED, tokens: [zevToken],
    });
    zevToken.actor = zevira;
    global.game = makeGame({
      actors: [ashka, zevira],
      users: [{ id: 'gm', isGM: true }, { id: 'player1', isGM: false }],
    });
    updateActorMap({ 'actor-ashka': 'Ashka' });
    global.canvas.tokens.placeables = [zevToken];

    expect(resolveMoverId(zevToken)).toBe('Ashka-companion');
  });

  test('an unmapped combatant resolves to its combat entryId', () => {
    const token = makeToken({ id: 'tok-ogre', x: 500, y: 500, disposition: -1 });
    token.actor = makeActor({ id: 'actor-ogre', tokens: [token] });
    global.game.combat = makeCombat({
      combatants: [makeCombatant({ id: 'combatant-ogre', token })],
    });
    global.canvas.tokens.placeables = [token];

    expect(resolveMoverId(token)).toBe('combatant-ogre');
  });

  test('a token the app knows nothing about resolves to null', () => {
    const token = makeToken({ id: 'tok-rando', x: 100, y: 100 });
    token.actor = makeActor({ id: 'actor-rando', tokens: [token] });
    global.canvas.tokens.placeables = [token];

    expect(resolveMoverId(token)).toBeNull();
  });

  test('an anonymous friendly token still previews, with a null id', () => {
    const token = makeToken({ id: 'tok-rando', x: 100, y: 100, disposition: 1, name: 'Villager' });
    token.actor = makeActor({ id: 'actor-rando', tokens: [token] });
    global.canvas.tokens.placeables = [token];
    initPathPreview(send);
    fireMove(token, 200, 100);

    expect(lastSend()[2]).toMatchObject({ tokenId: 'tok-rando', id: null, name: 'Villager' });
  });
});

describe('pixel → cell path conversion', () => {
  test('drops the origin waypoint and keeps the destination', () => {
    const token = pcWorld();
    initPathPreview(send);
    const { document, movement } = makeTokenMovement(token, {
      passed: [{ x: 500, y: 500 }, { x: 600, y: 500 }],
      pending: [{ x: 700, y: 600 }],
    });
    global.Hooks.fire('moveToken', document, movement, {}, 'user1');

    expect(lastSend()[2].path).toEqual([
      { col: 6, row: 5 },
      { col: 7, row: 6 },
    ]);
  });

  test('collapses consecutive duplicate cells across the passed/pending seam', () => {
    const token = pcWorld();
    initPathPreview(send);
    const { document, movement } = makeTokenMovement(token, {
      passed:  [{ x: 500, y: 500 }, { x: 600, y: 500 }],
      pending: [{ x: 600, y: 500 }, { x: 600, y: 600 }],
    });
    global.Hooks.fire('moveToken', document, movement, {}, 'user1');

    expect(lastSend()[2].path).toEqual([
      { col: 6, row: 5 },
      { col: 6, row: 6 },
    ]);
  });

  test('falls back to the destination when neither section carries waypoints', () => {
    const token = pcWorld();
    initPathPreview(send);
    global.Hooks.fire(
      'moveToken',
      { ...token.document, id: token.id, actor: token.actor },
      { origin: { x: 500, y: 500 }, destination: { x: 800, y: 500 } },
      {}, 'user1',
    );

    expect(lastSend()[2]).toMatchObject({
      origin: { col: 5, row: 5 },
      path: [{ col: 8, row: 5 }],
    });
  });

  test('a movement that never leaves its origin cell emits nothing', () => {
    const token = pcWorld();
    initPathPreview(send);
    const { document, movement } = makeTokenMovement(token, {
      passed: [{ x: 500, y: 500 }, { x: 500, y: 500 }],
    });
    global.Hooks.fire('moveToken', document, movement, {}, 'user1');

    expect(send).not.toHaveBeenCalled();
  });

  test('converts against the scene grid size, not a hardcoded 100', () => {
    global.canvas.scene.grid.size = 50;
    const token = pcWorld();
    token.x = 250; token.y = 250;
    initPathPreview(send);
    fireMove(token, 300, 250);

    expect(lastSend()[2]).toMatchObject({
      origin: { col: 5, row: 5 },
      path: [{ col: 6, row: 5 }],
    });
  });
});

describe('source field', () => {
  test('a Foundry-side move reads as source "foundry"', () => {
    const token = pcWorld();
    initPathPreview(send);
    fireMove(token, 600, 500);
    expect(lastSend()[2].source).toBe('foundry');
  });

  // The bridge's own moves are NOT suppressed — the other players want to watch
  // an app-driven stride happen too.
  test('a bridge-initiated move still emits, tagged source "app"', () => {
    const token = pcWorld();
    initPathPreview(send);
    const { document, movement } = makeTokenMovement(token, { pending: [{ x: 600, y: 500 }] });
    global.Hooks.fire('moveToken', document, movement, { _bridgeSource: 'app' }, 'user1');
    expect(lastSend()[2].source).toBe('app');
  });

  test('the flag is also read off the movement record updateOptions', () => {
    const token = pcWorld();
    initPathPreview(send);
    const { document, movement } = makeTokenMovement(token, {
      pending: [{ x: 600, y: 500 }],
      updateOptions: { _bridgeSource: 'app' },
    });
    global.Hooks.fire('moveToken', document, movement, {}, 'user1');
    expect(lastSend()[2].source).toBe('app');
  });
});

describe('plan-phase throttle', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  const firePlan = (token, x, y) => {
    const { document } = makeTokenMovement(token, { pending: [{ x, y }] });
    global.Hooks.fire('planToken', document);
  };

  test('coalesces a burst of plan hooks into a leading and a trailing emission', () => {
    const token = pcWorld();
    initPathPreview(send);

    firePlan(token, 600, 500);   // leading edge — sent immediately
    firePlan(token, 700, 500);
    firePlan(token, 800, 500);   // the path the drag actually ended on
    expect(previews()).toHaveLength(1);

    jest.advanceTimersByTime(PLAN_THROTTLE_MS);
    const sent = previews();
    expect(sent).toHaveLength(2);
    expect(sent[0].path).toEqual([{ col: 6, row: 5 }]);
    expect(sent[1].path).toEqual([{ col: 8, row: 5 }]);
  });

  test('a lone plan hook is not delayed', () => {
    const token = pcWorld();
    initPathPreview(send);
    firePlan(token, 600, 500);
    expect(previews()).toHaveLength(1);
    jest.advanceTimersByTime(PLAN_THROTTLE_MS * 4);
    expect(previews()).toHaveLength(1);
  });

  test('throttles per token — a second token is not held behind the first', () => {
    const pc = pcWorld();
    const foe = makeToken({ id: 'tok-ogre', x: 100, y: 100, disposition: -1 });
    foe.actor = makeActor({ id: 'actor-ogre', tokens: [foe] });
    global.canvas.tokens.placeables.push(foe);
    initPathPreview(send);

    firePlan(pc, 600, 500);
    firePlan(foe, 200, 100);
    // The foe is GM-only, so the split shows up here: both on the GM channel,
    // only the PC on the public one.
    expect(gmPreviews().map((p) => p.tokenId)).toEqual(['tok-pellias', 'tok-ogre']);
    expect(previews().map((p) => p.tokenId)).toEqual(['tok-pellias']);
  });

  test('the trailing edge keeps the audience the leading edge was classified with', () => {
    const foe = pcWorld({ disposition: -1 });
    initPathPreview(send);

    firePlan(foe, 600, 500);
    firePlan(foe, 700, 500);
    jest.advanceTimersByTime(PLAN_THROTTLE_MS);

    expect(gmPreviews()).toHaveLength(2);
    expect(previews()).toHaveLength(0);
  });

  test('move-phase emissions are never throttled', () => {
    const token = pcWorld();
    initPathPreview(send);
    fireMove(token, 600, 500);
    fireMove(token, 700, 500);
    fireMove(token, 800, 500);
    expect(previews()).toHaveLength(3);
  });

  test('a move supersedes the plan still waiting on the trailing edge', () => {
    const token = pcWorld();
    initPathPreview(send);

    firePlan(token, 600, 500);   // leading edge sends
    firePlan(token, 700, 500);   // queued as trailing
    fireMove(token, 800, 500);

    jest.advanceTimersByTime(PLAN_THROTTLE_MS * 4);
    const sent = previews();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ phase: 'move', path: [{ col: 8, row: 5 }] });
  });
});
