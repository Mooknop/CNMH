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

  test("an ally's square is blocked, not reachable", async () => {
    const ally = makeToken({ id: 'tok-ally', x: 600, y: 500 }); // grid (6,5)
    setupPellias({ allies: [ally] });

    await handleMoveRequest('Pellias', { moveType: 'step', ts: 1 });
    const { reachable, blocked } = send.mock.calls[0][2];

    expect(blocked).toContainEqual({ col: 6, row: 5 });
    expect(reachable).toHaveLength(7);
    expect(reachable.find((s) => s.col === 6 && s.row === 5)).toBeUndefined();
  });

  test('a wall-blocked square is reported blocked', async () => {
    setupPellias();
    // Block movement into (6,5) only.
    global.CONFIG.Canvas.polygonBackends.move.testCollision = (origin, dest) =>
      dest.x === 600 && dest.y === 500;

    await handleMoveRequest('Pellias', { moveType: 'step', ts: 1 });
    const { reachable, blocked } = send.mock.calls[0][2];
    expect(blocked).toContainEqual({ col: 6, row: 5 });
    expect(reachable).toHaveLength(7);
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
