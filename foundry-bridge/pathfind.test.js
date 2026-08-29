// Pathfinding unit tests (#1832) — the PURE module, against synthetic mazes.
//
// pathfind.js knows nothing about Foundry: its only view of the world is the
// injected `isBlocked` callback, so the whole search can be exercised against
// ASCII art. `#` is a cell no route may enter, `.` is open.

import {
  DIAGONAL_EQUIDISTANT,
  findPath,
  octileFeet,
  pathCostFeet,
  reachableCells,
} from './pathfind.js';

// An ASCII maze → the injected edge test. Blocking on the DESTINATION cell
// (rather than on an edge between two cells) is the shape a wall-per-cell maze
// takes; the real binding in pathRoute.js tests the edge itself.
function maze(rows) {
  const grid = rows.map((r) => r.split(''));
  const at = ({ col, row }) => grid[row]?.[col];
  return {
    isBlocked: (from, to) => at(to) === undefined || at(to) === '#',
    open: (cell) => at(cell) === '.',
  };
}

const cells = (path) => path.map((c) => `${c.col},${c.row}`);

describe('octileFeet — the PF2e diagonal rule', () => {
  test('orthogonal distance is one square per step', () => {
    expect(octileFeet({ col: 0, row: 0 }, { col: 4, row: 0 })).toBe(20);
  });

  test('diagonals alternate 5-10-5-10 from an even count', () => {
    const to = (n) => ({ col: n, row: n });
    expect(octileFeet({ col: 0, row: 0 }, to(1))).toBe(5);
    expect(octileFeet({ col: 0, row: 0 }, to(2))).toBe(15);
    expect(octileFeet({ col: 0, row: 0 }, to(3))).toBe(20);
    expect(octileFeet({ col: 0, row: 0 }, to(4))).toBe(30);
  });

  test('an ODD running diagonal count starts on the expensive one', () => {
    // Mid-route, having already spent one diagonal, the next costs 10.
    expect(octileFeet({ col: 0, row: 0 }, { col: 1, row: 1 }, { diagonalsSoFar: 1 })).toBe(10);
    expect(octileFeet({ col: 0, row: 0 }, { col: 2, row: 2 }, { diagonalsSoFar: 1 })).toBe(15);
  });

  test('an equidistant grid prices every step the same', () => {
    expect(octileFeet({ col: 0, row: 0 }, { col: 3, row: 3 }, {
      diagonalRule: DIAGONAL_EQUIDISTANT,
    })).toBe(15);
  });
});

describe('findPath on open ground', () => {
  const open = maze([
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
  ]);

  test('a straight run costs exactly its octile distance, one cell per step', () => {
    const result = findPath({ col: 0, row: 0 }, { col: 5, row: 0 }, open);
    expect(result.reachedGoal).toBe(true);
    expect(result.path).toHaveLength(5);
    expect(result.costFeet).toBe(25);
    expect(result.costFeet).toBe(octileFeet({ col: 0, row: 0 }, { col: 5, row: 0 }));
  });

  test('a diagonal run charges the alternating rule, not 5 ft a corner', () => {
    const result = findPath({ col: 0, row: 0 }, { col: 4, row: 4 }, open);
    expect(result.reachedGoal).toBe(true);
    expect(cells(result.path).at(-1)).toBe('4,4');
    // 5 + 10 + 5 + 10. (Under the alternating rule several routes tie at 30 ft
    // — four diagonals, or three plus two straights — and all of them are
    // equally legal PF2e movement, so the COST is the contract, not the shape.)
    expect(result.costFeet).toBe(30);
    expect(result.costFeet).toBe(octileFeet({ col: 0, row: 0 }, { col: 4, row: 4 }));
  });

  test('the same run on an equidistant grid costs one square a step', () => {
    const result = findPath({ col: 0, row: 0 }, { col: 4, row: 4 }, {
      ...open, diagonalRule: DIAGONAL_EQUIDISTANT,
    });
    expect(result.costFeet).toBe(20);
  });

  test('a mid-route odd diagonal count is honoured', () => {
    const result = findPath({ col: 0, row: 0 }, { col: 2, row: 2 }, {
      ...open, diagonalsSoFar: 1,
    });
    expect(result.costFeet).toBe(15); // 10 then 5
    expect(result.diagonals).toBe(3);
  });

  test('start === goal is a zero-cost empty route', () => {
    expect(findPath({ col: 2, row: 2 }, { col: 2, row: 2 }, open)).toMatchObject({
      path: [], costFeet: 0, reachedGoal: true,
    });
  });
});

describe('findPath around walls', () => {
  test('a U-shaped wall is routed around, not clipped at', () => {
    // A vertical wall at col 4 spanning rows 0-3, open along row 4.
    const m = maze([
      '....#....',
      '....#....',
      '..s.#.g..',
      '....#....',
      '.........',
    ]);
    const start = { col: 2, row: 2 };
    const goal = { col: 6, row: 2 };
    const result = findPath(start, goal, m);

    expect(result.reachedGoal).toBe(true);
    expect(cells(result.path).at(-1)).toBe('6,2');
    for (const cell of result.path) expect(m.isBlocked(start, cell)).toBe(false);
    // It genuinely detoured: a straight run would have been 20 ft.
    expect(result.costFeet).toBeGreaterThan(octileFeet(start, goal));
  });

  test('an L-shaped corridor is followed corner to corner', () => {
    const m = maze([
      '#######',
      '#.....#',
      '#####.#',
      '#.....#',
      '#######',
    ]);
    const result = findPath({ col: 1, row: 1 }, { col: 1, row: 3 }, m);

    expect(result.reachedGoal).toBe(true);
    // (5,2) is the ONLY gap in the dividing wall, so the route must use it.
    expect(cells(result.path)).toContain('5,2');
    expect(cells(result.path).at(-1)).toBe('1,3');
    expect(result.path.length).toBeGreaterThanOrEqual(8);
  });

  test('a spiral is walked all the way in', () => {
    // A ring inside a ring: the chamber at cols 3-5 / rows 3-5 opens only at
    // (5,6), so the route has to walk the whole outer corridor and turn in.
    const m = maze([
      '#########',
      '#.......#',
      '#.#####.#',
      '#.#...#.#',
      '#.#...#.#',
      '#.#...#.#',
      '#.###...#',
      '#.......#',
      '#########',
    ]);
    const start = { col: 1, row: 1 };
    const goal = { col: 3, row: 5 };
    const result = findPath(start, goal, m);

    expect(result.reachedGoal).toBe(true);
    for (const cell of result.path) expect(m.open(cell)).toBe(true);
    // The goal is 5 cells away as the crow flies and a long way around.
    expect(result.path.length).toBeGreaterThan(8);
  });

  test('a sealed goal yields the BEST PARTIAL — the route closest to it', () => {
    const m = maze([
      '.....',
      '.###.',
      '.#.#.',
      '.###.',
      '.....',
    ]);
    const start = { col: 0, row: 0 };
    const goal = { col: 2, row: 2 };
    const result = findPath(start, goal, m);

    expect(result.reachedGoal).toBe(false);
    expect(result.path.length).toBeGreaterThan(0);
    for (const cell of result.path) expect(m.open(cell)).toBe(true);
    // Every step of the partial got closer to the goal than standing still.
    const end = result.path.at(-1);
    expect(octileFeet(end, goal)).toBeLessThan(octileFeet(start, goal));
  });

  test('a budget clips the route mid-maze and reports the partial', () => {
    const m = maze([
      '....#....',
      '....#....',
      '..s.#.g..',
      '....#....',
      '.........',
    ]);
    const start = { col: 2, row: 2 };
    const goal = { col: 6, row: 2 };
    const result = findPath(start, goal, { ...m, budgetFeet: 15 });

    expect(result.reachedGoal).toBe(false);
    expect(result.costFeet).toBeLessThanOrEqual(15);
    expect(result.path.length).toBeGreaterThan(0);
  });

  test('the same request always yields the same route (plan === confirm)', () => {
    const m = maze([
      '....#....',
      '....#....',
      '..s.#.g..',
      '....#....',
      '.........',
    ]);
    const run = () => cells(findPath({ col: 2, row: 2 }, { col: 6, row: 2 }, m).path);
    expect(run()).toEqual(run());
    expect(run()).toEqual(run());
  });
});

describe('search bounds', () => {
  test('the node cap terminates a hopeless search', () => {
    // An infinite plane with an infinite wall across it: the goal can never be
    // reached, so only the cap can end the search.
    let probes = 0;
    const result = findPath({ col: 0, row: 0 }, { col: 20, row: 0 }, {
      isBlocked: (from, to) => { probes += 1; return to.col === 5; },
      nodeCap: 40,
    });

    expect(result.reachedGoal).toBe(false);
    // 8 edges per expansion is the hard ceiling; memoization means fewer.
    expect(probes).toBeLessThanOrEqual(40 * 8);
  });

  test('a budget bounds how far from the start the search may stray', () => {
    const seen = [];
    findPath({ col: 0, row: 0 }, { col: 40, row: 0 }, {
      isBlocked: (from, to) => { seen.push(to); return false; },
      budgetFeet: 15,
    });
    // 15 ft of budget is three squares of reach — nothing beyond it can be part
    // of an affordable route, so nothing beyond it is ever probed.
    for (const cell of seen) {
      expect(Math.max(Math.abs(cell.col), Math.abs(cell.row))).toBeLessThanOrEqual(3);
    }
  });

  test('a blocked edge is asked about ONCE per search, in either direction', () => {
    const asked = [];
    findPath({ col: 0, row: 0 }, { col: 2, row: 0 }, {
      isBlocked: (from, to) => { asked.push(`${from.col},${from.row}>${to.col},${to.row}`); return false; },
    });
    const undirected = asked.map((k) => k.split('>').sort().join('|'));
    expect(new Set(undirected).size).toBe(undirected.length);
  });
});

describe('cost-model agreement', () => {
  test("findPath's cost is exactly what pathCostFeet prices its own route at", () => {
    const m = maze([
      '....#....',
      '....#....',
      '..s.#.g..',
      '....#....',
      '.........',
    ]);
    const start = { col: 2, row: 2 };
    for (const goal of [{ col: 6, row: 2 }, { col: 8, row: 4 }, { col: 0, row: 0 }]) {
      const result = findPath(start, goal, m);
      expect(pathCostFeet(start, result.path).costFeet).toBe(result.costFeet);
    }
  });

  test('pathCostFeet prices a waypoint-grained leg as its Chebyshev walk', () => {
    // The degraded planner hands back the requested waypoint, not the cells
    // between — pricing it as the interpolation keeps the two models congruent.
    expect(pathCostFeet({ col: 0, row: 0 }, [{ col: 3, row: 3 }]).costFeet).toBe(20);
    expect(pathCostFeet({ col: 0, row: 0 }, [{ col: 3, row: 0 }]).costFeet).toBe(15);
  });
});

describe('reachableCells — connectivity, not line of sight', () => {
  test('cells around a corner are reachable; a sealed pocket is not', () => {
    const m = maze([
      '.....',
      '.###.',
      '.#.#.',
      '.###.',
      '.....',
    ]);
    const found = reachableCells({ col: 0, row: 0 }, { isBlocked: m.isBlocked, maxDepth: 8 });
    const keys = new Set(cells(found));

    expect(keys.has('0,0')).toBe(true);
    // All the way around the block — pure connectivity.
    expect(keys.has('4,4')).toBe(true);
    // The pocket at the centre is walled in on all eight sides.
    expect(keys.has('2,2')).toBe(false);
    // …and no wall cell was ever offered as a destination.
    for (const cell of found) expect(m.open(cell)).toBe(true);
  });

  test('`dist` is WALKING distance, so a corridor orders along itself', () => {
    // A one-cell corridor east of the start with a wall right below it: (2,0)
    // is two steps away by walking but one Chebyshev ring further than (1,1),
    // which cannot be walked to at all.
    const m = maze([
      '...',
      '###',
      '...',
    ]);
    const found = reachableCells({ col: 0, row: 0 }, { isBlocked: m.isBlocked, maxDepth: 4 });
    const byCell = new Map(found.map((c) => [`${c.col},${c.row}`, c.dist]));

    expect(byCell.get('0,0')).toBe(0);
    expect(byCell.get('1,0')).toBe(1);
    expect(byCell.get('2,0')).toBe(2);
    // The whole row behind the wall is unreachable, however near it looks.
    expect(byCell.has('0,2')).toBe(false);
    expect(byCell.has('1,1')).toBe(false);
  });

  test('emission is layer-ascending — every cell of a layer before the next', () => {
    const found = reachableCells({ col: 5, row: 5 }, { isBlocked: () => false, maxDepth: 2 });
    expect(found[0]).toEqual({ col: 5, row: 5, dist: 0 });
    expect(found.map((c) => c.dist)).toEqual([...found.map((c) => c.dist)].sort((a, b) => a - b));
    expect(found.filter((c) => c.dist === 1)).toHaveLength(8);
    expect(found).toHaveLength(1 + 8 + 16);
  });

  test('`needed` stops the fill on a COMPLETE layer, never mid-layer', () => {
    const found = reachableCells({ col: 0, row: 0 }, { isBlocked: () => false, needed: 3 });
    // Three wanted → layer 0 alone is short, so the whole of layer 1 comes too
    // and the fill stops there rather than banking a partial layer 2.
    expect(found).toHaveLength(9);
    expect(found.every((c) => c.dist <= 1)).toBe(true);
  });

  test('the depth and cell bounds are honoured', () => {
    expect(reachableCells({ col: 0, row: 0 }, { isBlocked: () => false, maxDepth: 1 }))
      .toHaveLength(9);
    const capped = reachableCells({ col: 0, row: 0 }, { isBlocked: () => false, maxCells: 20 });
    expect(capped.length).toBeLessThan(40);
  });
});
