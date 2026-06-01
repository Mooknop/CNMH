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
  getGridSize, getAllTokens, getTokenDimensions,
  getTokenGridPosition, gridToPixels, measureMoveCost, hasWallCollision, moveToken,
  getTokenById, resolveCombatantToken, setUserTargets, checkFlanking,
} from './pf2eAdapter.js';
import {
  hydrateActorFixture, hydrateCombatFixture, makeActor, makeToken,
  makeCombat, makeCombatant,
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

  test('moveToken writes x/y tagged + animated', () => {
    const token = makeToken();
    moveToken(token, 250, 400);
    expect(token.document.update).toHaveBeenCalledWith(
      { x: 250, y: 400 },
      { [BRIDGE_SOURCE_FLAG]: 'app', animate: true },
    );
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
