// pathPreview tests (#1736 S3): hook wiring against the VERIFIED v14 movement
// hooks, reverse mover-id resolution across all three id spaces, pixel→cell
// path conversion, plan-phase throttling, and init resilience when the running
// build has no such hook.

import {
  initPathPreview, getLatestPathPreview, _resetPathPreview, PLAN_THROTTLE_MS,
} from './pathPreview.js';
import { resolveMoverId } from './movement.js';
import { updateActorMap } from './encounter.js';
import {
  makeActor, makeCombat, makeCombatant, makeGame, makeToken, makeTokenMovement,
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

// A mapped PC (Pellias) with a token at grid (5,5).
function pcWorld() {
  const token = makeToken({ id: 'tok-pellias', x: 500, y: 500 });
  const actor = makeActor({ id: 'actor-pellias', name: 'Pellias', tokens: [token] });
  token.actor = actor;
  global.game.actors.set('actor-pellias', actor);
  global.canvas.tokens.placeables = [token];
  updateActorMap({ 'actor-pellias': 'Pellias' });
  return token;
}

// Grab the last pathpreview emission.
const lastSend = () => send.mock.calls.filter((c) => c[1] === 'pathpreview').at(-1);
const previews = () => send.mock.calls.filter((c) => c[1] === 'pathpreview').map((c) => c[2]);

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
    const { document, movement } = makeTokenMovement(token, {
      pending: [{ x: 600, y: 500 }],
    });
    global.Hooks.fire('moveToken', document, movement, {}, 'user1');

    const [characterId, key, payload] = lastSend();
    expect(characterId).toBe('global');
    expect(key).toBe('pathpreview');
    expect(payload).toMatchObject({
      tokenId: 'tok-pellias',
      id: 'Pellias',
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

  test('an anonymous token still previews, with a null id', () => {
    const token = makeToken({ id: 'tok-rando', x: 100, y: 100 });
    token.actor = makeActor({ id: 'actor-rando', tokens: [token] });
    global.canvas.tokens.placeables = [token];
    initPathPreview(send);
    const { document, movement } = makeTokenMovement(token, { pending: [{ x: 200, y: 100 }] });
    global.Hooks.fire('moveToken', document, movement, {}, 'user1');

    expect(lastSend()[2]).toMatchObject({ tokenId: 'tok-rando', id: null });
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
    const { document, movement } = makeTokenMovement(token, { pending: [{ x: 300, y: 250 }] });
    global.Hooks.fire('moveToken', document, movement, {}, 'user1');

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
    const { document, movement } = makeTokenMovement(token, { pending: [{ x: 600, y: 500 }] });
    global.Hooks.fire('moveToken', document, movement, {}, 'user1');
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
    expect(previews().map((p) => p.tokenId)).toEqual(['tok-pellias', 'tok-ogre']);
  });

  test('move-phase emissions are never throttled', () => {
    const token = pcWorld();
    initPathPreview(send);
    const fireMove = (x, y) => {
      const { document, movement } = makeTokenMovement(token, { pending: [{ x, y }] });
      global.Hooks.fire('moveToken', document, movement, {}, 'user1');
    };
    fireMove(600, 500);
    fireMove(700, 500);
    fireMove(800, 500);
    expect(previews()).toHaveLength(3);
  });

  test('a move supersedes the plan still waiting on the trailing edge', () => {
    const token = pcWorld();
    initPathPreview(send);

    firePlan(token, 600, 500);   // leading edge sends
    firePlan(token, 700, 500);   // queued as trailing
    const { document, movement } = makeTokenMovement(token, { pending: [{ x: 800, y: 500 }] });
    global.Hooks.fire('moveToken', document, movement, {}, 'user1');

    jest.advanceTimersByTime(PLAN_THROTTLE_MS * 4);
    const sent = previews();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ phase: 'move', path: [{ col: 8, row: 5 }] });
  });
});
