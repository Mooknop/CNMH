// Route-around-on-clip integration tests (#1832) — the shared planning layer
// bound to a real (mocked) scene, and the two movement rails that consume it.
//
// The v14 movement surfaces are equipped `respectWalls: true` here, which is
// what core actually does: findMovementPath routes BETWEEN the waypoints and
// constrainMovementPath CLIPS the result at the first wall. That is the exact
// behaviour this slice routes around, so every maze test starts from it.

import { planRoutedPath } from './pathRoute.js';
import { handleMovePlan, handleMoveConfirm, initMovement } from './movement.js';
import { updateActorMap } from './encounter.js';
import { measureTokenPathCost } from './pf2eAdapter.js';
import { makeActor, makeToken, equipV14Movement } from './test/foundryMock.js';

const GRID = 100;
const centre = (col, row) => ({ x: col * GRID + GRID / 2, y: row * GRID + GRID / 2 });

let send;

function setupPc({ col = 5, row = 5, speed = 30, respectWalls = true } = {}) {
  const token = makeToken({ id: 'tok-pellias', x: col * GRID, y: row * GRID });
  const actor = makeActor({ id: 'actor-pellias', name: 'Pellias', speed, tokens: [token] });
  token.actor = actor;
  global.game.actors.set('actor-pellias', actor);
  global.game.release = { generation: 14 };
  global.canvas.tokens.placeables = [token];
  if (respectWalls) equipV14Movement(token, { respectWalls: true });
  return token;
}

// --- synthetic walls ---------------------------------------------------------

// Standard segment-intersection, so a "wall" in these tests is a real line the
// collision backend blocks movement across — the same question Foundry's move
// polygon backend answers.
function crosses(a, b, c, d) {
  const side = (p, q, r) => Math.sign(((q.x - p.x) * (r.y - p.y)) - ((q.y - p.y) * (r.x - p.x)));
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  return d1 !== d2 && d3 !== d4;
}

// Install walls as line segments in WORLD pixels. Grid lines are at multiples of
// GRID, so a wall along `x = col * GRID` sits between cells col-1 and col.
function installWallSegments(segments) {
  global.CONFIG.Canvas.polygonBackends.move.testCollision = (origin, dest) =>
    segments.some(([c, d]) => crosses(origin, dest, c, d));
}

// A vertical wall on the grid line west of `col`, spanning rows `from`..`to`
// inclusive — i.e. the classic "wall with a gap you have to walk round".
const verticalWall = (col, from, to) => [
  { x: col * GRID, y: from * GRID },
  { x: col * GRID, y: (to + 1) * GRID },
];

beforeEach(() => {
  send = jest.fn();
  updateActorMap({ 'actor-pellias': 'Pellias' });
  initMovement(send);
});

// --- the planner -------------------------------------------------------------

describe('planRoutedPath — straight first, search only on a clip', () => {
  test('open ground is byte-for-byte the straight plan, with no search at all', async () => {
    const token = setupPc();
    let probes = 0;
    global.CONFIG.Canvas.polygonBackends.move.testCollision = () => { probes += 1; return false; };

    const result = await planRoutedPath(token, [centre(6, 5), centre(7, 5)]);

    expect(result.clipped).toBe(false);
    expect(result.routed).toBe(false);
    expect(result.costFeet).toBeNull();
    expect(result.path).toEqual([centre(6, 5), centre(7, 5)]);
    // Only core's own constrain asked about walls — the search never ran, and
    // the grid was never calibrated.
    expect(probes).toBe(2);
  });

  test('a clipped segment is routed AROUND the wall, ending at the tapped cell', async () => {
    const token = setupPc({ col: 5, row: 5 });
    // A wall between columns 6 and 7, open below row 7.
    installWallSegments([verticalWall(7, 0, 6)]);

    const result = await planRoutedPath(token, [centre(9, 5)]);

    expect(result.routed).toBe(true);
    expect(result.clipped).toBe(false);
    const last = result.path.at(-1);
    expect(last).toEqual(centre(9, 5));
    // It went around the wall's south end rather than stopping at it.
    expect(result.path.some((p) => p.y >= 7 * GRID)).toBe(true);
    expect(result.costFeet).toBeGreaterThan(20);
  });

  test('a destination sealed off entirely reports clipped, with the best partial', async () => {
    const token = setupPc({ col: 5, row: 5 });
    // A closed box around columns 7+: no way through at any row.
    installWallSegments([verticalWall(7, -50, 50)]);

    const result = await planRoutedPath(token, [centre(9, 5)]);

    expect(result.clipped).toBe(true);
    // Whatever it walked, it never crossed the wall.
    for (const p of result.path) expect(p.x).toBeLessThan(7 * GRID);
  });

  test('a budget stops the detour short and reports it clipped', async () => {
    const token = setupPc({ col: 5, row: 5 });
    installWallSegments([verticalWall(7, 0, 6)]);

    const result = await planRoutedPath(token, [centre(9, 5)], { budgetFeet: 10 });

    expect(result.clipped).toBe(true);
    expect(result.costFeet).toBeLessThanOrEqual(10);
  });

  test('the pre-v14 backend keeps its leg-by-leg clip, unrouted', async () => {
    const token = setupPc({ respectWalls: false });
    global.game.release = { generation: 13 };
    installWallSegments([verticalWall(7, 0, 6)]);

    const result = await planRoutedPath(token, [centre(9, 5)]);

    expect(result.routed).toBe(false);
    expect(result.clipped).toBe(true);
    expect(result.path).toEqual([]);
  });

  test('the route is identical every time it is asked for', async () => {
    const token = setupPc();
    installWallSegments([verticalWall(7, 0, 6)]);

    const once = await planRoutedPath(token, [centre(9, 5)]);
    const twice = await planRoutedPath(token, [centre(9, 5)]);
    expect(twice.path).toEqual(once.path);
  });
});

// --- cost model --------------------------------------------------------------

describe('cost model agreement with measureTokenPathCost', () => {
  // Foundry's own alternating-diagonal measurement, as PF2e configures it: the
  // 1st diagonal of a path costs 5 ft, the 2nd 10, the 3rd 5…
  const alternating = (waypoints) => {
    let cost = 0;
    let diagonals = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const dc = Math.round(Math.abs(waypoints[i].x - waypoints[i - 1].x) / GRID);
      const dr = Math.round(Math.abs(waypoints[i].y - waypoints[i - 1].y) / GRID);
      const diag = Math.min(dc, dr);
      cost += (Math.max(dc, dr) - diag) * 5;
      for (let d = 0; d < diag; d++) {
        cost += diagonals % 2 === 0 ? 5 : 10;
        diagonals += 1;
      }
    }
    return { distance: cost, cost };
  };

  test('an ALTERNATING grid is detected and priced exactly as core would', async () => {
    const token = setupPc();
    global.canvas.grid.measurePath = alternating;
    token.document.measureMovementPath = jest.fn(alternating);
    installWallSegments([verticalWall(7, 0, 6)]);

    const result = await planRoutedPath(token, [centre(9, 5)]);

    expect(result.routed).toBe(true);
    // The wire's cost comes from measureTokenPathCost; the search's own model
    // must land on the same number or a budget clip stops the mover somewhere
    // costFeet does not describe.
    expect(result.costFeet).toBe(await measureTokenPathCost(token, result.path));
  });

  test('an EQUIDISTANT grid is detected and priced as one square a step', async () => {
    // The default mock grid is Chebyshev: every step, diagonal or not, is 5 ft.
    const token = setupPc();
    installWallSegments([verticalWall(7, 0, 6)]);

    const result = await planRoutedPath(token, [centre(9, 5)]);

    expect(result.routed).toBe(true);
    expect(result.costFeet).toBe(result.path.length * 5);
    expect(result.costFeet).toBe(await measureTokenPathCost(token, result.path));
  });
});

// --- the movement rails ------------------------------------------------------

describe('handleMovePlan / handleMoveConfirm route the same way (#1832)', () => {
  test('a plan past a corner routes around instead of clipping at the wall', async () => {
    setupPc({ col: 5, row: 5 });
    installWallSegments([verticalWall(7, 0, 6)]);

    await handleMovePlan('Pellias', { waypoints: [{ col: 9, row: 5 }], ts: 100 });

    const planned = send.mock.calls[0][2];
    expect(planned.clipped).toBe(false);
    expect(planned.path.at(-1)).toMatchObject({ col: 9, row: 5 });
    expect(planned.path.length).toBeGreaterThan(4);
    expect(planned.reqTs).toBe(100);
  });

  test('the confirm EXECUTES the route the plan promised, cell for cell', async () => {
    const token = setupPc({ col: 5, row: 5 });
    installWallSegments([verticalWall(7, 0, 6)]);

    await handleMovePlan('Pellias', { waypoints: [{ col: 9, row: 5 }], ts: 101 });
    const planned = send.mock.calls[0][2];

    send.mockClear();
    await handleMoveConfirm('Pellias', {
      waypoints: planned.path.map((c) => ({ col: c.col, row: c.row })),
      moveType: 'stride',
      ts: 102,
    });

    // One pipeline call, carrying exactly the planned cells as top-left corners.
    expect(token.document.move).toHaveBeenCalledTimes(1);
    expect(token.document.move).toHaveBeenCalledWith(
      planned.path.map((c) => ({ x: c.x, y: c.y })),
      expect.anything(),
    );
    const done = send.mock.calls[0][2];
    expect(done.newPosition).toMatchObject({ col: 9, row: 5 });
  });

  test('a confirm that re-plans from the tapped waypoint routes too', async () => {
    // The app may echo the tapped destination rather than the dense route; the
    // confirm has to reach the same place either way.
    const token = setupPc({ col: 5, row: 5 });
    installWallSegments([verticalWall(7, 0, 6)]);

    await handleMoveConfirm('Pellias', {
      waypoints: [{ col: 9, row: 5 }], moveType: 'stride', ts: 103,
    });

    expect(send.mock.calls[0][2].newPosition).toMatchObject({ col: 9, row: 5 });
    const walked = token.document.move.mock.calls[0][0];
    expect(walked.some((p) => p.y >= 7 * GRID)).toBe(true);
  });

  test('open ground still plans exactly as it did before routing existed', async () => {
    setupPc({ col: 5, row: 5 });

    await handleMovePlan('Pellias', {
      waypoints: [{ col: 6, row: 5 }, { col: 7, row: 5 }, { col: 8, row: 5 }], ts: 104,
    });

    expect(send.mock.calls[0][2]).toMatchObject({
      path: [
        { col: 6, row: 5, x: 600, y: 500 },
        { col: 7, row: 5, x: 700, y: 500 },
        { col: 8, row: 5, x: 800, y: 500 },
      ],
      costFeet: 15,
      clipped: false,
    });
  });
});
