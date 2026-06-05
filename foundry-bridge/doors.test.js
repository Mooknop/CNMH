// Doors module: adjacency filter, open/close, locked skip, updateWall auto-off.

import { initDoors, handleDoorRequest, handleDoorInteract } from './doors.js';
import { updateActorMap } from './encounter.js';
import { initMovement } from './movement.js';
import { makeActor, makeToken } from './test/foundryMock.js';

let send;

// Build a minimal wall stub that pf2eAdapter door fns understand.
function makeWall({ id, door = 1, ds = 0, c = [400, 400, 500, 400] } = {}) {
  const wallId = id ?? `wall-${Math.random().toString(36).slice(2)}`;
  const doc = { id: wallId, door, ds, c, update: jest.fn() };
  return { id: wallId, document: doc };
}

function setupPellias({ x = 500, y = 500 } = {}) {
  const token = makeToken({ id: 'tok-pellias', x, y });
  const actor = makeActor({ id: 'actor-pellias', tokens: [token] });
  token.actor = actor;
  global.game.actors.set('actor-pellias', actor);
  global.canvas.tokens.placeables = [token];
  return { token, actor };
}

beforeEach(() => {
  send = jest.fn();
  updateActorMap({ 'actor-pellias': 'Pellias' });
  initMovement(send);
  initDoors(send);
  // Reset walls each test
  global.canvas.walls = {
    placeables: [],
    get: jest.fn(),
  };
  send.mockClear();
});

describe('handleDoorRequest', () => {
  test('sends dooropts with no doors when scene has no walls', () => {
    setupPellias();
    handleDoorRequest('Pellias', { ts: 1 });
    expect(send).toHaveBeenCalledWith('Pellias', 'dooropts', { doors: [], reqTs: 1 });
  });

  test('includes a regular door within 1.5 squares', () => {
    setupPellias({ x: 500, y: 500 }); // gridSize=100, centre at (550,550)
    // Door midpoint at (450,500) → dist from (550,550) ≈ 111 < 150 threshold
    const wall = makeWall({ id: 'w1', door: 1, ds: 0, c: [400, 500, 500, 500] });
    global.canvas.walls.placeables = [wall];
    handleDoorRequest('Pellias', { ts: 42 });
    const [, , opts] = send.mock.calls[0];
    expect(opts.doors).toHaveLength(1);
    expect(opts.doors[0]).toMatchObject({ wallId: 'w1', state: 0 });
    expect(opts.reqTs).toBe(42);
  });

  test('excludes a door beyond 1.5 squares', () => {
    setupPellias({ x: 500, y: 500 }); // centre at (550,550)
    // Door midpoint at (900,900) → far away
    const wall = makeWall({ id: 'w2', door: 1, ds: 0, c: [850, 900, 950, 900] });
    global.canvas.walls.placeables = [wall];
    handleDoorRequest('Pellias', { ts: 1 });
    const [, , opts] = send.mock.calls[0];
    expect(opts.doors).toHaveLength(0);
  });

  test('excludes non-door walls', () => {
    setupPellias({ x: 500, y: 500 });
    const wall = makeWall({ id: 'w3', door: 0, ds: 0, c: [400, 500, 500, 500] });
    global.canvas.walls.placeables = [wall];
    handleDoorRequest('Pellias', { ts: 1 });
    const [, , opts] = send.mock.calls[0];
    expect(opts.doors).toHaveLength(0);
  });

  test('skips secret doors (door===2) that are closed', () => {
    setupPellias({ x: 500, y: 500 });
    const wall = makeWall({ id: 'w4', door: 2, ds: 0, c: [400, 500, 500, 500] });
    global.canvas.walls.placeables = [wall];
    handleDoorRequest('Pellias', { ts: 1 });
    const [, , opts] = send.mock.calls[0];
    expect(opts.doors).toHaveLength(0);
  });

  test('includes secret doors that are already open', () => {
    setupPellias({ x: 500, y: 500 });
    const wall = makeWall({ id: 'w5', door: 2, ds: 1, c: [400, 500, 500, 500] });
    global.canvas.walls.placeables = [wall];
    handleDoorRequest('Pellias', { ts: 1 });
    const [, , opts] = send.mock.calls[0];
    expect(opts.doors).toHaveLength(1);
    expect(opts.doors[0].state).toBe(1);
  });

  test('returns nothing for unmapped character', () => {
    setupPellias();
    handleDoorRequest('Nobody', { ts: 1 });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('handleDoorInteract', () => {
  test('opens a closed door', () => {
    const wall = makeWall({ id: 'w1', door: 1, ds: 0 });
    global.canvas.walls.get = jest.fn((id) => id === 'w1' ? wall : null);
    handleDoorInteract('Pellias', { wallId: 'w1', op: 'open', ts: 1 });
    expect(wall.document.update).toHaveBeenCalledWith({ ds: 1 }, expect.any(Object));
  });

  test('closes an open door', () => {
    const wall = makeWall({ id: 'w1', door: 1, ds: 1 });
    global.canvas.walls.get = jest.fn((id) => id === 'w1' ? wall : null);
    handleDoorInteract('Pellias', { wallId: 'w1', op: 'close', ts: 1 });
    expect(wall.document.update).toHaveBeenCalledWith({ ds: 0 }, expect.any(Object));
  });

  test('ignores a locked door (ds===2)', () => {
    const wall = makeWall({ id: 'w1', door: 1, ds: 2 });
    global.canvas.walls.get = jest.fn((id) => id === 'w1' ? wall : null);
    handleDoorInteract('Pellias', { wallId: 'w1', op: 'open', ts: 1 });
    expect(wall.document.update).not.toHaveBeenCalled();
  });

  test('ignores unknown wallId', () => {
    global.canvas.walls.get = jest.fn(() => null);
    // Should not throw
    handleDoorInteract('Pellias', { wallId: 'nope', op: 'open', ts: 1 });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('updateWall auto-off', () => {
  test('pushing ds=1 fires exploremove false', () => {
    const wallDoc = { door: 1 };
    // Simulate Foundry firing the updateWall hook with a door opening.
    global.Hooks.callAll('updateWall', wallDoc, { ds: 1 }, {}, 'user1');
    expect(send).toHaveBeenCalledWith('global', 'exploremove', false);
  });

  test('pushing ds=0 does NOT fire exploremove', () => {
    const wallDoc = { door: 1 };
    global.Hooks.callAll('updateWall', wallDoc, { ds: 0 }, {}, 'user1');
    expect(send).not.toHaveBeenCalled();
  });

  test('bridge-sourced updateWall echo is ignored', () => {
    const wallDoc = { door: 1 };
    global.Hooks.callAll('updateWall', wallDoc, { ds: 1 }, { _bridgeSource: 'app' }, 'user1');
    expect(send).not.toHaveBeenCalled();
  });
});
