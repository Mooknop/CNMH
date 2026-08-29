// Group-move rail tests (#1823) — ring assignment, budget prefix walk,
// concurrent execution with per-token isolation, and the one-capture-per-group
// seam discipline.
//
// Geometry logic lives here; every canvas/actor read goes through the adapter
// against the mocked Foundry world (test/foundryMock.js).

import {
  initGroupMove, setGroupSettledListener, handleGroupMoveRequest,
  assignDestinations, budgetFeetFor,
} from './groupMove.js';
import { initMovement, setMoveDoneListener, handleMoveConfirm } from './movement.js';
import { updateActorMap } from './encounter.js';
import { RELAY } from './syncKeys.js';
import {
  makeActor, makeToken, makeConfig, equipV14Movement,
} from './test/foundryMock.js';

const GRID = 100;
const cellCentre = (col, row) => ({ x: col * GRID + GRID / 2, y: row * GRID + GRID / 2 });

let send;

// A mapped PC token at a grid cell. The v14 movement surfaces are equipped
// STEPPED (per-cell route) — that is what the real pathfinder returns, and the
// budget clip needs intermediate cells to stop at.
function placePc(charId, { col, row, speed = 30, stepped = true, respectWalls = false } = {}) {
  const actorId = `actor-${charId.toLowerCase()}`;
  const token = makeToken({ id: `tok-${charId.toLowerCase()}`, x: col * GRID, y: row * GRID });
  const actor = makeActor({ id: actorId, name: charId, speed, tokens: [token] });
  token.actor = actor;
  global.game.actors.set(actorId, actor);
  equipV14Movement(token, { stepped, respectWalls });
  global.canvas.tokens.placeables = [...global.canvas.tokens.placeables, token];
  return { charId, actorId, token };
}

// --- synthetic walls (#1832) -------------------------------------------------
// A wall here is a real line segment the collision backend blocks movement
// across, so the spread's flood fill and each mover's search see the same scene.

function crosses(a, b, c, d) {
  const side = (p, q, r) => Math.sign(((q.x - p.x) * (r.y - p.y)) - ((q.y - p.y) * (r.x - p.x)));
  return side(c, d, a) !== side(c, d, b) && side(a, b, c) !== side(a, b, d);
}

function installWallSegments(segments) {
  global.CONFIG.Canvas.polygonBackends.move.testCollision = (origin, dest) =>
    segments.some(([c, d]) => crosses(origin, dest, c, d));
}

// A one-cell-high east-west corridor along `row`, walled above and below.
const corridor = (row, fromCol, toCol) => [
  [{ x: fromCol * GRID, y: row * GRID }, { x: (toCol + 1) * GRID, y: row * GRID }],
  [{ x: fromCol * GRID, y: (row + 1) * GRID }, { x: (toCol + 1) * GRID, y: (row + 1) * GRID }],
];

// A single cell sealed on all four sides — a closet.
const sealedCell = (col, row) => {
  const [x0, y0] = [col * GRID, row * GRID];
  const [x1, y1] = [x0 + GRID, y0 + GRID];
  const pad = 10;
  return [
    [{ x: x0, y: y0 - pad }, { x: x0, y: y1 + pad }],
    [{ x: x1, y: y0 - pad }, { x: x1, y: y1 + pad }],
    [{ x: x0 - pad, y: y0 }, { x: x1 + pad, y: y0 }],
    [{ x: x0 - pad, y: y1 }, { x: x1 + pad, y: y1 }],
  ];
};

function mapActors(...pcs) {
  updateActorMap(Object.fromEntries(pcs.map((p) => [p.actorId, p.charId])));
}

const grabGroupDone = () => send.mock.calls.filter((c) => c[1] === RELAY.GROUPMOVEDONE);

beforeEach(() => {
  send = jest.fn();
  global.game.release = { generation: 14 };
  global.canvas.tokens.placeables = [];
  initMovement(send);
  initGroupMove(send);
  setMoveDoneListener(null);
  setGroupSettledListener(null);
});

// --- ring assignment ---------------------------------------------------------

// assignDestinations takes movers as { moverId, centre } — the shape the
// handler builds from each resolved token's current centre.
const mover = (moverId, col, row) => ({ moverId, centre: cellCentre(col, row) });

describe('assignDestinations — spreading outward from the target', () => {
  const TARGET = { col: 10, row: 10 };

  test('five movers land on five DISTINCT cells, none further than ring 1', () => {
    const movers = [
      mover('Ayla', 8, 10), mover('Brann', 12, 10), mover('Cass', 10, 8),
      mover('Doro', 10, 12), mover('Emm', 9, 9),
    ];
    const assigned = assignDestinations(movers, TARGET, GRID);

    expect(assigned.size).toBe(5);
    const cells = [...assigned.values()];
    const keys = new Set(cells.map((c) => `${c.col},${c.row}`));
    expect(keys.size).toBe(5);
    for (const c of cells) {
      expect(Math.max(Math.abs(c.col - 10), Math.abs(c.row - 10))).toBeLessThanOrEqual(1);
    }
  });

  test('the CLOSEST mover is served first and takes the target cell itself', () => {
    const movers = [
      mover('Ayla', 8, 10), mover('Brann', 12, 10), mover('Emm', 9, 9),
    ];
    // Emm is a diagonal step away; the other two are two cells out.
    expect(assignDestinations(movers, TARGET, GRID).get('Emm')).toMatchObject({
      col: 10, row: 10, dist: 0,
    });
  });

  test('assignment is order-independent — shuffling the request array changes nothing', () => {
    const movers = [
      mover('Ayla', 8, 10), mover('Brann', 12, 10), mover('Cass', 10, 8),
      mover('Doro', 10, 12), mover('Emm', 9, 9),
    ];
    const asObject = (m) => Object.fromEntries([...assignDestinations(m, TARGET, GRID)]
      .map(([id, c]) => [id, `${c.col},${c.row}`]));

    const forward = asObject(movers);
    expect(asObject([...movers].reverse())).toEqual(forward);
    expect(asObject([movers[2], movers[4], movers[0], movers[3], movers[1]])).toEqual(forward);
  });

  test('an exact distance tie breaks on moverId, deterministically', () => {
    // Both are one cell from the target — only the id can order them.
    const west = mover('Brann', 9, 10);
    const east = mover('Ayla', 11, 10);
    for (const pair of [[west, east], [east, west]]) {
      const assigned = assignDestinations(pair, TARGET, GRID);
      expect(assigned.get('Ayla')).toMatchObject({ col: 10, row: 10 });
      expect(assigned.get('Brann')).not.toMatchObject({ col: 10, row: 10 });
    }
  });

  test('a corridor target clusters the party ALONG the corridor (#1832)', () => {
    // Geometric ring 1 around the target is mostly WALL — only the two cells
    // east and west of it are walkable. Ordering by walking distance is what
    // strings the party out down the corridor instead of scattering it into
    // rings that sit behind the corridor's own walls.
    installWallSegments(corridor(10, 0, 20));
    const movers = [mover('Ayla', 6, 10), mover('Brann', 7, 10), mover('Cass', 8, 10)];

    const assigned = assignDestinations(movers, TARGET, GRID);

    expect(assigned.size).toBe(3);
    for (const c of assigned.values()) expect(c.row).toBe(10);
    expect(new Set([...assigned.values()].map((c) => `${c.col},${c.row}`)).size).toBe(3);
    // Closest-mover-first still holds: Cass takes the tapped cell, and the
    // others fall in behind her along the corridor.
    expect(assigned.get('Cass')).toMatchObject({ col: 10, row: 10, dist: 0 });
    expect(assigned.get('Brann')).toMatchObject({ col: 9, row: 10, dist: 1 });
    // Ayla takes the only other cell one step from the goal — the party packs
    // in tight around it rather than spilling two steps down the corridor.
    expect(assigned.get('Ayla')).toMatchObject({ col: 11, row: 10, dist: 1 });
  });

  test('a pocket smaller than the party hands the overflow the goal itself', () => {
    // A one-cell closet: exactly one candidate exists for three movers.
    installWallSegments(sealedCell(TARGET.col, TARGET.row));
    const movers = [mover('Ayla', 6, 10), mover('Brann', 7, 10), mover('Cass', 8, 10)];

    const assigned = assignDestinations(movers, TARGET, GRID);

    expect(assigned.get('Cass')).toMatchObject({ col: 10, row: 10, dist: 0 });
    // The other two are pointed at the goal and walk as close as they can —
    // their best-partial stop-short is the honest answer, not a refusal.
    for (const id of ['Ayla', 'Brann']) {
      expect(assigned.get(id)).toMatchObject({ col: 10, row: 10, overflow: true });
    }
  });

  test('a candidate cell the wall test rejects from the target is never assigned', () => {
    // Everything east of the target's own column is behind a wall.
    global.CONFIG = makeConfig({
      testCollision: (origin, destination) => destination.x > TARGET.col * GRID + GRID,
    });
    const movers = [
      mover('Ayla', 8, 10), mover('Brann', 8, 11), mover('Cass', 10, 8),
      mover('Doro', 10, 12), mover('Emm', 9, 9),
    ];
    const assigned = assignDestinations(movers, TARGET, GRID);

    expect(assigned.size).toBe(5);
    for (const c of assigned.values()) expect(c.col).not.toBe(11);
    // …and the survivors are still all distinct.
    expect(new Set([...assigned.values()].map((c) => `${c.col},${c.row}`)).size).toBe(5);
  });
});

// --- budget ------------------------------------------------------------------

describe('budgetFeetFor', () => {
  test("defaults to 1.5x the mover's own Speed — the single flow's reach", () => {
    const token = { actor: makeActor({ speed: 30 }) };
    expect(budgetFeetFor(token)).toBe(45);
  });

  test('falls back to 30 ft when the actor reports no Speed', () => {
    expect(budgetFeetFor({ actor: makeActor({ speed: 0 }) })).toBe(30);
  });

  test('an explicit budgetFeet on the request wins', () => {
    expect(budgetFeetFor({ actor: makeActor({ speed: 30 }) }, 20)).toBe(20);
  });
});

// --- the rail ----------------------------------------------------------------

describe('handleGroupMoveRequest', () => {
  test('moves every mover and acks one groupmovedone in REQUEST order', async () => {
    const ayla = placePc('Ayla', { col: 9, row: 10 });
    const brann = placePc('Brann', { col: 13, row: 10 });
    mapActors(ayla, brann);

    await handleGroupMoveRequest({
      id: 'grp-1', moverIds: ['Brann', 'Ayla'], target: { col: 10, row: 10 }, ts: 7,
    });

    const calls = grabGroupDone();
    expect(calls).toHaveLength(1);
    const [characterId, , payload] = calls[0];
    expect(characterId).toBe('global');
    expect(payload.id).toBe('grp-1');
    expect(typeof payload.ts).toBe('number');
    expect(payload.results.map((r) => r.moverId)).toEqual(['Brann', 'Ayla']);

    // Ayla is adjacent → takes the tapped cell itself for 5 ft.
    expect(payload.results.find((r) => r.moverId === 'Ayla')).toMatchObject({
      ok: true, reached: true, feetMoved: 5, dest: { col: 10, row: 10 },
    });
    // Brann is three cells out → takes a ring-1 cell on his own side.
    expect(payload.results.find((r) => r.moverId === 'Brann')).toMatchObject({
      ok: true, reached: true, feetMoved: 10, dest: { col: 11, row: 10 },
    });
    // dest carries movedone's cell shape: cell + the cell's TOP-LEFT pixels.
    expect(payload.results[1].dest).toEqual({ col: 10, row: 10, x: 1000, y: 1000 });
  });

  test('an out-of-budget mover walks the reachable prefix: reached false, real feetMoved', async () => {
    const ayla = placePc('Ayla', { col: 9, row: 10 });
    // Speed 10 → 15 ft of reach; the assigned ring cell is 25 ft away.
    const brann = placePc('Brann', { col: 16, row: 10, speed: 10 });
    mapActors(ayla, brann);

    await handleGroupMoveRequest({
      id: 'grp-2', moverIds: ['Ayla', 'Brann'], target: { col: 10, row: 10 }, ts: 8,
    });

    const [, , payload] = grabGroupDone()[0];
    expect(payload.results[1]).toMatchObject({
      moverId: 'Brann', ok: true, reached: false, feetMoved: 15, dest: { col: 13, row: 10 },
    });
    // The mover who COULD make it is unaffected by his neighbour's shortfall.
    expect(payload.results[0]).toMatchObject({ moverId: 'Ayla', ok: true, reached: true });
  });

  test('every mover ROUTES around a wall rather than stopping at it (#1832)', async () => {
    // A wall on the grid line between columns 6 and 7, ending short of row 7 —
    // a corner both movers have to walk around to reach the target.
    installWallSegments([[{ x: 700, y: 0 }, { x: 700, y: 690 }]]);
    const ayla = placePc('Ayla', { col: 5, row: 5, respectWalls: true });
    const brann = placePc('Brann', { col: 5, row: 6, respectWalls: true });
    mapActors(ayla, brann);

    await handleGroupMoveRequest({
      id: 'grp-maze', moverIds: ['Ayla', 'Brann'], target: { col: 9, row: 5 }, ts: 20,
    });

    const [, , payload] = grabGroupDone()[0];
    expect(payload.results.every((r) => r.ok && r.reached)).toBe(true);
    // Both ended east of the wall, on distinct cells.
    for (const r of payload.results) expect(r.dest.col).toBeGreaterThan(6);
    expect(new Set(payload.results.map((r) => `${r.dest.col},${r.dest.row}`)).size).toBe(2);
    // …and each of them walked the long way round its southern end.
    for (const pc of [ayla, brann]) {
      const walked = pc.token.document.move.mock.calls[0][0];
      expect(walked.some((p) => p.y >= 700)).toBe(true);
    }
  });

  test('an unresolvable moverId yields ok:false and never stops the others', async () => {
    const ayla = placePc('Ayla', { col: 9, row: 10 });
    mapActors(ayla);

    await handleGroupMoveRequest({
      id: 'grp-3', moverIds: ['Ghost', 'Ayla'], target: { col: 10, row: 10 }, ts: 9,
    });

    const [, , payload] = grabGroupDone()[0];
    expect(payload.results[0]).toEqual({
      moverId: 'Ghost', ok: false, dest: null, feetMoved: 0, reached: false,
    });
    expect(payload.results[1]).toMatchObject({ moverId: 'Ayla', ok: true, reached: true });
  });

  test('one token throwing is isolated — the rest of the group still moves', async () => {
    const ayla = placePc('Ayla', { col: 9, row: 10 });
    const brann = placePc('Brann', { col: 13, row: 10 });
    const cass = placePc('Cass', { col: 10, row: 13 });
    mapActors(ayla, brann, cass);
    brann.token.document.move = jest.fn().mockRejectedValue(new Error('token is locked'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await handleGroupMoveRequest({
      id: 'grp-4', moverIds: ['Ayla', 'Brann', 'Cass'], target: { col: 10, row: 10 }, ts: 10,
    });

    const [, , payload] = grabGroupDone()[0];
    expect(payload.results[1]).toEqual({
      moverId: 'Brann', ok: false, dest: null, feetMoved: 0, reached: false,
    });
    expect(payload.results[0].ok).toBe(true);
    expect(payload.results[2].ok).toBe(true);
    // Concurrency: nobody waited on the failure — all three tokens were driven.
    expect(ayla.token.document.move).toHaveBeenCalled();
    expect(cass.token.document.move).toHaveBeenCalled();
  });

  test('no two movers are sent to the same cell', async () => {
    const pcs = [
      placePc('Ayla', { col: 8, row: 10 }), placePc('Brann', { col: 12, row: 10 }),
      placePc('Cass', { col: 10, row: 8 }), placePc('Doro', { col: 10, row: 12 }),
      placePc('Emm', { col: 9, row: 9 }),
    ];
    mapActors(...pcs);

    await handleGroupMoveRequest({
      id: 'grp-5',
      moverIds: pcs.map((p) => p.charId),
      target: { col: 10, row: 10 },
      ts: 11,
    });

    const [, , payload] = grabGroupDone()[0];
    expect(payload.results.every((r) => r.ok && r.reached)).toBe(true);
    const cells = payload.results.map((r) => `${r.dest.col},${r.dest.row}`);
    expect(new Set(cells).size).toBe(5);
  });

  test('`{ x, y }` on the target is accepted as a col/row alias', async () => {
    const ayla = placePc('Ayla', { col: 9, row: 10 });
    mapActors(ayla);

    await handleGroupMoveRequest({
      id: 'grp-6', moverIds: ['Ayla'], target: { x: 10, y: 10 }, ts: 12,
    });

    expect(grabGroupDone()[0][2].results[0]).toMatchObject({
      ok: true, reached: true, dest: { col: 10, row: 10 },
    });
  });

  test('a request with no id is ignored outright', async () => {
    const ayla = placePc('Ayla', { col: 9, row: 10 });
    mapActors(ayla);
    await handleGroupMoveRequest({ moverIds: ['Ayla'], target: { col: 10, row: 10 } });
    expect(grabGroupDone()).toHaveLength(0);
  });

  test('a nonsense target still ACKS — the app is holding an awaiting state open', async () => {
    const ayla = placePc('Ayla', { col: 9, row: 10 });
    mapActors(ayla);

    await handleGroupMoveRequest({ id: 'grp-7', moverIds: ['Ayla'], target: null, ts: 13 });

    const [, , payload] = grabGroupDone()[0];
    expect(payload.results).toEqual([
      { moverId: 'Ayla', ok: false, dest: null, feetMoved: 0, reached: false },
    ]);
    expect(ayla.token.document.move).not.toHaveBeenCalled();
  });

  test('an empty selection acks with an empty results array', async () => {
    await handleGroupMoveRequest({
      id: 'grp-8', moverIds: [], target: { col: 10, row: 10 }, ts: 14,
    });
    expect(grabGroupDone()[0][2].results).toEqual([]);
  });
});

// --- capture seams -----------------------------------------------------------

describe('capture suppression (#1823)', () => {
  test('a group move fires ZERO per-mover captures and exactly ONE group capture', async () => {
    const perMover = jest.fn();
    const settled = jest.fn();
    setMoveDoneListener(perMover);
    setGroupSettledListener(settled);

    const pcs = [
      placePc('Ayla', { col: 9, row: 10 }), placePc('Brann', { col: 13, row: 10 }),
      placePc('Cass', { col: 10, row: 13 }),
    ];
    mapActors(...pcs);

    await handleGroupMoveRequest({
      id: 'grp-9', moverIds: ['Ayla', 'Brann', 'Cass'], target: { col: 10, row: 10 }, ts: 15,
    });

    expect(perMover).not.toHaveBeenCalled();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledWith('grp-9');
  });

  test('the SINGLE-move capture path is untouched — its move-done seam still fires', async () => {
    const perMover = jest.fn();
    const settled = jest.fn();
    setMoveDoneListener(perMover);
    setGroupSettledListener(settled);

    const ayla = placePc('Ayla', { col: 9, row: 10 });
    mapActors(ayla);

    await handleMoveConfirm('Ayla', {
      waypoints: [{ col: 10, row: 10 }], moveType: 'stride', ts: 16,
    });

    expect(perMover).toHaveBeenCalledTimes(1);
    expect(perMover).toHaveBeenCalledWith('Ayla');
    expect(settled).not.toHaveBeenCalled();
    // …and it still answers on its own channel, not the group's.
    expect(send.mock.calls.some((c) => c[1] === RELAY.MOVEDONE)).toBe(true);
    expect(grabGroupDone()).toHaveLength(0);
  });

  test('a throwing group-settled listener cannot break the rail', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    setGroupSettledListener(() => { throw new Error('capture exploded'); });
    const ayla = placePc('Ayla', { col: 9, row: 10 });
    mapActors(ayla);

    await expect(handleGroupMoveRequest({
      id: 'grp-10', moverIds: ['Ayla'], target: { col: 10, row: 10 }, ts: 17,
    })).resolves.toBeUndefined();

    expect(grabGroupDone()[0][2].results[0].ok).toBe(true);
  });
});
