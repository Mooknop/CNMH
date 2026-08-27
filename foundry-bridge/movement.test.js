// Movement unit tests — reachable-square computation + confirm/move write-back.
// Geometry logic lives here; raw canvas/actor reads go through the adapter.

import {
  initMovement, setMoveDoneListener, handleMoveRequest, handleMovePlan, handleMoveConfirm,
  resolveToken,
} from './movement.js';
import { updateActorMap } from './encounter.js';
import {
  makeActor, makeToken, makeGame, makeCombat, makeCombatant, equipV14Movement,
} from './test/foundryMock.js';
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
  test('step yields the 8 adjacent squares, echoing reqTs + speed', async () => {
    setupPellias({ speed: 10 });
    await handleMoveRequest('Pellias', { moveType: 'step', ts: 999 });

    expect(send).toHaveBeenCalledTimes(1);
    const [charId, key, opts] = send.mock.calls[0];
    expect(charId).toBe('Pellias');
    expect(key).toBe('moveopts');
    expect(opts.origin).toEqual({ col: 5, row: 5 });
    expect(opts.speed).toBe(10);
    expect(opts.gridSize).toBe(100);
    expect(opts.reqTs).toBe(999);
    expect(opts.reachable).toHaveLength(8);
    expect(opts.blocked).toHaveLength(0);
  });

  test("an ally's square is reachable as a pass-through, not blocked (#456)", async () => {
    // disposition FRIENDLY (1) → steppable to move *through*, flagged passThrough.
    const ally = makeToken({ id: 'tok-ally', x: 600, y: 500, disposition: 1 }); // grid (6,5)
    setupPellias({ allies: [ally] });

    await handleMoveRequest('Pellias', { moveType: 'step', ts: 1 });
    const { reachable, blocked } = send.mock.calls[0][2];

    expect(blocked.find((b) => b.col === 6 && b.row === 5)).toBeUndefined();
    const cell = reachable.find((s) => s.col === 6 && s.row === 5);
    expect(cell).toMatchObject({ col: 6, row: 5, passThrough: true });
    expect(reachable).toHaveLength(8);
  });

  test('originOccupied is false when the token stands alone', async () => {
    setupPellias();
    await handleMoveRequest('Pellias', { moveType: 'step', ts: 1 });
    expect(send.mock.calls[0][2].originOccupied).toBe(false);
  });

  test('originOccupied is true when the token shares its cell with an ally (#456)', async () => {
    // Ally on Pellias' own square (5,5) — i.e. Pellias stepped through and is
    // standing on top of an ally; the move must not be allowed to stop here.
    const ally = makeToken({ id: 'tok-ally', x: 500, y: 500, disposition: 1 }); // grid (5,5)
    setupPellias({ allies: [ally] });

    await handleMoveRequest('Pellias', { moveType: 'step', ts: 1 });
    expect(send.mock.calls[0][2].originOccupied).toBe(true);
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

  test('stride probes the same 8 neighbours (stepper), not a speed-radius grid', async () => {
    setupPellias({ speed: 30 });
    await handleMoveRequest('Pellias', { moveType: 'stride', ts: 1 });
    const { reachable, blocked, speed } = send.mock.calls[0][2];
    // Stepper always probes one cell out regardless of Speed; Speed rides along
    // for the app's per-step action accounting.
    expect(reachable.length + blocked.length).toBe(8);
    expect(speed).toBe(30);
  });

  test('unmapped character → no options pushed', async () => {
    setupPellias();
    await handleMoveRequest('Nobody', { moveType: 'step', ts: 1 });
    expect(send).not.toHaveBeenCalled();
  });
});

// Exploration-mode movement ignores creature occupancy (#617/#1806): the
// movereq carries ignoreOccupancy: true and every #456 classification (ally
// pass-through, enemy blocked, originOccupied) is skipped — only walls/doors
// still block. Absent the flag, behavior is byte-for-byte the #456 suite above.
describe('handleMoveRequest with ignoreOccupancy (#617/#1806)', () => {
  test("an enemy's square is fully reachable, not blocked", async () => {
    const enemy = makeToken({ id: 'tok-goblin', x: 600, y: 500, disposition: -1 }); // grid (6,5)
    setupPellias({ allies: [enemy] });

    await handleMoveRequest('Pellias', { moveType: 'step', ts: 1, ignoreOccupancy: true });
    const { reachable, blocked } = send.mock.calls[0][2];

    expect(blocked.find((b) => b.col === 6 && b.row === 5)).toBeUndefined();
    const cell = reachable.find((s) => s.col === 6 && s.row === 5);
    expect(cell).toBeDefined();
    expect(cell.passThrough).toBeUndefined();
    expect(reachable).toHaveLength(8);
    expect(blocked).toHaveLength(0);
  });

  test("an ally's square is fully reachable, without the passThrough flag", async () => {
    const ally = makeToken({ id: 'tok-ally', x: 600, y: 500, disposition: 1 }); // grid (6,5)
    setupPellias({ allies: [ally] });

    await handleMoveRequest('Pellias', { moveType: 'step', ts: 1, ignoreOccupancy: true });
    const { reachable, blocked } = send.mock.calls[0][2];

    expect(blocked).toHaveLength(0);
    const cell = reachable.find((s) => s.col === 6 && s.row === 5);
    expect(cell).toMatchObject({ col: 6, row: 5 });
    expect(cell.passThrough).toBeUndefined();
  });

  test('originOccupied is false even while sharing a cell with an ally', async () => {
    // Same setup as the #456 originOccupied-true test, but with the flag set.
    const ally = makeToken({ id: 'tok-ally', x: 500, y: 500, disposition: 1 }); // grid (5,5)
    setupPellias({ allies: [ally] });

    await handleMoveRequest('Pellias', { moveType: 'step', ts: 1, ignoreOccupancy: true });
    expect(send.mock.calls[0][2].originOccupied).toBe(false);
  });

  test('walls still block — ignoreOccupancy only lifts creature occupancy', async () => {
    setupPellias();
    global.CONFIG.Canvas.polygonBackends.move.testCollision = (origin, dest) =>
      dest.x === 650 && dest.y === 550;

    await handleMoveRequest('Pellias', { moveType: 'step', ts: 1, ignoreOccupancy: true });
    const { reachable, blocked } = send.mock.calls[0][2];
    expect(blocked).toContainEqual({ col: 6, row: 5, kind: 'wall' });
    expect(reachable).toHaveLength(7);
  });

  test('absent flag reproduces #456 behavior byte-for-byte', async () => {
    const enemy = makeToken({ id: 'tok-goblin', x: 600, y: 500, disposition: -1 });
    setupPellias({ allies: [enemy] });

    await handleMoveRequest('Pellias', { moveType: 'step', ts: 1 });
    const { blocked } = send.mock.calls[0][2];
    expect(blocked).toContainEqual({ col: 6, row: 5, kind: 'enemy' });
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
    expect(send).toHaveBeenCalledWith('Pellias', 'movedone', expect.objectContaining({
      newPosition: { col: 6, row: 5, x: 600, y: 500 },
      feetMoved: 5,
      reqTs: 42,
    }));
  });

  test('piggybacks the destination cell options onto movedone (#451)', async () => {
    setupPellias();
    await handleMoveConfirm('Pellias', {
      destination: { col: 6, row: 5 }, moveType: 'stride', ts: 42,
    });

    const { nextOpts } = send.mock.calls[0][2];
    // Probed from the DESTINATION (6,5), not the old origin (5,5).
    expect(nextOpts.origin).toEqual({ col: 6, row: 5 });
    expect(nextOpts.reachable.length + nextOpts.blocked.length).toBe(8);
    expect(nextOpts.speed).toBe(10);
    // The old origin (5,5) is now an adjacent reachable cell of the destination.
    expect(nextOpts.reachable).toContainEqual(
      expect.objectContaining({ col: 5, row: 5 })
    );
  });

  test('piggybacked options reflect obstacles around the destination, not the origin', async () => {
    setupPellias();
    // Wall blocks the cell at (7,5) — the destination's east neighbour. Measured
    // center-to-center: destination (6,5) centre is (650,550), (7,5) is (750,550).
    global.CONFIG.Canvas.polygonBackends.move.testCollision = (origin, dest) =>
      dest.x === 750 && dest.y === 550;

    await handleMoveConfirm('Pellias', {
      destination: { col: 6, row: 5 }, moveType: 'stride', ts: 1,
    });

    const { nextOpts } = send.mock.calls[0][2];
    expect(nextOpts.blocked).toContainEqual({ col: 7, row: 5, kind: 'wall' });
  });

  test('unmapped character → no move, no push', async () => {
    const { token } = setupPellias();
    await handleMoveConfirm('Nobody', { destination: { col: 6, row: 5 }, ts: 1 });
    expect(token.document.update).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  test('ignoreOccupancy on the confirm carries into the piggybacked nextOpts (#617/#1806)', async () => {
    // Enemy sits at (7,5) — the east neighbour of the (6,5) landing cell.
    const enemy = makeToken({ id: 'tok-goblin', x: 700, y: 500, disposition: -1 });
    setupPellias({ allies: [enemy] });

    await handleMoveConfirm('Pellias', {
      destination: { col: 6, row: 5 }, moveType: 'stride', ts: 1, ignoreOccupancy: true,
    });

    const { nextOpts } = send.mock.calls[0][2];
    expect(nextOpts.blocked.find((b) => b.col === 7 && b.row === 5)).toBeUndefined();
    const cell = nextOpts.reachable.find((s) => s.col === 7 && s.row === 5);
    expect(cell).toBeDefined();
    expect(cell.passThrough).toBeUndefined();
    expect(nextOpts.originOccupied).toBe(false);
  });
});

// Plan → execute path rail (#1736 S1). Pellias sits at grid (5,5) on a 100px
// grid; every waypoint below is a cell to the east unless noted.
describe('handleMovePlan', () => {
  test('v14 pipeline: reports the resolved route, its cost, and the echoed ts', async () => {
    const { token } = setupPellias();
    global.game.release = { generation: 14 };
    equipV14Movement(token);

    await handleMovePlan('Pellias', {
      waypoints: [{ col: 6, row: 5 }, { col: 7, row: 5 }, { col: 8, row: 5 }],
      moveType: 'stride',
      ts: 77,
    });

    expect(send).toHaveBeenCalledTimes(1);
    const [charId, key, planned] = send.mock.calls[0];
    expect(charId).toBe('Pellias');
    expect(key).toBe('moveplanned');
    // Route cells excluding the origin; x,y are the cell's TOP-LEFT pixels.
    expect(planned.path).toEqual([
      { col: 6, row: 5, x: 600, y: 500 },
      { col: 7, row: 5, x: 700, y: 500 },
      { col: 8, row: 5, x: 800, y: 500 },
    ]);
    expect(planned.costFeet).toBe(15);
    expect(planned.clipped).toBe(false);
    expect(planned.reqTs).toBe(77);
  });

  test('v14 pipeline: core is asked for the route origin-first, in token corners', async () => {
    const { token } = setupPellias();
    global.game.release = { generation: 14 };
    equipV14Movement(token);

    await handleMovePlan('Pellias', { waypoints: [{ col: 6, row: 5 }], ts: 1 });

    // The rail thinks in creature centres (the collision/measurement backends
    // demand it) but core's path APIs take the token's TOP-LEFT — the adapter
    // owns that translation, and prepends the origin core expects at index 0.
    const [asked] = token.findMovementPath.mock.calls[0];
    expect(asked).toEqual([{ x: 500, y: 500 }, { x: 600, y: 500 }]);
  });

  test('v14 pipeline: cost comes from the terrain-aware measureMovementPath', async () => {
    const { token } = setupPellias();
    global.game.release = { generation: 14 };
    // Region difficult terrain: 10 ft per 5 ft leg. Pure grid geometry (what the
    // stepper's measureMoveCost sees) would report 10 for these two legs.
    equipV14Movement(token, { costPerLeg: 10 });

    await handleMovePlan('Pellias', {
      waypoints: [{ col: 6, row: 5 }, { col: 7, row: 5 }], ts: 2,
    });

    expect(send.mock.calls[0][2].costFeet).toBe(20);
    expect(token.document.measureMovementPath).toHaveBeenCalled();
  });

  test('v14 pipeline: a constrained route is reported clipped, ending where it stops', async () => {
    const { token } = setupPellias();
    global.game.release = { generation: 14 };
    // constrainMovementPath keeps origin + 1 leg — a wall two cells out.
    equipV14Movement(token, { clipAfter: 1 });

    await handleMovePlan('Pellias', {
      waypoints: [{ col: 6, row: 5 }, { col: 7, row: 5 }, { col: 8, row: 5 }], ts: 3,
    });

    const planned = send.mock.calls[0][2];
    expect(planned.path).toEqual([{ col: 6, row: 5, x: 600, y: 500 }]);
    expect(planned.costFeet).toBe(5);
    expect(planned.clipped).toBe(true);
  });

  test('without the v14 APIs the plan degrades to the stepper collision walk', async () => {
    setupPellias();
    // generation 13 (mock default), no findMovementPath — the same
    // center-to-center test the D-pad has always used, leg by leg.
    await handleMovePlan('Pellias', {
      waypoints: [{ col: 6, row: 5 }, { col: 7, row: 5 }], ts: 4,
    });

    const planned = send.mock.calls[0][2];
    expect(planned.path).toEqual([
      { col: 6, row: 5, x: 600, y: 500 },
      { col: 7, row: 5, x: 700, y: 500 },
    ]);
    expect(planned.costFeet).toBe(10);
    expect(planned.clipped).toBe(false);
  });

  test('degraded plan clips at the first wall-blocked leg', async () => {
    setupPellias();
    // A wall between (6,5) and (7,5): centres (650,550) → (750,550).
    global.CONFIG.Canvas.polygonBackends.move.testCollision = (origin, dest) =>
      origin.x === 650 && dest.x === 750;

    await handleMovePlan('Pellias', {
      waypoints: [{ col: 6, row: 5 }, { col: 7, row: 5 }], ts: 5,
    });

    const planned = send.mock.calls[0][2];
    expect(planned.path).toEqual([{ col: 6, row: 5, x: 600, y: 500 }]);
    expect(planned.clipped).toBe(true);
  });

  test('an empty or missing waypoint list pushes nothing', async () => {
    setupPellias();
    await handleMovePlan('Pellias', { waypoints: [], ts: 6 });
    await handleMovePlan('Pellias', { ts: 6 });
    expect(send).not.toHaveBeenCalled();
  });

  test('unmapped character → no plan pushed', async () => {
    setupPellias();
    await handleMovePlan('Nobody', { waypoints: [{ col: 6, row: 5 }], ts: 7 });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('handleMoveConfirm with waypoints (#1736 S1)', () => {
  test('executes the whole route in ONE move and reports the landing', async () => {
    const { token } = setupPellias();
    global.game.release = { generation: 14 };
    equipV14Movement(token);

    await handleMoveConfirm('Pellias', {
      destination: { col: 8, row: 5 },
      waypoints: [{ col: 6, row: 5 }, { col: 7, row: 5 }, { col: 8, row: 5 }],
      moveType: 'stride',
      ts: 55,
    });

    // One pipeline call carrying every waypoint as a top-left corner, tagged.
    expect(token.document.move).toHaveBeenCalledTimes(1);
    expect(token.document.move).toHaveBeenCalledWith(
      [{ x: 600, y: 500 }, { x: 700, y: 500 }, { x: 800, y: 500 }],
      { [BRIDGE_SOURCE_FLAG]: 'app' },
    );
    expect(token.document.update).not.toHaveBeenCalled();

    const [, key, done] = send.mock.calls[0];
    expect(key).toBe('movedone');
    expect(done.newPosition).toEqual({ col: 8, row: 5, x: 800, y: 500 });
    expect(done.feetMoved).toBe(15);
    expect(done.reqTs).toBe(55);
    expect(done.nextOpts.origin).toEqual({ col: 8, row: 5 });
  });

  test('a stop-short reports the ACTUAL landing and only the feet walked', async () => {
    const { token } = setupPellias();
    global.game.release = { generation: 14 };
    // The pipeline parks the token at (7,5) — one cell short of the request.
    equipV14Movement(token, { stopAt: { x: 700, y: 500 } });

    await handleMoveConfirm('Pellias', {
      waypoints: [{ col: 6, row: 5 }, { col: 7, row: 5 }, { col: 8, row: 5 }],
      moveType: 'stride',
      ts: 56,
    });

    const done = send.mock.calls[0][2];
    expect(done.newPosition).toEqual({ col: 7, row: 5, x: 700, y: 500 });
    expect(done.feetMoved).toBe(10);
    expect(done.nextOpts.origin).toEqual({ col: 7, row: 5 });
  });

  test('the route is re-planned at confirm time, so a fresh wall clips it', async () => {
    const { token } = setupPellias();
    // No v14 APIs → the degraded walk, and a wall that appeared after the plan.
    global.CONFIG.Canvas.polygonBackends.move.testCollision = (origin, dest) =>
      origin.x === 650 && dest.x === 750;

    await handleMoveConfirm('Pellias', {
      waypoints: [{ col: 6, row: 5 }, { col: 7, row: 5 }],
      moveType: 'stride',
      ts: 57,
    });

    expect(token.document.update).toHaveBeenCalledTimes(1);
    expect(token.document.update).toHaveBeenCalledWith(
      { x: 600, y: 500 },
      { [BRIDGE_SOURCE_FLAG]: 'app', animate: true },
    );
    const done = send.mock.calls[0][2];
    expect(done.newPosition).toEqual({ col: 6, row: 5, x: 600, y: 500 });
    expect(done.feetMoved).toBe(5);
  });

  test('a route blocked at its first leg still answers, with zero movement', async () => {
    const { token } = setupPellias();
    global.CONFIG.Canvas.polygonBackends.move.testCollision = () => true;

    await handleMoveConfirm('Pellias', {
      waypoints: [{ col: 6, row: 5 }], moveType: 'stride', ts: 58,
    });

    expect(token.document.update).not.toHaveBeenCalled();
    const done = send.mock.calls[0][2];
    expect(done.newPosition).toEqual({ col: 5, row: 5, x: 500, y: 500 });
    expect(done.feetMoved).toBe(0);
  });

  test('without the v14 pipeline the route walks waypoint by waypoint', async () => {
    const { token } = setupPellias();
    await handleMoveConfirm('Pellias', {
      waypoints: [{ col: 6, row: 5 }, { col: 6, row: 6 }], moveType: 'stride', ts: 59,
    });

    expect(token.document.update).toHaveBeenNthCalledWith(
      1, { x: 600, y: 500 }, { [BRIDGE_SOURCE_FLAG]: 'app', animate: true },
    );
    expect(token.document.update).toHaveBeenNthCalledWith(
      2, { x: 600, y: 600 }, { [BRIDGE_SOURCE_FLAG]: 'app', animate: true },
    );
    const done = send.mock.calls[0][2];
    expect(done.newPosition).toEqual({ col: 6, row: 6, x: 600, y: 600 });
    expect(done.feetMoved).toBe(10);
  });

  test('a confirm WITHOUT waypoints keeps the single-destination stepper flow', async () => {
    const { token } = setupPellias();
    global.game.release = { generation: 14 };
    equipV14Movement(token);

    await handleMoveConfirm('Pellias', {
      destination: { col: 6, row: 5 }, moveType: 'step', ts: 60,
    });

    // The stepper's own single-point move(), not the waypoint ARRAY form, and
    // the path planner is never consulted.
    expect(token.document.move).toHaveBeenCalledWith(
      { x: 600, y: 500 }, { [BRIDGE_SOURCE_FLAG]: 'app' },
    );
    expect(token.findMovementPath).not.toHaveBeenCalled();
    expect(send.mock.calls[0][2].newPosition).toEqual({ col: 6, row: 5, x: 600, y: 500 });
  });

  test('ignoreOccupancy on a waypoint confirm carries into the piggybacked nextOpts (#617/#1806)', async () => {
    // Enemy sits at (9,5) — the east neighbour of the (8,5) landing cell.
    const enemy = makeToken({ id: 'tok-goblin', x: 900, y: 500, disposition: -1 });
    const { token } = setupPellias({ allies: [enemy] });
    global.game.release = { generation: 14 };
    equipV14Movement(token);

    await handleMoveConfirm('Pellias', {
      destination: { col: 8, row: 5 },
      waypoints: [{ col: 6, row: 5 }, { col: 7, row: 5 }, { col: 8, row: 5 }],
      moveType: 'stride',
      ts: 61,
      ignoreOccupancy: true,
    });

    const { nextOpts } = send.mock.calls[0][2];
    expect(nextOpts.blocked.find((b) => b.col === 9 && b.row === 5)).toBeUndefined();
    const cell = nextOpts.reachable.find((s) => s.col === 9 && s.row === 5);
    expect(cell).toBeDefined();
    expect(cell.passThrough).toBeUndefined();
  });
});

// Minion movement (#362): a `<ownerCharId>-<role>` id isn't in the PC actor map;
// resolveToken falls back to the ownership-derived minion link → the minion's own
// Foundry actor token, so the whole movement state machine works unchanged.
describe('minion movement', () => {
  // Ashka (PC, mapped) + her companion Zevira (player-owned NPC) with a token on
  // the scene at grid (5,5). Build the world via makeGame so getMinionActorLinks
  // can iterate actors/users .contents.
  function setupMinion({ speed = 20 } = {}) {
    const GM = { id: 'gm', isGM: true };
    const PLAYER = { id: 'player1', isGM: false };
    const OWNED = { gm: 3, player1: 3 };
    const ashka = makeActor({
      id: 'actor-ashka', name: 'Ashka', type: 'character',
      hasPlayerOwner: true, ownership: OWNED,
    });
    const zevToken = makeToken({ id: 'tok-zev', x: 500, y: 500 });
    const zevira = makeActor({
      id: 'actor-zev', name: 'Zevira', type: 'npc',
      hasPlayerOwner: true, ownership: OWNED, speed, tokens: [zevToken],
    });
    global.game = makeGame({ actors: [ashka, zevira], users: [GM, PLAYER] });
    updateActorMap({ 'actor-ashka': 'Ashka' });
    global.canvas.tokens.placeables = [zevToken];
    return { zevToken, zevira };
  }

  test('resolveToken finds the minion token via its <owner>-<role> id', () => {
    const { zevToken } = setupMinion();
    expect(resolveToken('Ashka-companion')).toBe(zevToken);
  });

  test("resolveToken returns null for a minion that isn't linked", () => {
    setupMinion();
    expect(resolveToken('Ashka-familiar')).toBeNull();
  });

  test('handleMoveRequest pushes opts under the minion id, using the minion Speed', async () => {
    setupMinion({ speed: 20 });
    await handleMoveRequest('Ashka-companion', { moveType: 'stride', ts: 7 });

    expect(send).toHaveBeenCalledTimes(1);
    const [charId, key, opts] = send.mock.calls[0];
    expect(charId).toBe('Ashka-companion');
    expect(key).toBe('moveopts');
    expect(opts.origin).toEqual({ col: 5, row: 5 });
    expect(opts.speed).toBe(20);
    expect(opts.reqTs).toBe(7);
    expect(opts.reachable.length + opts.blocked.length).toBe(8);
  });

  test('handleMoveConfirm moves the minion token and reports movedone', async () => {
    const { zevToken } = setupMinion();
    await handleMoveConfirm('Ashka-companion', {
      destination: { col: 6, row: 5 }, moveType: 'stride', ts: 9,
    });

    expect(zevToken.document.update).toHaveBeenCalledWith(
      { x: 600, y: 500 },
      { [BRIDGE_SOURCE_FLAG]: 'app', animate: true },
    );
    expect(send).toHaveBeenCalledWith('Ashka-companion', 'movedone', expect.objectContaining({
      newPosition: { col: 6, row: 5, x: 600, y: 500 },
      feetMoved: 5,
      reqTs: 9,
    }));
  });
});

// Enemy movement (#1572): the GM dock moves the acting foe under its combat
// entryId. resolveToken falls through the actor map and the minion links to the
// active combat's combatant lookup, so the movement state machine (probe →
// confirm → piggybacked nextOpts) works unchanged for foes.
describe('enemy movement', () => {
  // An ogre combatant at grid (5,5), hostile, speed 25 — unmapped in the PC
  // actor map, so only the combatant branch can resolve it.
  function setupFoe({ speed = 25 } = {}) {
    const token = makeToken({ id: 'tok-ogre', x: 500, y: 500, disposition: -1 });
    const actor = makeActor({ id: 'actor-ogre', speed, tokens: [token] });
    token.actor = actor;
    const combatant = makeCombatant({ id: 'combatant-ogre', token });
    global.game.combat = makeCombat({ combatants: [combatant] });
    global.canvas.tokens.placeables = [token];
    return { token };
  }

  test('resolveToken finds the foe token via its combat entryId', () => {
    const { token } = setupFoe();
    expect(resolveToken('combatant-ogre')).toBe(token);
  });

  test('resolveToken returns null for an id no combatant matches', () => {
    setupFoe();
    expect(resolveToken('combatant-nobody')).toBeNull();
  });

  test('resolveToken returns null for an entryId outside combat', () => {
    setupFoe();
    global.game.combat = null;
    expect(resolveToken('combatant-ogre')).toBeNull();
  });

  test('handleMoveRequest pushes opts under the entryId, using the foe Speed', async () => {
    setupFoe({ speed: 25 });
    await handleMoveRequest('combatant-ogre', { moveType: 'stride', ts: 11 });

    expect(send).toHaveBeenCalledTimes(1);
    const [charId, key, opts] = send.mock.calls[0];
    expect(charId).toBe('combatant-ogre');
    expect(key).toBe('moveopts');
    expect(opts.origin).toEqual({ col: 5, row: 5 });
    expect(opts.speed).toBe(25);
    expect(opts.reqTs).toBe(11);
    expect(opts.reachable.length + opts.blocked.length).toBe(8);
  });

  test('handleMoveConfirm moves the foe token and reports movedone', async () => {
    const { token } = setupFoe();
    await handleMoveConfirm('combatant-ogre', {
      destination: { col: 6, row: 5 }, moveType: 'stride', ts: 12,
    });

    expect(token.document.update).toHaveBeenCalledWith(
      { x: 600, y: 500 },
      { [BRIDGE_SOURCE_FLAG]: 'app', animate: true },
    );
    expect(send).toHaveBeenCalledWith('combatant-ogre', 'movedone', expect.objectContaining({
      newPosition: { col: 6, row: 5, x: 600, y: 500 },
      feetMoved: 5,
      reqTs: 12,
    }));
  });

  test('v14 pipeline stop-short: movedone reports the ACTUAL landing (#1574)', async () => {
    const { token } = setupFoe();
    global.game.release = { generation: 14 };
    // The confirmed cell is (7,5), but the movement pipeline clamps the token
    // to (6,5) — e.g. a constraint the probe and Foundry judged differently.
    token.document.move = jest.fn(async () => {
      token.document.x = 600;
      token.document.y = 500;
    });

    await handleMoveConfirm('combatant-ogre', {
      destination: { col: 7, row: 5 }, moveType: 'stride', ts: 21,
    });

    expect(token.document.move).toHaveBeenCalled();
    expect(token.document.update).not.toHaveBeenCalled();
    const [, key, done] = send.mock.calls[0];
    expect(key).toBe('movedone');
    // Landing truth, not the request: cell (6,5) and the 5 ft actually walked.
    expect(done.newPosition).toEqual({ col: 6, row: 5, x: 600, y: 500 });
    expect(done.feetMoved).toBe(5);
    expect(done.reqTs).toBe(21);
    expect(done.nextOpts.origin).toEqual({ col: 6, row: 5 });
  });

  test('a mapped charId still resolves through the actor map, not the combat', () => {
    // A combatant whose id happens to equal a mapped charId must not shadow the
    // PC path (combatant ids are random Foundry ids, but the order is the guard).
    const pcToken = makeToken({ id: 'tok-pellias', x: 500, y: 500 });
    const pcActor = makeActor({ id: 'actor-pellias', speed: 10, tokens: [pcToken] });
    pcToken.actor = pcActor;
    global.game.actors.set('actor-pellias', pcActor);
    const decoy = makeToken({ id: 'tok-decoy', x: 900, y: 900 });
    global.game.combat = makeCombat({
      combatants: [makeCombatant({ id: 'Pellias', token: decoy })],
    });
    global.canvas.tokens.placeables = [pcToken, decoy];

    expect(resolveToken('Pellias')).toBe(pcToken);
  });
});

// The move-completion seam (#1744 WS-2) — how the snapshot rail learns that a
// mover finished moving without either module importing the other.
describe('move-done listener seam', () => {
  afterEach(() => { setMoveDoneListener(null); });

  test('fires with the mover id after a stepper move, once movedone is on the wire', async () => {
    const seen = [];
    setMoveDoneListener((charId) => {
      // The reply must already have been sent — a capture never delays it.
      seen.push([charId, send.mock.calls.filter((c) => c[1] === 'movedone').length]);
    });
    setupPellias();
    await handleMoveConfirm('Pellias', { destination: { col: 6, row: 5 }, ts: 1 });

    expect(seen).toEqual([['Pellias', 1]]);
  });

  test('fires for the waypoint (path-rail) branch too', async () => {
    const listener = jest.fn();
    setMoveDoneListener(listener);
    const { token } = setupPellias();
    equipV14Movement(token);
    await handleMoveConfirm('Pellias', {
      waypoints: [{ col: 6, row: 5 }, { col: 7, row: 5 }], ts: 2,
    });

    expect(listener).toHaveBeenCalledWith('Pellias');
  });

  test('a move that never resolves a token notifies nothing', async () => {
    const listener = jest.fn();
    setMoveDoneListener(listener);
    setupPellias();
    await handleMoveConfirm('Nobody', { destination: { col: 6, row: 5 }, ts: 3 });
    expect(listener).not.toHaveBeenCalled();
  });

  test('a throwing listener cannot break movement', async () => {
    setMoveDoneListener(() => { throw new Error('capture exploded'); });
    setupPellias();
    await expect(
      handleMoveConfirm('Pellias', { destination: { col: 6, row: 5 }, ts: 4 })
    ).resolves.toBeUndefined();
    expect(send.mock.calls.filter((c) => c[1] === 'movedone')).toHaveLength(1);
  });

  test('a rejected async listener is swallowed, not left unhandled', async () => {
    setMoveDoneListener(() => Promise.reject(new Error('upload failed')));
    setupPellias();
    await handleMoveConfirm('Pellias', { destination: { col: 6, row: 5 }, ts: 5 });
    await Promise.resolve();
    expect(send.mock.calls.filter((c) => c[1] === 'movedone')).toHaveLength(1);
  });

  test('clearing the listener stops the notifications', async () => {
    const listener = jest.fn();
    setMoveDoneListener(listener);
    setMoveDoneListener(null);
    setupPellias();
    await handleMoveConfirm('Pellias', { destination: { col: 6, row: 5 }, ts: 6 });
    expect(listener).not.toHaveBeenCalled();
  });
});
