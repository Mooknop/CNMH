// Doors module: adjacency filter, open/close, locked skip, scene-scoped feed,
// updateWall auto-off + re-push.
//
// The world is built with `installWalls`, which is STRICTLY real-shaped (#452):
// `c`/`door`/`ds` live on the WallDocument and nowhere else, the placeable that
// wraps it exposes only `id` + `document`, and `drawn: false` models the live
// client whose walls layer was never drawn.

import {
  initDoors, handleDoorRequest, handleSceneDoorRequest, handleDoorInteract, pushSceneDoors,
} from './doors.js';
import { updateActorMap } from './encounter.js';
import { initMovement } from './movement.js';
import { makeActor, makeToken, makeWallDocument, installWalls } from './test/foundryMock.js';

let send;

function setupPellias({ x = 500, y = 500 } = {}) {
  const token = makeToken({ id: 'tok-pellias', x, y });
  const actor = makeActor({ id: 'actor-pellias', tokens: [token] });
  token.actor = actor;
  global.game.actors.set('actor-pellias', actor);
  global.canvas.tokens.placeables = [token];
  return { token, actor };
}

// Last emission on one channel: { charId, value }.
const grab = (key) => {
  const call = send.mock.calls.filter((c) => c[1] === key).at(-1);
  return call ? { charId: call[0], value: call[2] } : null;
};

beforeEach(() => {
  send = jest.fn();
  updateActorMap({ 'actor-pellias': 'Pellias' });
  initMovement(send);
  initDoors(send);
  installWalls([]);
  send.mockClear();
});

describe('handleDoorRequest (per-character, adjacency-gated)', () => {
  test('sends dooropts with no doors when scene has no walls', () => {
    setupPellias();
    handleDoorRequest('Pellias', { ts: 1 });
    expect(send).toHaveBeenCalledWith('Pellias', 'dooropts', { doors: [], reqTs: 1 });
  });

  test('includes a regular door within 1.5 squares', () => {
    setupPellias({ x: 500, y: 500 }); // gridSize=100, centre at (550,550)
    // Door midpoint at (450,500) → dist from (550,550) ≈ 111 < 150 threshold
    installWalls([makeWallDocument({ id: 'w1', door: 1, ds: 0, c: [400, 500, 500, 500] })]);
    handleDoorRequest('Pellias', { ts: 42 });
    const { value } = grab('dooropts');
    expect(value.doors).toHaveLength(1);
    expect(value.doors[0]).toEqual({ wallId: 'w1', state: 0, x: 450, y: 500 });
    expect(value.reqTs).toBe(42);
  });

  test('excludes a door beyond 1.5 squares', () => {
    setupPellias({ x: 500, y: 500 }); // centre at (550,550)
    installWalls([makeWallDocument({ id: 'w2', door: 1, ds: 0, c: [850, 900, 950, 900] })]);
    handleDoorRequest('Pellias', { ts: 1 });
    expect(grab('dooropts').value.doors).toHaveLength(0);
  });

  test('excludes non-door walls', () => {
    setupPellias({ x: 500, y: 500 });
    installWalls([makeWallDocument({ id: 'w3', door: 0, ds: 0, c: [400, 500, 500, 500] })]);
    handleDoorRequest('Pellias', { ts: 1 });
    expect(grab('dooropts').value.doors).toHaveLength(0);
  });

  test('skips secret doors (door===2) that are closed', () => {
    setupPellias({ x: 500, y: 500 });
    installWalls([makeWallDocument({ id: 'w4', door: 2, ds: 0, c: [400, 500, 500, 500] })]);
    handleDoorRequest('Pellias', { ts: 1 });
    expect(grab('dooropts').value.doors).toHaveLength(0);
  });

  test('includes secret doors that are already open, WITHOUT the secret flag', () => {
    setupPellias({ x: 500, y: 500 });
    installWalls([makeWallDocument({ id: 'w5', door: 2, ds: 1, c: [400, 500, 500, 500] })]);
    handleDoorRequest('Pellias', { ts: 1 });
    const { value } = grab('dooropts');
    expect(value.doors).toHaveLength(1);
    expect(value.doors[0].state).toBe(1);
    // The player feed never advertises secrecy — shape unchanged (#1805).
    expect(value.doors[0]).not.toHaveProperty('secret');
    expect(value).not.toHaveProperty('sceneId');
  });

  test('returns nothing for unmapped character', () => {
    setupPellias();
    handleDoorRequest('Nobody', { ts: 1 });
    expect(send).not.toHaveBeenCalled();
  });

  // #452: the adapter used to read the placeable LAYER, which is empty on a
  // client whose walls layer was never drawn — green in CI, dead at the table.
  test('finds doors when the walls placeable layer is undrawn (#452)', () => {
    setupPellias({ x: 500, y: 500 });
    installWalls(
      [makeWallDocument({ id: 'w1', door: 1, ds: 0, c: [400, 500, 500, 500] })],
      { drawn: false },
    );
    expect(global.canvas.walls.placeables).toEqual([]);
    handleDoorRequest('Pellias', { ts: 1 });
    expect(grab('dooropts').value.doors).toHaveLength(1);
  });
});

describe('handleSceneDoorRequest (cnmh_doorreq_global → cnmh_dooropts_global)', () => {
  test('returns EVERY door on the scene with sceneId, no adjacency gate', () => {
    setupPellias({ x: 500, y: 500 });
    installWalls([
      makeWallDocument({ id: 'near', door: 1, ds: 0, c: [400, 500, 500, 500] }),
      makeWallDocument({ id: 'far', door: 1, ds: 1, c: [3000, 3000, 3100, 3000] }),
      makeWallDocument({ id: 'plain-wall', door: 0, ds: 0, c: [0, 0, 100, 0] }),
    ]);
    handleSceneDoorRequest({ ts: 77 });
    const { charId, value } = grab('dooropts');
    expect(charId).toBe('global');
    expect(value.sceneId).toBe('scene-1');
    expect(value.reqTs).toBe(77);
    expect(value.doors.map((d) => d.wallId)).toEqual(['near', 'far']);
    expect(value.doors[1]).toEqual({ wallId: 'far', state: 1, x: 3050, y: 3000 });
  });

  test('includes CLOSED secret doors flagged secret:true', () => {
    installWalls([
      makeWallDocument({ id: 'regular', door: 1, ds: 0, c: [400, 500, 500, 500] }),
      makeWallDocument({ id: 'hidden', door: 2, ds: 0, c: [800, 500, 900, 500] }),
      makeWallDocument({ id: 'locked', door: 1, ds: 2, c: [100, 100, 200, 100] }),
    ]);
    handleSceneDoorRequest({ ts: 5 });
    const byId = Object.fromEntries(grab('dooropts').value.doors.map((d) => [d.wallId, d]));
    expect(byId.hidden).toEqual({ wallId: 'hidden', state: 0, x: 850, y: 500, secret: true });
    expect(byId.regular).not.toHaveProperty('secret');
    expect(byId.locked).toEqual({ wallId: 'locked', state: 2, x: 150, y: 100 });
  });

  test('works with no ts and with an undrawn walls layer', () => {
    installWalls(
      [makeWallDocument({ id: 'w1', door: 1, ds: 0, c: [400, 500, 500, 500] })],
      { drawn: false },
    );
    handleSceneDoorRequest();
    const { value } = grab('dooropts');
    expect(value.reqTs).toBeNull();
    expect(value.doors).toHaveLength(1);
  });

  test('pushSceneDoors is a no-op before initDoors wired a sender', () => {
    // Re-init with no sender is not possible; assert the guard by clearing it.
    initDoors(null);
    expect(() => pushSceneDoors()).not.toThrow();
    initDoors(send);
  });
});

describe('handleDoorInteract', () => {
  test('opens a closed door', async () => {
    const doc = makeWallDocument({ id: 'w1', door: 1, ds: 0 });
    installWalls([doc]);
    await handleDoorInteract('Pellias', { wallId: 'w1', op: 'open', ts: 1 });
    expect(doc.update).toHaveBeenCalledWith({ ds: 1 }, expect.any(Object));
  });

  test('closes an open door', async () => {
    const doc = makeWallDocument({ id: 'w1', door: 1, ds: 1 });
    installWalls([doc]);
    await handleDoorInteract('Pellias', { wallId: 'w1', op: 'close', ts: 1 });
    expect(doc.update).toHaveBeenCalledWith({ ds: 0 }, expect.any(Object));
  });

  test('ignores a locked door (ds===2)', async () => {
    const doc = makeWallDocument({ id: 'w1', door: 1, ds: 2 });
    installWalls([doc]);
    await handleDoorInteract('Pellias', { wallId: 'w1', op: 'open', ts: 1 });
    expect(doc.update).not.toHaveBeenCalled();
  });

  test('ignores non-door walls', async () => {
    const doc = makeWallDocument({ id: 'w1', door: 0, ds: 0 });
    installWalls([doc]);
    await handleDoorInteract('Pellias', { wallId: 'w1', op: 'open', ts: 1 });
    expect(doc.update).not.toHaveBeenCalled();
  });

  test('ignores unknown wallId', async () => {
    installWalls([]);
    await expect(handleDoorInteract('Pellias', { wallId: 'nope', op: 'open', ts: 1 }))
      .resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  // #1805: `cnmh_doorinteract_global` is accepted alongside the per-char form —
  // the handler only needs the wallId.
  test('accepts the global id form', async () => {
    const doc = makeWallDocument({ id: 'w1', door: 1, ds: 0 });
    installWalls([doc]);
    await handleDoorInteract('global', { wallId: 'w1', op: 'open', ts: 1 });
    expect(doc.update).toHaveBeenCalledWith({ ds: 1 }, expect.any(Object));
  });

  // #452: the door rail must not depend on the placeable layer being drawn.
  test('toggles a door the undrawn walls layer cannot resolve (#452)', async () => {
    const doc = makeWallDocument({ id: 'w1', door: 1, ds: 0 });
    installWalls([doc], { drawn: false });
    expect(global.canvas.walls.get('w1')).toBeUndefined();
    await handleDoorInteract('Pellias', { wallId: 'w1', op: 'open', ts: 1 });
    expect(doc.update).toHaveBeenCalledWith({ ds: 1 }, expect.any(Object));
  });

  // Live WallDocument#update is async and can reject (e.g. a permission error).
  // The adapter swallows it into a warning so one dead door never kills the rail.
  test('a rejected update resolves instead of throwing', async () => {
    const doc = makeWallDocument({ id: 'w1', door: 1, ds: 0 });
    doc.update = jest.fn().mockRejectedValue(new Error('nope'));
    installWalls([doc]);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(handleDoorInteract('Pellias', { wallId: 'w1', op: 'open', ts: 1 }))
        .resolves.toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('updateWall hook', () => {
  const fireUpdateWall = (change, options = {}) => {
    const doc = global.canvas.scene.walls.get('w1') ?? { door: 1 };
    global.Hooks.callAll('updateWall', doc, change, options, 'user1');
  };

  beforeEach(() => {
    installWalls([makeWallDocument({ id: 'w1', door: 1, ds: 0, c: [400, 500, 500, 500] })]);
    send.mockClear();
  });

  test('pushing ds=1 fires exploremove false', () => {
    fireUpdateWall({ ds: 1 });
    expect(send).toHaveBeenCalledWith('global', 'exploremove', false);
  });

  test('pushing ds=0 does NOT fire exploremove', () => {
    fireUpdateWall({ ds: 0 });
    expect(grab('exploremove')).toBeNull();
  });

  test('bridge-sourced echo does not fire exploremove', () => {
    fireUpdateWall({ ds: 1 }, { _bridgeSource: 'app' });
    expect(grab('exploremove')).toBeNull();
  });

  // #1805: the scene feed re-pushes on EVERY ds change — the BRIDGE_SOURCE_FLAG
  // skip is scoped to the exploremove auto-off latch alone.
  test.each([
    ['native open',        { ds: 1 }, {}],
    ['native close',       { ds: 0 }, {}],
    ['app-initiated open', { ds: 1 }, { _bridgeSource: 'app' }],
  ])('re-pushes dooropts_global on %s', (_label, change, options) => {
    fireUpdateWall(change, options);
    const pushed = grab('dooropts');
    expect(pushed.charId).toBe('global');
    expect(pushed.value.sceneId).toBe('scene-1');
    expect(pushed.value.reqTs).toBeNull();
    expect(pushed.value.doors.map((d) => d.wallId)).toEqual(['w1']);
  });

  test('a non-door-state wall change pushes nothing', () => {
    fireUpdateWall({ c: [0, 0, 10, 10] });
    expect(send).not.toHaveBeenCalled();
  });

  test('a plain (non-door) wall opening pushes nothing', () => {
    installWalls([makeWallDocument({ id: 'w1', door: 0, ds: 0 })]);
    send.mockClear();
    fireUpdateWall({ ds: 1 });
    expect(send).not.toHaveBeenCalled();
  });
});
