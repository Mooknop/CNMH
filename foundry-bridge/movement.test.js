// Movement unit tests — reachable-square computation + confirm/move write-back.
// Geometry logic lives here; raw canvas/actor reads go through the adapter.

import { initMovement, handleMoveRequest, handleMoveConfirm } from './movement.js';
import { updateActorMap } from './encounter.js';
import { makeActor, makeToken } from './test/foundryMock.js';
import { BRIDGE_SOURCE_FLAG } from './utils.js';

let send;

// Pellias' token at grid (5,5) on a 100px grid, speed 10ft (2 squares).
function setupPellias({ speed = 10, allies = [] } = {}) {
  const token = makeToken({ id: 'tok-pellias', x: 500, y: 500 });
  const actor = makeActor({ id: 'actor-pellias', speed, tokens: [token] });
  token.actor = actor;
  global.game.actors.set('actor-pellias', actor);
  global.canvas.tokens.placeables = [token, ...allies];
  return { token, actor };
}

beforeEach(() => {
  send = jest.fn();
  updateActorMap({ 'actor-pellias': 'Pellias' });
  initMovement(send);
});

describe('handleMoveRequest', () => {
  test('step yields the 8 adjacent squares, echoing reqTs', async () => {
    setupPellias();
    await handleMoveRequest('Pellias', { moveType: 'step', ts: 999 });

    expect(send).toHaveBeenCalledTimes(1);
    const [charId, key, opts] = send.mock.calls[0];
    expect(charId).toBe('Pellias');
    expect(key).toBe('moveopts');
    expect(opts.origin).toEqual({ col: 5, row: 5 });
    expect(opts.maxFeet).toBe(5);
    expect(opts.gridSize).toBe(100);
    expect(opts.reqTs).toBe(999);
    expect(opts.reachable).toHaveLength(8);
    expect(opts.blocked).toHaveLength(0);
  });

  test("an ally's square is blocked as kind 'ally', not reachable", async () => {
    // disposition FRIENDLY (1) → classified as an ally obstacle.
    const ally = makeToken({ id: 'tok-ally', x: 600, y: 500, disposition: 1 }); // grid (6,5)
    setupPellias({ allies: [ally] });

    await handleMoveRequest('Pellias', { moveType: 'step', ts: 1 });
    const { reachable, blocked } = send.mock.calls[0][2];

    expect(blocked).toContainEqual({ col: 6, row: 5, kind: 'ally' });
    expect(reachable).toHaveLength(7);
    expect(reachable.find((s) => s.col === 6 && s.row === 5)).toBeUndefined();
  });

  test("a hostile token's square is blocked as kind 'enemy'", async () => {
    // disposition HOSTILE (-1) → classified as an enemy obstacle.
    const enemy = makeToken({ id: 'tok-goblin', x: 600, y: 500, disposition: -1 }); // grid (6,5)
    setupPellias({ allies: [enemy] });

    await handleMoveRequest('Pellias', { moveType: 'step', ts: 1 });
    const { blocked } = send.mock.calls[0][2];

    expect(blocked).toContainEqual({ col: 6, row: 5, kind: 'enemy' });
  });

  test("a wall-blocked square is reported blocked as kind 'wall'", async () => {
    setupPellias();
    // Collision is measured CENTER-to-CENTER. Pellias' token is at (500,500) on a
    // 100px grid, so origin centre is (550,550) and the (6,5) cell centre is
    // (650,550). Block movement into (6,5) only.
    global.CONFIG.Canvas.polygonBackends.move.testCollision = (origin, dest) =>
      dest.x === 650 && dest.y === 550;

    await handleMoveRequest('Pellias', { moveType: 'step', ts: 1 });
    const { reachable, blocked } = send.mock.calls[0][2];
    expect(blocked).toContainEqual({ col: 6, row: 5, kind: 'wall' });
    expect(reachable).toHaveLength(7);
  });

  test('center-to-center: a wall on the grid line is NOT a false block', async () => {
    setupPellias();
    // Regression for the corner-to-corner bug. A corner-origin ray from (500,500)
    // would clip a wall lying on the x=600 / y=500 grid lines; the center ray from
    // (550,550) does not. Simulate "only the literal cell corners collide" — the
    // center ray to every neighbour should pass, so nothing is blocked.
    global.CONFIG.Canvas.polygonBackends.move.testCollision = (origin, dest) =>
      // Old (buggy) corner coords would have been multiples of 100; assert the
      // backend is never queried with a corner-aligned point.
      dest.x % 100 === 0 && dest.y % 100 === 0;

    await handleMoveRequest('Pellias', { moveType: 'step', ts: 1 });
    const { reachable, blocked } = send.mock.calls[0][2];
    expect(blocked).toHaveLength(0);
    expect(reachable).toHaveLength(8);
  });

  test('center-to-center: a wall crossing the centre ray IS blocked', async () => {
    setupPellias();
    // Wall crosses the centre-to-centre segment into (6,5) → genuinely blocked.
    global.CONFIG.Canvas.polygonBackends.move.testCollision = (origin, dest) =>
      dest.x === 650 && dest.y === 550;

    await handleMoveRequest('Pellias', { moveType: 'step', ts: 1 });
    const { reachable, blocked } = send.mock.calls[0][2];
    expect(blocked).toContainEqual({ col: 6, row: 5, kind: 'wall' });
    expect(reachable.find((s) => s.col === 6 && s.row === 5)).toBeUndefined();
  });

  test('stride uses full land speed (2 squares → 5x5 minus center)', async () => {
    setupPellias({ speed: 10 });
    await handleMoveRequest('Pellias', { moveType: 'stride', ts: 1 });
    const { maxFeet, reachable } = send.mock.calls[0][2];
    expect(maxFeet).toBe(10);
    // 5x5 block (radius 2) minus the origin = 24 squares, all within 10ft chebyshev.
    expect(reachable).toHaveLength(24);
  });

  test('unmapped character → no options pushed', async () => {
    setupPellias();
    await handleMoveRequest('Nobody', { moveType: 'step', ts: 1 });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('handleMoveConfirm', () => {
  test('moves the token (echo-tagged) and reports the new position + feet', async () => {
    const { token } = setupPellias();

    await handleMoveConfirm('Pellias', {
      destination: { col: 6, row: 5 },
      moveType: 'step',
      ts: 42,
    });

    expect(token.document.update).toHaveBeenCalledWith(
      { x: 600, y: 500 },
      { [BRIDGE_SOURCE_FLAG]: 'app', animate: true },
    );
    expect(send).toHaveBeenCalledWith('Pellias', 'movedone', {
      newPosition: { col: 6, row: 5, x: 600, y: 500 },
      feetMoved: 5,
      reqTs: 42,
    });
  });

  test('unmapped character → no move, no push', async () => {
    const { token } = setupPellias();
    await handleMoveConfirm('Nobody', { destination: { col: 6, row: 5 }, ts: 1 });
    expect(token.document.update).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
