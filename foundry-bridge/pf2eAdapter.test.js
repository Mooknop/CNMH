// Adapter contract tests — the version tripwire.
//
// pf2eAdapter.js is the single place the bridge reads Foundry/PF2e data. These
// tests pin the EXACT shape each adapter function expects, driven by captured
// fixtures under __fixtures__/<version>/. When Foundry v14 (or a PF2e system bump)
// moves a path, the re-exported fixture stops matching and the relevant test here
// fails — telling you precisely which adapter function to update, before anything
// ships. Fixtures are loaded through the hydrate helpers (see __fixtures__/README).

import fs from 'fs';
import path from 'path';

import {
  getHp, getHeroPoints, getFocusPool, getSpeed, getConditions,
  getDefenses, getCombatantActor,
  getActorById, getActorId, getActorTokens,
  updateActorHp, updateActorHeroPoints,
  isConditionItem, getConditionItemActor,
  getCombatantActorId, getCombatantTokenId, getCombatantInitiative,
  getCombatById, getActiveCombat, advanceCombatTurn, getCombatState,
  getGridSize, getAllTokens, getTokenDimensions, getTokenDisposition,
  getTokenGridPosition, gridToPixels, measureMoveCost, hasWallCollision, moveToken,
  resolveMovedPosition, planTokenPath, measureTokenPathCost, moveTokenPath,
  getTokenById, resolveCombatantToken, setUserTargets, checkFlanking,
  applyEffectByUuid, applyTypedDamage,
  isEffectItem, getEffectItemActor, getEffects,
  getBestiaryInfo,
  rollFormula, _resetCanvasFallbackWarnings,
  createMeasuredTemplate,
  getGridDistance, getTokenScene, getSceneGridSize, isTokenHidden, getTokenName,
  pixelsToGrid, getCanvasBoundsRect, moverCaptureRect,
} from './pf2eAdapter.js';
import {
  hydrateActorFixture, hydrateCombatFixture, makeActor, makeToken, makeScene,
  makeCombat, makeCombatant, makeEffectItem, equipV14Movement,
} from './test/foundryMock.js';
import { BRIDGE_SOURCE_FLAG } from './utils.js';

const FIXTURE_VERSIONS = ['v13', 'v14'];
const fixtureDir = (v) => path.join(__dirname, '__fixtures__', v);
const loadFixture = (v, name) => {
  const file = path.join(fixtureDir(v), name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};

// Run the full contract against every version that has fixtures checked in.
// v14 is skipped automatically until its fixtures are exported.
describe.each(FIXTURE_VERSIONS)('contract: %s fixtures', (version) => {
  const actorJson = loadFixture(version, 'actor-pc.json');
  const combatJson = loadFixture(version, 'combat.json');
  const tokenJson = loadFixture(version, 'token.json');

  const haveFixtures = actorJson && combatJson && tokenJson;
  const maybe = haveFixtures ? describe : describe.skip;

  maybe('actor data paths', () => {
    const actor = haveFixtures ? hydrateActorFixture(actorJson) : null;

    test('getHp reads system.attributes.hp.{value,max,temp} + dying/wounded/doomed', () => {
      expect(getHp(actor)).toEqual({
        current: 32, max: 48, temp: 5,
        dying: 0, wounded: 1, doomed: 0,
      });
    });

    test('getHeroPoints reads system.resources.heroPoints.value', () => {
      expect(getHeroPoints(actor)).toBe(2);
    });

    test('getFocusPool reads system.resources.focus.{value,max}', () => {
      expect(getFocusPool(actor)).toEqual({ value: 1, max: 2 });
    });

    test('getSpeed prefers system.movement.speeds.land.total', () => {
      expect(getSpeed(actor)).toBe(30);
    });

    test('getConditions reads condition items as { slug, value } (null badge → 1)', () => {
      expect(getConditions(actor)).toEqual([
        { slug: 'frightened', value: 2 },
        { slug: 'off-guard', value: 1 },
      ]);
    });
  });

  maybe('combat data paths', () => {
    const combat = haveFixtures ? hydrateCombatFixture(combatJson) : null;

    test('getCombatState exposes active/started/round/turn/combatants/activeCombatantId', () => {
      const state = getCombatState(combat);
      expect(state).toMatchObject({
        active: true, started: true, round: 2, turn: 1,
        activeCombatantId: 'cbt-goblin', // combatants[turn=1]
      });
      expect(state.combatants).toHaveLength(2);
    });

    test('combatant accessors read actorId/tokenId/initiative', () => {
      const [pellias] = combatJson.combatants;
      expect(getCombatantActorId(pellias)).toBe('MVvMwyyIRSnYQDwm');
      expect(getCombatantTokenId(pellias)).toBe('tok-pellias');
      expect(getCombatantInitiative(pellias)).toBe(18);
    });
  });

  maybe('token geometry paths', () => {
    test('getTokenDimensions reads document.{width,height}', () => {
      expect(getTokenDimensions(tokenJson)).toEqual({ width: 1, height: 1 });
    });

    test('getTokenGridPosition converts pixel x/y to grid col/row via canvas grid size', () => {
      // setup.js installs a 100px grid.
      expect(getTokenGridPosition(tokenJson)).toEqual({ col: 5, row: 3 });
    });

    // The path rail (#1736 S1) reads the SAME document.{width,height} to centre
    // its collision walk, so it belongs on the cross-version tripwire.
    test('planTokenPath centres its degraded collision walk on the token footprint', async () => {
      const probed = [];
      global.CONFIG.Canvas.polygonBackends.move.testCollision = (origin, dest) => {
        probed.push([origin, dest]);
        return false;
      };
      // Fixture token sits at (500,300) → 1×1 footprint → centre (550,350).
      const { path, clipped } = await planTokenPath(tokenJson, [{ x: 650, y: 350 }]);
      expect(clipped).toBe(false);
      expect(path).toEqual([{ x: 650, y: 350 }]);
      expect(probed[0][0]).toEqual({ x: 550, y: 350 });
    });

    test('measureTokenPathCost sums centre-to-centre legs from the token position', async () => {
      await expect(
        measureTokenPathCost(tokenJson, [{ x: 650, y: 350 }, { x: 750, y: 350 }])
      ).resolves.toBe(10);
    });
  });
});

// --- Behavioural contract tests against the mock (version-independent) ---

describe('adapter writes are echo-tagged', () => {
  test('updateActorHp writes hp value/temp tagged for the echo guard', () => {
    const actor = makeActor();
    updateActorHp(actor, { current: 20, temp: 3 });
    expect(actor.update).toHaveBeenCalledWith(
      { 'system.attributes.hp.value': 20, 'system.attributes.hp.temp': 3 },
      { [BRIDGE_SOURCE_FLAG]: 'app' },
    );
  });

  test('updateActorHp defaults temp to 0 when omitted', () => {
    const actor = makeActor();
    updateActorHp(actor, { current: 10 });
    expect(actor.update).toHaveBeenCalledWith(
      { 'system.attributes.hp.value': 10, 'system.attributes.hp.temp': 0 },
      { [BRIDGE_SOURCE_FLAG]: 'app' },
    );
  });

  test('updateActorHeroPoints writes the resource tagged for the echo guard', () => {
    const actor = makeActor();
    updateActorHeroPoints(actor, 1);
    expect(actor.update).toHaveBeenCalledWith(
      { 'system.resources.heroPoints.value': 1 },
      { [BRIDGE_SOURCE_FLAG]: 'app' },
    );
  });

  test('moveToken (v13) writes x/y tagged + animated and resolves with the request', async () => {
    const token = makeToken();
    await expect(moveToken(token, 250, 400)).resolves.toEqual({ x: 250, y: 400 });
    expect(token.document.update).toHaveBeenCalledWith(
      { x: 250, y: 400 },
      { [BRIDGE_SOURCE_FLAG]: 'app', animate: true },
    );
  });

  // v14 movement-pipeline switch point (#1574).
  describe('moveToken v14 pipeline', () => {
    test('generation 14 + TokenDocument#move → the pipeline is used, not update()', async () => {
      global.game.release = { generation: 14 };
      const token = makeToken({ x: 100, y: 100 });
      token.document.move = jest.fn(async ({ x, y }) => {
        token.document.x = x;
        token.document.y = y;
      });

      const landed = await moveToken(token, 250, 400);

      expect(token.document.move).toHaveBeenCalledWith(
        { x: 250, y: 400 },
        { [BRIDGE_SOURCE_FLAG]: 'app' },
      );
      expect(token.document.update).not.toHaveBeenCalled();
      expect(landed).toEqual({ x: 250, y: 400 });
    });

    test('generation 14 WITHOUT move() keeps the update() fallback', async () => {
      global.game.release = { generation: 14 };
      const token = makeToken();
      const landed = await moveToken(token, 250, 400);
      expect(token.document.update).toHaveBeenCalled();
      expect(landed).toEqual({ x: 250, y: 400 });
    });

    test('generation 13 never enters the pipeline even when move() exists', async () => {
      const token = makeToken();
      token.document.move = jest.fn();
      await moveToken(token, 250, 400);
      expect(token.document.move).not.toHaveBeenCalled();
      expect(token.document.update).toHaveBeenCalled();
    });
  });

  // Post-move document poll (#1574) — the two pipeline gotchas.
  describe('resolveMovedPosition', () => {
    const FAST = { timeoutMs: 40, intervalMs: 1 };
    const PREV = { x: 100, y: 100 };

    test('document already at the target → the target, immediately', async () => {
      const doc = { x: 250, y: 400 };
      await expect(resolveMovedPosition(doc, { x: 250, y: 400 }, PREV, FAST))
        .resolves.toEqual({ x: 250, y: 400 });
    });

    test('a changed position that settles is a legal stop-short', async () => {
      const doc = { x: 200, y: 400 }; // constraint stopped the move one cell short
      await expect(resolveMovedPosition(doc, { x: 250, y: 400 }, PREV, FAST))
        .resolves.toEqual({ x: 200, y: 400 });
    });

    test('a document still at the start when the timeout drains is lag — trust the target', async () => {
      const doc = { x: 100, y: 100 };
      await expect(resolveMovedPosition(doc, { x: 250, y: 400 }, PREV, FAST))
        .resolves.toEqual({ x: 250, y: 400 });
    });

    test('mid-animation coordinates are not trusted until they hold', async () => {
      // Each read advances an animation frame; the token parks on the target.
      const frames = [
        { x: 120, y: 100 }, { x: 150, y: 200 }, { x: 180, y: 300 }, { x: 250, y: 400 },
      ];
      let i = 0;
      const doc = {
        get x() { return frames[Math.min(i, frames.length - 1)].x; },
        get y() { return frames[Math.min(i++, frames.length - 1)].y; },
      };
      await expect(resolveMovedPosition(doc, { x: 250, y: 400 }, PREV, { timeoutMs: 200, intervalMs: 1 }))
        .resolves.toEqual({ x: 250, y: 400 });
    });
  });
});

// Multi-waypoint path rail (#1736 S1). Every pixel in/out is a creature CENTRE;
// the adapter owns the centre ↔ token-corner translation core's APIs require.
describe('path rail: planTokenPath / measureTokenPathCost / moveTokenPath', () => {
  // 1×1 token at grid (1,1) on the 100px grid → centre (150,150).
  const setup = ({ generation = 13, ...v14 } = {}) => {
    const token = makeToken({ x: 100, y: 100 });
    global.game.release = { generation };
    if (generation >= 14) equipV14Movement(token, v14);
    return token;
  };

  describe('planTokenPath', () => {
    test('v14: findMovementPath is asked origin-first in token corners', async () => {
      const token = setup({ generation: 14 });
      const { path, clipped } = await planTokenPath(token, [{ x: 250, y: 150 }, { x: 350, y: 150 }]);

      expect(token.findMovementPath).toHaveBeenCalledWith([
        { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 300, y: 100 },
      ]);
      // The origin is stripped back off; the caller only sees the route ahead.
      expect(path).toEqual([{ x: 250, y: 150 }, { x: 350, y: 150 }]);
      expect(clipped).toBe(false);
    });

    test('v14: constrainMovementPath clipping the route sets clipped', async () => {
      const token = setup({ generation: 14, clipAfter: 1 });
      const { path, clipped } = await planTokenPath(token, [{ x: 250, y: 150 }, { x: 350, y: 150 }]);
      expect(path).toEqual([{ x: 250, y: 150 }]);
      expect(clipped).toBe(true);
    });

    test('v14: a PARTIAL findMovementPath result also reads as clipped', async () => {
      const token = setup({ generation: 14 });
      // The pathfinder is allowed to give up before the last waypoint.
      token.findMovementPath = jest.fn(() => ({
        promise: Promise.resolve([{ x: 100, y: 100 }, { x: 200, y: 100 }]),
      }));
      const { path, clipped } = await planTokenPath(token, [{ x: 250, y: 150 }, { x: 350, y: 150 }]);
      expect(path).toEqual([{ x: 250, y: 150 }]);
      expect(clipped).toBe(true);
    });

    test('v14: a job that resolves to nothing degrades to the collision walk', async () => {
      const token = setup({ generation: 14 });
      token.findMovementPath = jest.fn(() => ({ promise: Promise.resolve(null) }));
      const { path, clipped } = await planTokenPath(token, [{ x: 250, y: 150 }]);
      expect(path).toEqual([{ x: 250, y: 150 }]);
      expect(clipped).toBe(false);
    });

    test('v13 (or no findMovementPath): the walk stops at the first blocked leg', async () => {
      const token = setup();
      global.CONFIG.Canvas.polygonBackends.move.testCollision = (origin) => origin.x === 250;
      const { path, clipped } = await planTokenPath(token, [{ x: 250, y: 150 }, { x: 350, y: 150 }]);
      expect(path).toEqual([{ x: 250, y: 150 }]);
      expect(clipped).toBe(true);
    });

    test('generation 13 never enters the pipeline even when the methods exist', async () => {
      const token = makeToken({ x: 100, y: 100 });
      equipV14Movement(token);
      await planTokenPath(token, [{ x: 250, y: 150 }]);
      expect(token.findMovementPath).not.toHaveBeenCalled();
    });

    test('an empty waypoint list is a no-op', async () => {
      const token = setup({ generation: 14 });
      await expect(planTokenPath(token, [])).resolves.toEqual({ path: [], clipped: false });
      expect(token.findMovementPath).not.toHaveBeenCalled();
    });

    test('an explicit origin overrides the token position', async () => {
      const token = setup({ generation: 14 });
      await planTokenPath(token, [{ x: 250, y: 150 }], { origin: { x: 950, y: 150 } });
      expect(token.findMovementPath).toHaveBeenCalledWith([
        { x: 900, y: 100 }, { x: 200, y: 100 },
      ]);
    });
  });

  describe('measureTokenPathCost', () => {
    test('v14: prefers the terrain-aware measureMovementPath cost', async () => {
      const token = setup({ generation: 14, costPerLeg: 10 });
      // Geometry alone would price these two 5-ft legs at 10.
      await expect(measureTokenPathCost(token, [{ x: 250, y: 150 }, { x: 350, y: 150 }]))
        .resolves.toBe(20);
      expect(token.document.measureMovementPath).toHaveBeenCalledWith([
        { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 300, y: 100 },
      ]);
    });

    test('v14: falls back to `distance` when the build reports no cost', async () => {
      const token = setup({ generation: 14 });
      token.document.measureMovementPath = jest.fn(() => ({ distance: 25 }));
      await expect(measureTokenPathCost(token, [{ x: 250, y: 150 }])).resolves.toBe(25);
    });

    test('v13: sums measureMoveCost per leg (diagonal rule kept, Region cost lost)', async () => {
      const token = setup();
      await expect(measureTokenPathCost(token, [{ x: 250, y: 150 }, { x: 250, y: 250 }]))
        .resolves.toBe(10);
    });

    test('an empty waypoint list costs nothing', async () => {
      await expect(measureTokenPathCost(setup(), [])).resolves.toBe(0);
    });
  });

  describe('moveTokenPath', () => {
    test('v14: ONE move() carrying every waypoint, tagged, resolving at the landing', async () => {
      const token = setup({ generation: 14 });
      const landed = await moveTokenPath(token, [{ x: 250, y: 150 }, { x: 350, y: 150 }]);

      expect(token.document.move).toHaveBeenCalledTimes(1);
      expect(token.document.move).toHaveBeenCalledWith(
        [{ x: 200, y: 100 }, { x: 300, y: 100 }],
        { [BRIDGE_SOURCE_FLAG]: 'app' },
      );
      expect(token.document.update).not.toHaveBeenCalled();
      expect(landed).toEqual({ x: 350, y: 150 });
    });

    test('v14: a stop-short resolves with where the token ACTUALLY parked', async () => {
      const token = setup({ generation: 14, stopAt: { x: 200, y: 100 } });
      await expect(moveTokenPath(token, [{ x: 250, y: 150 }, { x: 350, y: 150 }]))
        .resolves.toEqual({ x: 250, y: 150 });
    });

    test('v13: one tagged update() per waypoint, resolving at the last', async () => {
      const token = setup();
      const landed = await moveTokenPath(token, [{ x: 250, y: 150 }, { x: 250, y: 250 }]);

      expect(token.document.update).toHaveBeenCalledTimes(2);
      expect(token.document.update).toHaveBeenNthCalledWith(
        2, { x: 200, y: 200 }, { [BRIDGE_SOURCE_FLAG]: 'app', animate: true },
      );
      expect(landed).toEqual({ x: 250, y: 250 });
    });

    test('an empty waypoint list leaves the token where it is', async () => {
      const token = setup();
      await expect(moveTokenPath(token, [])).resolves.toEqual({ x: 150, y: 150 });
      expect(token.document.update).not.toHaveBeenCalled();
    });
  });

  test('a Large token converts on its own 2x2 footprint, not one square', async () => {
    global.game.release = { generation: 14 };
    const ogre = makeToken({ x: 800, y: 800, width: 2, height: 2 });
    equipV14Movement(ogre);
    // Centre offset is a whole grid square for a 2x2: corner (800,800) → (900,900).
    await planTokenPath(ogre, [{ x: 1000, y: 900 }]);
    expect(ogre.findMovementPath).toHaveBeenCalledWith([
      { x: 800, y: 800 }, { x: 900, y: 800 },
    ]);
  });
});

describe('adapter lookups read from globals', () => {
  test('getActorById reads game.actors', () => {
    const actor = makeActor({ id: 'a1' });
    global.game.actors.set('a1', actor);
    expect(getActorById('a1')).toBe(actor);
    expect(getActorById('missing')).toBeNull();
  });

  test('getActorTokens delegates to actor.getActiveTokens', () => {
    const token = makeToken();
    const actor = makeActor({ tokens: [token] });
    expect(getActorTokens(actor)).toEqual([token]);
    expect(getActorTokens({})).toEqual([]);
  });

  test('getActorId reads .id, null-safe', () => {
    expect(getActorId({ id: 'x' })).toBe('x');
    expect(getActorId(null)).toBeNull();
  });

  test('getCombatById reads game.combats; getActiveCombat reads game.combat', () => {
    const combat = { id: 'c1' };
    global.game.combats.set('c1', combat);
    global.game.combat = combat;
    expect(getCombatById('c1')).toBe(combat);
    expect(getActiveCombat()).toBe(combat);
  });

  test('advanceCombatTurn calls combat.nextTurn', () => {
    const combat = { nextTurn: jest.fn() };
    advanceCombatTurn(combat);
    expect(combat.nextTurn).toHaveBeenCalled();
  });

  test('getGridSize / getAllTokens read canvas', () => {
    const token = makeToken();
    global.canvas.tokens.placeables = [token];
    expect(getGridSize()).toBe(100);
    expect(getAllTokens()).toEqual([token]);
  });
});

describe('condition item helpers', () => {
  test('isConditionItem only matches type condition', () => {
    expect(isConditionItem({ type: 'condition' })).toBe(true);
    expect(isConditionItem({ type: 'weapon' })).toBe(false);
    expect(isConditionItem(null)).toBe(false);
  });

  test('getConditionItemActor returns parent only when it is an Actor', () => {
    const actor = makeActor();
    expect(getConditionItemActor({ parent: actor })).toBe(actor);
    expect(getConditionItemActor({ parent: { documentName: 'Item' } })).toBeNull();
    expect(getConditionItemActor({})).toBeNull();
  });
});

describe('movement measurement contract', () => {
  test('measureMoveCost delegates to canvas.grid.measurePath waypoints', () => {
    // default mock measurePath = chebyshev * 5ft on a 100px grid
    expect(measureMoveCost(0, 0, 300, 0)).toBe(15);
    expect(measureMoveCost(0, 0, 200, 200)).toBe(10);
  });

  test('gridToPixels round-trips with getTokenGridPosition', () => {
    const { x, y } = gridToPixels(5, 3);
    expect({ x, y }).toEqual({ x: 500, y: 300 });
    expect(getTokenGridPosition({ x, y })).toEqual({ col: 5, row: 3 });
  });

  test('hasWallCollision delegates to the move polygon backend', () => {
    expect(hasWallCollision(0, 0, 100, 0)).toBe(false);
    global.CONFIG.Canvas.polygonBackends.move.testCollision = () => true;
    expect(hasWallCollision(0, 0, 100, 0)).toBe(true);
  });

  test('getTokenDisposition reads document.disposition (defaults to 0)', () => {
    expect(getTokenDisposition(makeToken({ disposition: 1 }))).toBe(1);
    expect(getTokenDisposition(makeToken({ disposition: -1 }))).toBe(-1);
    expect(getTokenDisposition(makeToken())).toBe(0);
    expect(getTokenDisposition(null)).toBe(0);
  });
});

describe('targeting (Slice 2)', () => {
  test('getTokenById reads canvas.tokens.get', () => {
    const token = makeToken({ id: 'tok-x' });
    global.canvas.tokens.placeables = [token];
    expect(getTokenById('tok-x')).toBe(token);
    expect(getTokenById('missing')).toBeNull();
  });

  test('resolveCombatantToken maps an entryId → combatant tokenId → placed token', () => {
    const token = makeToken({ id: 'tok-goblin' });
    const combat = makeCombat({
      combatants: [makeCombatant({ id: 'cbt-goblin', tokenId: 'tok-goblin' })],
    });
    global.game.combat = combat;
    global.canvas.tokens.placeables = [token];
    expect(resolveCombatantToken('cbt-goblin')).toBe(token);
  });

  test('resolveCombatantToken returns null for an unknown entry / no combat', () => {
    const combat = makeCombat({ combatants: [makeCombatant({ id: 'cbt-a', tokenId: 'tok-a' })] });
    global.game.combat = combat;
    global.canvas.tokens.placeables = [makeToken({ id: 'tok-a' })];
    expect(resolveCombatantToken('cbt-zzz')).toBeNull();
    global.game.combat = null;
    expect(resolveCombatantToken('cbt-a')).toBeNull();
  });

  test('setUserTargets passes resolved token ids to the user API', () => {
    setUserTargets([makeToken({ id: 't1' }), makeToken({ id: 't2' }), null]);
    expect(global.game.user.updateTokenTargets).toHaveBeenCalledWith(['t1', 't2']);
  });

  test('checkFlanking delegates to token.isFlanking and returns its boolean', () => {
    const attacker = makeToken({ isFlanking: true });
    const target   = makeToken();
    expect(checkFlanking(attacker, target)).toBe(true);
    expect(attacker.isFlanking).toHaveBeenCalledWith(target);

    const notFlanking = makeToken({ isFlanking: false });
    expect(checkFlanking(notFlanking, target)).toBe(false);
  });

  test('checkFlanking returns false safely when token lacks isFlanking', () => {
    expect(checkFlanking({}, makeToken())).toBe(false);
    expect(checkFlanking(null, makeToken())).toBe(false);
  });
});

describe('getDefenses', () => {
  function makeActorWithDefenses(opts = {}) {
    const actor = makeActor({ id: opts.id || 'a1' });
    actor.system.attributes.ac = { value: opts.ac ?? 18 };
    actor.system.saves = {
      fortitude: { value: opts.fortitude ?? 10 },
      reflex:    { value: opts.reflex    ?? 7  },
      will:      { value: opts.will      ?? 5  },
    };
    actor.system.attributes.immunities  = opts.immunities  ?? [];
    actor.system.attributes.resistances = opts.resistances ?? [];
    actor.system.attributes.weaknesses  = opts.weaknesses  ?? [];
    return actor;
  }

  test('returns AC and save modifiers from system.*', () => {
    const actor = makeActorWithDefenses({ ac: 22, fortitude: 12, reflex: 8, will: 6 });
    expect(getDefenses(actor)).toEqual({
      ac: 22,
      saves: { fortitude: 12, reflex: 8, will: 6 },
      immunities:  [],
      resistances: [],
      weaknesses:  [],
    });
  });

  test('returns null for AC when system path is absent', () => {
    const actor = makeActor({ id: 'bare' });
    const d = getDefenses(actor);
    expect(d.ac).toBeNull();
    expect(d.saves.fortitude).toBeNull();
    expect(d.saves.reflex).toBeNull();
    expect(d.saves.will).toBeNull();
  });

  test('maps immunities to type strings', () => {
    const actor = makeActorWithDefenses({
      immunities: [{ type: 'fire' }, { type: 'poison' }],
    });
    expect(getDefenses(actor).immunities).toEqual(['fire', 'poison']);
  });

  test('maps resistances and weaknesses to { type, value } objects', () => {
    const actor = makeActorWithDefenses({
      resistances: [{ type: 'cold', value: 5 }],
      weaknesses:  [{ type: 'fire', value: 10 }],
    });
    const d = getDefenses(actor);
    expect(d.resistances).toEqual([{ type: 'cold', value: 5 }]);
    expect(d.weaknesses).toEqual([{ type: 'fire', value: 10 }]);
  });

  test('returns null when actor is null', () => {
    expect(getDefenses(null)).toBeNull();
    expect(getDefenses(undefined)).toBeNull();
  });
});

describe('getCombatantActor', () => {
  test('prefers the embedded actor reference', () => {
    const actor = makeActor({ id: 'a1' });
    const cbt = makeCombatant({ id: 'c1', actorId: 'a1', actor });
    expect(getCombatantActor(cbt)).toBe(actor);
  });

  test('falls back to game.actors lookup when actor is null', () => {
    const actor = makeActor({ id: 'a2' });
    global.game.actors.set('a2', actor);
    const cbt = makeCombatant({ id: 'c2', actorId: 'a2', actor: null });
    expect(getCombatantActor(cbt)).toBe(actor);
  });

  test('returns null when neither path resolves', () => {
    const cbt = makeCombatant({ id: 'c3', actorId: null, actor: null });
    expect(getCombatantActor(cbt)).toBeNull();
  });
});

describe('applyEffectByUuid (Slice B)', () => {
  test('resolves UUID, clones source, creates embedded Item tagged for echo guard', async () => {
    const actor = makeActor();
    const src   = { toObject: jest.fn().mockReturnValue({ type: 'effect', name: 'Effect: Courageous Anthem' }) };
    global.fromUuid = jest.fn().mockResolvedValue(src);

    await applyEffectByUuid(actor, 'Compendium.pf2e.spell-effects.Item.abc');

    expect(global.fromUuid).toHaveBeenCalledWith('Compendium.pf2e.spell-effects.Item.abc');
    expect(src.toObject).toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith(
      'Item',
      [{ type: 'effect', name: 'Effect: Courageous Anthem' }],
      { [BRIDGE_SOURCE_FLAG]: 'app' },
    );
  });

  test('returns null when fromUuid resolves to null (invalid / wrong pack)', async () => {
    const actor = makeActor();
    global.fromUuid = jest.fn().mockResolvedValue(null);

    const result = await applyEffectByUuid(actor, 'bad-uuid');

    expect(result).toBeNull();
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test('returns null when actor is null', async () => {
    const src = { toObject: jest.fn().mockReturnValue({}) };
    global.fromUuid = jest.fn().mockResolvedValue(src);

    const result = await applyEffectByUuid(null, 'Compendium.pf2e.x.Item.1');
    expect(result).toBeNull();
  });

  test('slug: ref resolves a world Item by slug (no fromUuid call)', async () => {
    const actor = makeActor();
    const worldEffect = { slug: 'courageous-anthem-aura', toObject: jest.fn().mockReturnValue({ type: 'effect', name: 'Aura' }) };
    global.game.items = { contents: [worldEffect] };
    global.fromUuid = jest.fn();

    await applyEffectByUuid(actor, 'slug:courageous-anthem-aura');

    expect(global.fromUuid).not.toHaveBeenCalled();
    expect(worldEffect.toObject).toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith(
      'Item', [{ type: 'effect', name: 'Aura' }], { [BRIDGE_SOURCE_FLAG]: 'app' },
    );
  });

  test('slug: ref with no matching world Item returns null', async () => {
    const actor = makeActor();
    global.game.items = { contents: [] };
    const result = await applyEffectByUuid(actor, 'slug:not-imported');
    expect(result).toBeNull();
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });
});

describe('applyTypedDamage (#1016)', () => {
  test('typed amount builds an evaluated DamageRoll so PF2e nets IWR', async () => {
    const actor = makeActor({ name: 'Troll' });
    const token = makeToken({ actor });

    const applied = await applyTypedDamage(token, 8, 'fire');

    expect(applied).toBe(true);
    expect(actor.applyDamage).toHaveBeenCalledTimes(1);
    const arg = actor.applyDamage.mock.calls[0][0];
    expect(arg.damage.formula).toBe('8[fire]');
    expect(arg.damage.evaluated).toBe(true);
    expect(arg.token).toBe(token.document); // TokenDocument, not the placeable
  });

  test('untyped amount applies as a plain number (deliberate no-IWR path)', async () => {
    const actor = makeActor();
    const token = makeToken({ actor });

    const applied = await applyTypedDamage(token, 5, '');

    expect(applied).toBe(true);
    expect(actor.applyDamage).toHaveBeenCalledWith(
      expect.objectContaining({ damage: 5 })
    );
  });

  test('falls back to a plain number when no DamageRoll class is registered', async () => {
    global.CONFIG.Dice = { rolls: [] };
    const actor = makeActor();
    const token = makeToken({ actor });

    const applied = await applyTypedDamage(token, 8, 'fire');

    expect(applied).toBe(true);
    expect(actor.applyDamage).toHaveBeenCalledWith(
      expect.objectContaining({ damage: 8 })
    );
  });

  test('returns false without applying for no actor / zero / non-numeric amounts', async () => {
    const actor = makeActor();
    const token = makeToken({ actor });

    expect(await applyTypedDamage(null, 8, 'fire')).toBe(false);
    expect(await applyTypedDamage({ actor: null }, 8, 'fire')).toBe(false);
    expect(await applyTypedDamage(token, 0, 'fire')).toBe(false);
    expect(await applyTypedDamage(token, 'lots', 'fire')).toBe(false);
    expect(actor.applyDamage).not.toHaveBeenCalled();
  });

  test('a negative amount heals as a plain untyped number (#1537 S4)', async () => {
    const actor = makeActor();
    const token = makeToken({ actor });

    expect(await applyTypedDamage(token, -3, 'fire')).toBe(true);
    // Healing bypasses the typed DamageRoll path — no IWR applies to healing.
    expect(actor.applyDamage).toHaveBeenCalledWith(
      expect.objectContaining({ damage: -3 })
    );
  });
});

describe('effect item read-back helpers (#455)', () => {
  test('isEffectItem matches only effect-type items', () => {
    expect(isEffectItem({ type: 'effect' })).toBe(true);
    expect(isEffectItem({ type: 'condition' })).toBe(false);
    expect(isEffectItem(null)).toBe(false);
  });

  test('getEffectItemActor returns the parent actor or null', () => {
    const actor = makeActor();
    expect(getEffectItemActor(makeEffectItem({ parent: actor }))).toBe(actor);
    expect(getEffectItemActor(makeEffectItem({ parent: null }))).toBeNull();
  });

  test('getEffects lists active effect items as { slug, name, img }', () => {
    const actor = makeActor({
      effects: [{ slug: 'spell-effect-courageous-anthem', name: 'Spell Effect: Courageous Anthem', img: 'x.webp' }],
    });
    expect(getEffects(actor)).toEqual([
      { slug: 'spell-effect-courageous-anthem', name: 'Spell Effect: Courageous Anthem', img: 'x.webp' },
    ]);
  });

  test('getEffects drops expired, disabled, and slugless effects', () => {
    const actor = makeActor({
      effects: [
        { slug: 'spell-effect-courageous-anthem', name: 'Active' },
        { slug: 'expired-one', name: 'Expired', isExpired: true },
        { slug: 'disabled-one', name: 'Disabled', disabled: true },
        { slug: '', name: 'Slugless' },
      ],
    });
    expect(getEffects(actor)).toEqual([
      { slug: 'spell-effect-courageous-anthem', name: 'Active', img: null },
    ]);
  });
});

describe('getBestiaryInfo', () => {
  test('reads all fields from a fully-populated NPC actor', () => {
    const actor = makeActor({
      img: 'tokens/goblin.webp',
      level: 3,
      rarity: 'uncommon',
      traits: ['humanoid', 'goblin'],
      size: 'sm',
      perception: 7,
      hp: { value: 30, max: 36 },
      speed: 30,
      publicNotes: '<p>A <strong>sneaky</strong> goblin.</p>',
    });
    const info = getBestiaryInfo(actor);
    expect(info).toEqual({
      img: 'tokens/goblin.webp',
      level: 3,
      rarity: 'uncommon',
      traits: ['sm', 'humanoid', 'goblin'],
      perception: 7,
      speed: 30,
      hp: expect.objectContaining({ current: 30, max: 36 }),
      description: 'A sneaky goblin.',
      creatureKey: 'test-actor-l3',
    });
  });

  test('strips HTML tags from publicNotes', () => {
    const actor = makeActor({ publicNotes: '<h2>Title</h2><ul><li>Item</li></ul>' });
    expect(getBestiaryInfo(actor).description).toBe('TitleItem');
  });

  test('returns empty description when publicNotes is absent', () => {
    const actor = makeActor({ publicNotes: '' });
    expect(getBestiaryInfo(actor).description).toBe('');
  });

  test('defaults rarity to common when not set', () => {
    const actor = makeActor({});
    expect(getBestiaryInfo(actor).rarity).toBe('common');
  });

  test('returns null for null actor', () => {
    expect(getBestiaryInfo(null)).toBeNull();
  });

  test('returns null for undefined actor', () => {
    expect(getBestiaryInfo(undefined)).toBeNull();
  });

  describe('creatureKey', () => {
    test('uses the compendium source UUID when present', () => {
      const actor = makeActor({
        name: 'Goblin Warrior',
        level: 1,
        compendiumSource: 'Compendium.pf2e.pathfinder-bestiary.Actor.abc123',
      });
      expect(getBestiaryInfo(actor).creatureKey)
        .toBe('Compendium.pf2e.pathfinder-bestiary.Actor.abc123');
    });

    test('falls back to flags.core.sourceId when no _stats source', () => {
      const actor = makeActor({
        name: 'Goblin Warrior',
        level: 1,
        sourceId: 'Compendium.pf2e.pathfinder-bestiary.Actor.legacy',
      });
      expect(getBestiaryInfo(actor).creatureKey)
        .toBe('Compendium.pf2e.pathfinder-bestiary.Actor.legacy');
    });

    test('two of the same compendium creature share a key', () => {
      const a = makeActor({ name: 'Goblin 1', level: 1, compendiumSource: 'Compendium.pf2e.x.Actor.gob' });
      const b = makeActor({ name: 'Goblin 2', level: 1, compendiumSource: 'Compendium.pf2e.x.Actor.gob' });
      expect(getBestiaryInfo(a).creatureKey).toBe(getBestiaryInfo(b).creatureKey);
    });

    test('name-suffix fallback collapses Goblin Warrior 1/2/3', () => {
      const k1 = getBestiaryInfo(makeActor({ name: 'Goblin Warrior 1', level: 2 })).creatureKey;
      const k2 = getBestiaryInfo(makeActor({ name: 'Goblin Warrior 2', level: 2 })).creatureKey;
      const k3 = getBestiaryInfo(makeActor({ name: 'Goblin Warrior (3)', level: 2 })).creatureKey;
      expect(k1).toBe('goblin-warrior-l2');
      expect(k2).toBe(k1);
      expect(k3).toBe(k1);
    });

    test('different creatures get different fallback keys', () => {
      const goblin = getBestiaryInfo(makeActor({ name: 'Goblin Warrior', level: 1 })).creatureKey;
      const orc    = getBestiaryInfo(makeActor({ name: 'Orc Brute', level: 1 })).creatureKey;
      expect(goblin).not.toBe(orc);
    });

    test('same name at a different level differs', () => {
      const l1 = getBestiaryInfo(makeActor({ name: 'Goblin Warrior', level: 1 })).creatureKey;
      const l2 = getBestiaryInfo(makeActor({ name: 'Goblin Warrior', level: 2 })).creatureKey;
      expect(l1).not.toBe(l2);
    });
  });
});

// --- v14 namespace hardening ---------------------------------------------------
// Exposures verified against https://foundryvtt.com/api/v14: fromUuid →
// foundry.utils.fromUuid; ChatMessage → CONFIG.ChatMessage.documentClass (the
// configured class the v13 global resolves to) then foundry.documents.ChatMessage;
// polygonBackends.move.testCollision and grid.measurePath survive into v14 but
// are guarded to DEGRADE (fail-open / Chebyshev estimate) instead of throw.
describe('v14 namespace hardening', () => {
  // Minimal core-Roll stand-in for rollFormula (mirrors dice.test.js MockRoll).
  class MockRoll {
    constructor(formula) { this.formula = formula; this.total = 7; this.dice = []; }
    static validate() { return true; }
    async evaluate() { return this; }
    async toMessage() {}
  }

  afterEach(() => {
    delete global.foundry;
    delete global.Roll;
    delete global.ChatMessage;
    _resetCanvasFallbackWarnings();
  });

  test('applyEffectByUuid resolves through foundry.utils.fromUuid when the bare global is gone', async () => {
    const actor = makeActor();
    const src = { toObject: jest.fn().mockReturnValue({ type: 'effect', name: 'Effect: NS' }) };
    // v14 world: only the namespaced resolver exists.
    delete global.fromUuid;
    global.foundry = { utils: { fromUuid: jest.fn().mockResolvedValue(src) } };

    await applyEffectByUuid(actor, 'Compendium.pf2e.spell-effects.Item.ns1');

    expect(global.foundry.utils.fromUuid).toHaveBeenCalledWith('Compendium.pf2e.spell-effects.Item.ns1');
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith(
      'Item', [{ type: 'effect', name: 'Effect: NS' }], { [BRIDGE_SOURCE_FLAG]: 'app' },
    );
  });

  test('rollFormula speaker prefers CONFIG.ChatMessage.documentClass over the namespaced base', async () => {
    const configured = { getSpeaker: jest.fn().mockReturnValue({ alias: 'configured' }) };
    const namespaced = { getSpeaker: jest.fn() };
    global.CONFIG.ChatMessage = { documentClass: configured };
    global.foundry = { dice: { Roll: MockRoll }, documents: { ChatMessage: namespaced } };
    // v14 world: the bare globals are gone.
    delete global.Roll;
    delete global.ChatMessage;

    const result = await rollFormula('1d20');

    expect(result).toEqual({ total: 7, faces: [] });
    expect(configured.getSpeaker).toHaveBeenCalledWith();
    expect(namespaced.getSpeaker).not.toHaveBeenCalled();
  });

  test('rollFormula speaker falls back to foundry.documents.ChatMessage when nothing is configured', async () => {
    const namespaced = { getSpeaker: jest.fn().mockReturnValue({ alias: 'ns' }) };
    global.foundry = { dice: { Roll: MockRoll }, documents: { ChatMessage: namespaced } };
    delete global.Roll;
    delete global.ChatMessage;

    const actor = makeActor();
    const result = await rollFormula('1d20', { actor });

    expect(result).toEqual({ total: 7, faces: [] });
    expect(namespaced.getSpeaker).toHaveBeenCalledWith({ actor });
  });

  test('hasWallCollision fails OPEN (no collision, warns once) when the polygon backend is unavailable', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      global.CONFIG = {};
      expect(hasWallCollision(0, 0, 100, 0)).toBe(false);
      expect(hasWallCollision(0, 0, 200, 0)).toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/testCollision unavailable/);
    } finally {
      warn.mockRestore();
    }
  });

  test('measureMoveCost degrades to Chebyshev feet (warns once) when measurePath is unavailable', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      global.canvas.grid = { size: 100 };
      expect(measureMoveCost(0, 0, 300, 0)).toBe(15);
      expect(measureMoveCost(0, 0, 200, 200)).toBe(10);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/measurePath unavailable/);
    } finally {
      warn.mockRestore();
    }
  });
});

// Spell-area outlines (#1573 B4) — v14 removed MeasuredTemplate; the adapter
// switches to Scene Regions on generation >= 14 (same switch point as moveToken).
describe('createMeasuredTemplate v14 Region switch', () => {
  // 100px grid squares worth 5 ft each → 20 ft radius = 400 px.
  const templateScene = ({ sceneId = 'scene-1', created = [{ id: 'made-1' }] } = {}) => {
    const createEmbeddedDocuments = jest.fn().mockResolvedValue(created);
    global.canvas = {
      scene: { id: sceneId, grid: { size: 100, distance: 5 }, createEmbeddedDocuments },
    };
    return createEmbeddedDocuments;
  };

  test('generation 13 keeps the MeasuredTemplate write byte-identical', async () => {
    const create = templateScene();
    const id = await createMeasuredTemplate({
      shape: 'burst', feet: 20, x: 500, y: 300, sceneId: 'scene-1', fillColor: '#ff6400',
    });
    expect(create).toHaveBeenCalledWith(
      'MeasuredTemplate',
      [{ t: 'circle', x: 500, y: 300, distance: 20, direction: 0, fillColor: '#ff6400' }],
      { [BRIDGE_SOURCE_FLAG]: 'app' },
    );
    expect(id).toBe('made-1');
  });

  test('generation 14 creates a Region circle in canvas pixels, visible to everyone', async () => {
    global.game.release = { generation: 14 };
    const create = templateScene();
    const id = await createMeasuredTemplate({
      shape: 'burst', feet: 20, x: 500, y: 300, sceneId: 'scene-1',
    });
    expect(create).toHaveBeenCalledWith(
      'Region',
      [expect.objectContaining({
        // 20 ft / 5 ft-per-square * 100 px-per-square = 400 px radius.
        shapes: [{ type: 'circle', x: 500, y: 300, radius: 400 }],
        visibility: 2, // CONST.REGION_VISIBILITY.ALWAYS — template parity
      })],
      { [BRIDGE_SOURCE_FLAG]: 'app' },
    );
    expect(create).not.toHaveBeenCalledWith('MeasuredTemplate', expect.anything(), expect.anything());
    expect(id).toBe('made-1');
  });

  test('generation 14 honours CONST.REGION_VISIBILITY when the build exposes it', async () => {
    global.game.release = { generation: 14 };
    global.CONST = { REGION_VISIBILITY: { ALWAYS: 2 } };
    const create = templateScene();
    try {
      await createMeasuredTemplate({ shape: 'emanation', feet: 30, x: 0, y: 0 });
    } finally {
      delete global.CONST;
    }
    expect(create.mock.calls[0][1][0].visibility).toBe(2);
    // 30 ft / 5 * 100 = 600 px.
    expect(create.mock.calls[0][1][0].shapes[0].radius).toBe(600);
  });

  test('generation 14 maps fillColor onto the Region color field, omitted when blank', async () => {
    global.game.release = { generation: 14 };
    const create = templateScene();
    await createMeasuredTemplate({ shape: 'burst', feet: 10, x: 1, y: 2, fillColor: '#ff6400' });
    await createMeasuredTemplate({ shape: 'burst', feet: 10, x: 1, y: 2 });
    expect(create.mock.calls[0][1][0].color).toBe('#ff6400');
    expect(create.mock.calls[1][1][0]).not.toHaveProperty('color');
  });

  test.each([13, 14])('generation %i: scene mismatch and bad inputs return null', async (generation) => {
    global.game.release = { generation };
    const create = templateScene({ sceneId: 'scene-2' });
    expect(await createMeasuredTemplate({
      shape: 'burst', feet: 20, x: 1, y: 2, sceneId: 'scene-1',
    })).toBeNull();

    const create2 = templateScene(); // matching scene again
    expect(await createMeasuredTemplate({ shape: 'cone', feet: 20, x: 1, y: 2 })).toBeNull();
    expect(await createMeasuredTemplate({ shape: 'burst', feet: 0, x: 1, y: 2 })).toBeNull();
    expect(await createMeasuredTemplate({ shape: 'burst', feet: 20, x: NaN, y: 2 })).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(create2).not.toHaveBeenCalled();
  });
});

// Per-token scene + identity reads (#1744 WS-1). Movement hooks fire for every
// TokenDocument in the world, so "the scene" is a property of the token, not of
// the canvas.
describe('token scene + identity accessors', () => {
  test('a token embedded in another scene reports THAT scene and its grid', () => {
    const scene = makeScene({ id: 'scene-dungeon', gridSize: 50, gridDistance: 10 });
    const token = makeToken({ id: 'tok-a', scene });
    expect(getTokenScene(token)).toBe(scene);
    expect(getSceneGridSize(getTokenScene(token))).toBe(50);
  });

  test('a scene-less token falls back to the active canvas scene and grid', () => {
    const token = makeToken({ id: 'tok-b' });
    expect(getTokenScene(token)).toBe(global.canvas.scene);
    expect(getSceneGridSize(null)).toBe(getGridSize());
  });

  test('a TokenDocument is accepted directly, via its embedding parent', () => {
    const scene = makeScene({ id: 'scene-cave' });
    const token = makeToken({ id: 'tok-c', scene });
    expect(getTokenScene(token.document)).toBe(scene);
  });

  test('hidden + name read off either a placed token or its document', () => {
    const token = makeToken({ id: 'tok-d', hidden: true, name: 'Ambusher' });
    expect(isTokenHidden(token)).toBe(true);
    expect(isTokenHidden(token.document)).toBe(true);
    expect(getTokenName(token)).toBe('Ambusher');
    expect(isTokenHidden(makeToken({ id: 'tok-e' }))).toBe(false);
  });

  test('a nameless token falls back to its actor\'s name, then to empty', () => {
    const actor = makeActor({ id: 'actor-x', name: 'Goblin Warrior' });
    const token = makeToken({ id: 'tok-f', actor });
    expect(getTokenName(token)).toBe('Goblin Warrior');
    expect(getTokenName(null)).toBe('');
  });

  test('grid distance defaults to 5 ft per square', () => {
    expect(getGridDistance()).toBe(5);
    global.canvas.scene.grid.distance = 10;
    expect(getGridDistance()).toBe(10);
    global.canvas.scene.grid.distance = 0;
    expect(getGridDistance()).toBe(5);
  });

  test('pixelsToGrid takes an explicit grid size for off-canvas scenes', () => {
    expect(pixelsToGrid(250, 250)).toEqual({ col: 3, row: 3 });   // active 100px grid
    expect(pixelsToGrid(250, 250, 50)).toEqual({ col: 5, row: 5 });
    expect(pixelsToGrid(250, 250, 0)).toEqual({ col: 3, row: 3 }); // bad size → active
  });
});

// The mover-centered capture rect (#1744 WS-2, epic OQ-5).
describe('moverCaptureRect', () => {
  test('centres on the token and extends radiusFeet in every direction', () => {
    const token = makeToken({ id: 'tok-a', x: 1000, y: 1000 });
    global.canvas.dimensions = { width: 4000, height: 3000 };
    // 1x1 token on a 100px/5ft grid → centre (1050,1050); 25 ft = 500 px.
    expect(moverCaptureRect(token, 25)).toEqual({ x1: 550, y1: 550, x2: 1550, y2: 1550 });
  });

  test('a Large token centres on its whole footprint', () => {
    const token = makeToken({ id: 'tok-big', x: 1000, y: 1000, width: 2, height: 2 });
    global.canvas.dimensions = { width: 4000, height: 3000 };
    expect(moverCaptureRect(token, 25)).toEqual({ x1: 600, y1: 600, x2: 1600, y2: 1600 });
  });

  test('clamps to canvas.dimensions.rect, padding band included', () => {
    const token = makeToken({ id: 'tok-a', x: 0, y: 0 });
    global.canvas.dimensions = { rect: { x: -200, y: -200, width: 4400, height: 3400 } };
    expect(moverCaptureRect(token, 25)).toEqual({ x1: -200, y1: -200, x2: 550, y2: 550 });
  });

  test('does not clamp when the canvas reports no dimensions at all', () => {
    const token = makeToken({ id: 'tok-a', x: 0, y: 0 });
    delete global.canvas.dimensions;
    expect(getCanvasBoundsRect()).toBeNull();
    expect(moverCaptureRect(token, 25)).toEqual({ x1: -450, y1: -450, x2: 550, y2: 550 });
  });

  test('a token on a scene the canvas is not showing has no capturable rect', () => {
    const token = makeToken({ id: 'tok-a', x: 1000, y: 1000, scene: makeScene({ id: 'elsewhere' }) });
    expect(moverCaptureRect(token, 25)).toBeNull();
  });

  test('a non-positive radius, a missing token, or a non-finite position → null', () => {
    const token = makeToken({ id: 'tok-a', x: 1000, y: 1000 });
    expect(moverCaptureRect(token, 0)).toBeNull();
    expect(moverCaptureRect(null, 25)).toBeNull();
    token.x = undefined;
    token.document.x = 'over-there';
    expect(moverCaptureRect(token, 25)).toBeNull();
  });

  test('a rect clamped out of existence returns null rather than an empty capture', () => {
    const token = makeToken({ id: 'tok-a', x: 5000, y: 5000 });
    global.canvas.dimensions = { width: 1000, height: 1000 };
    expect(moverCaptureRect(token, 25)).toBeNull();
  });
});
