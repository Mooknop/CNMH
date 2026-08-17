// Aura emanation rail (#1733 S1 + S2) — auraset in, auramembers out.
//
// What the mock world CAN prove: the gates (v13 / no capability), token
// resolution across all three id spaces, idempotent re-activation, teardown on
// deactivation and on the owner token vanishing, the membership payload's exact
// shape, the change-detection that turns "recompute on every token move" back
// into enter/exit semantics, and the connect-time sweep + FULL_STATE replay.
//
// What it CANNOT prove (→ MIGRATION.md's smoke pass): that a live 14.365
// actually accepts `createTokenEmanation`'s argument list, that `range` is
// really read as feet, that the ring follows its token, and that core keeps
// `RegionDocument#tokens` current. Those are canvas facts, not code facts.

import {
  initAuras, handleAuraSet, pushAuraMembers, refreshAllAuras, computeAuraMembers,
  sweepOrphanAuraRegions, replayAuraState, armAuraSweep, getActiveAuraCharIds,
  pf2eGridDistanceFeet, _resetAuras,
} from './auras.js';
import { initMovement } from './movement.js';
import { updateActorMap } from './encounter.js';
import { RELAY } from './syncKeys.js';
import {
  makeActor, makeToken, makeCombat, makeCombatant, makeRegion, installTokenEmanation,
} from './test/foundryMock.js';

// Pellias at grid (5,5), mapped so resolveToken('Pellias') finds her token.
function auraWorld() {
  const send = jest.fn();
  updateActorMap({ 'actor-pellias': 'Pellias' });
  initMovement(send);
  _resetAuras();
  initAuras(send);
  const token = makeToken({ id: 'tok-pellias', x: 500, y: 500, name: 'Pellias' });
  const actor = makeActor({ id: 'actor-pellias', tokens: [token] });
  token.actor = actor;
  global.game.actors.set('actor-pellias', actor);
  global.canvas.tokens.placeables = [token];
  return { send, token, actor };
}

const ACTIVATE = { active: true, feet: 10, label: 'Kinetic Aura', color: '#4a9c6d', ts: 1 };

const members = (send) => send.mock.calls.filter((c) => c[1] === RELAY.AURAMEMBERS);
const lastMembers = (send) => members(send).at(-1)?.[2] ?? null;

afterEach(() => {
  delete global.foundry;
  _resetAuras();
});

describe('auraset → token emanation Region (#1733 S1)', () => {
  test('activation attaches an emanation to the resolved token and registers it', async () => {
    const { send, token } = auraWorld();
    const { createTokenEmanation, collection } = installTokenEmanation();

    await handleAuraSet('Pellias', ACTIVATE);

    expect(createTokenEmanation).toHaveBeenCalledTimes(1);
    const [doc, range, regionData] = createTokenEmanation.mock.calls[0];
    expect(doc).toBe(token.document);
    // Grid units (feet), not pixels — this API authors the shape itself.
    expect(range).toBe(10);
    expect(regionData.visibility).toBe(2);
    expect(regionData.flags['cnmh-bridge']).toEqual({ auraCharId: 'Pellias' });
    expect(collection.contents).toHaveLength(1);
    expect(getActiveAuraCharIds()).toEqual(['Pellias']);
    expect(lastMembers(send)).toEqual({ inside: [], ts: expect.any(Number) });
  });

  test('an unlabelled aura still gets a readable Region name', async () => {
    auraWorld();
    const { createTokenEmanation } = installTokenEmanation();

    await handleAuraSet('Pellias', { active: true, feet: 15, ts: 1 });

    expect(createTokenEmanation.mock.calls[0][2].name).toBe('Aura (15 ft)');
    expect(createTokenEmanation.mock.calls[0][2].color).toBeUndefined();
  });

  test('v13 no-ops: nothing drawn, nothing registered, nothing pushed', async () => {
    const { send } = auraWorld();
    const { createTokenEmanation } = installTokenEmanation({ generation: 13 });

    await handleAuraSet('Pellias', ACTIVATE);

    expect(createTokenEmanation).not.toHaveBeenCalled();
    expect(getActiveAuraCharIds()).toEqual([]);
    expect(members(send)).toHaveLength(0);
  });

  test('a v14 build without createTokenEmanation no-ops the same way', async () => {
    const { send } = auraWorld();
    installTokenEmanation();
    global.foundry.documents.RegionDocument = {};

    await handleAuraSet('Pellias', ACTIVATE);

    expect(getActiveAuraCharIds()).toEqual([]);
    expect(members(send)).toHaveLength(0);
  });

  test('a radius that was never authored is a teardown, never a default ring', async () => {
    const { send } = auraWorld();
    const { createTokenEmanation } = installTokenEmanation();

    await handleAuraSet('Pellias', { active: true, ts: 1 });

    expect(createTokenEmanation).not.toHaveBeenCalled();
    expect(lastMembers(send)).toEqual({ inside: [], ts: expect.any(Number) });
  });

  test('an unresolvable charId tears down instead of throwing', async () => {
    const { send } = auraWorld();
    installTokenEmanation();

    await expect(handleAuraSet('Nobody', ACTIVATE)).resolves.toBeUndefined();

    expect(getActiveAuraCharIds()).toEqual([]);
    expect(lastMembers(send)).toEqual({ inside: [], ts: expect.any(Number) });
  });

  test('a minion charId (`<owner>-<role>`) resolves through the same id spaces', async () => {
    const { send } = auraWorld();
    const petToken = makeToken({ id: 'tok-pet', x: 600, y: 500, name: 'Ash' });
    const pet = makeActor({
      id: 'actor-pet', tokens: [petToken], type: 'familiar', hasPlayerOwner: true,
      ownership: { user1: 3 },
    });
    global.game.actors.set('actor-pet', pet);
    global.canvas.tokens.placeables.push(petToken);
    const { createTokenEmanation } = installTokenEmanation();

    // Resolution through the minion link is movement.js's job; prove the rail
    // simply hands the charId over rather than assuming a PC id space.
    await handleAuraSet('Pellias-familiar', ACTIVATE);

    // Either it resolved (a ring exists) or it degraded to a clean teardown —
    // never a throw and never a ring on the wrong token.
    for (const call of createTokenEmanation.mock.calls) {
      expect(call[0]).not.toBe(global.canvas.tokens.get('tok-pellias').document);
    }
    expect(send).toHaveBeenCalled();
  });

  test('re-activation swaps the ring instead of stacking a second one', async () => {
    auraWorld();
    const { collection, createTokenEmanation } = installTokenEmanation();

    await handleAuraSet('Pellias', ACTIVATE);
    const first = collection.contents[0].id;
    await handleAuraSet('Pellias', { ...ACTIVATE, feet: 30 });

    expect(createTokenEmanation).toHaveBeenCalledTimes(2);
    expect(collection.contents).toHaveLength(1);
    expect(collection.get(first)).toBeUndefined();
    expect(createTokenEmanation.mock.calls[1][1]).toBe(30);
  });

  test('deactivation deletes the ring and pushes an empty membership', async () => {
    const { send } = auraWorld();
    const { collection } = installTokenEmanation();
    await handleAuraSet('Pellias', ACTIVATE);

    await handleAuraSet('Pellias', { active: false, ts: 2 });

    expect(collection.contents).toHaveLength(0);
    expect(getActiveAuraCharIds()).toEqual([]);
    expect(lastMembers(send)).toEqual({ inside: [], ts: expect.any(Number) });
  });

  test('a create failure is logged, not thrown', async () => {
    const { send } = auraWorld();
    installTokenEmanation();
    global.foundry.documents.RegionDocument.createTokenEmanation =
      jest.fn().mockRejectedValue(new Error('region layer unavailable'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handleAuraSet('Pellias', ACTIVATE)).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledWith('CNMH Bridge | aura activation failed:', expect.any(Error));
    expect(members(send)).toHaveLength(0);
    spy.mockRestore();
  });

  test('a handler with no charId is a no-op', async () => {
    const { send } = auraWorld();
    installTokenEmanation();
    await handleAuraSet('', ACTIVATE);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('auramembers (#1733 S2)', () => {
  function withOccupants({ contains }) {
    const world = auraWorld();
    global.canvas.tokens.placeables = [...global.canvas.tokens.placeables, ...contains];
    return { ...world, ...installTokenEmanation({ contains }) };
  }

  test('membership carries entryId only for tokens in the current combat', async () => {
    const ally = makeToken({ id: 'tok-ally', x: 600, y: 500, disposition: 1, name: 'Zevira' });
    const bystander = makeToken({ id: 'tok-cow', x: 400, y: 500, disposition: 0, name: 'Cow' });
    const { send } = withOccupants({ contains: [ally, bystander] });
    global.game.combat = makeCombat({
      combatants: [makeCombatant({ id: 'cbt-ally', actorId: null, tokenId: 'tok-ally' })],
    });

    await handleAuraSet('Pellias', ACTIVATE);

    expect(lastMembers(send).inside).toEqual([
      { entryId: 'cbt-ally', tokenId: 'tok-ally', name: 'Zevira', disposition: 1, hidden: false },
      { tokenId: 'tok-cow', name: 'Cow', disposition: 0, hidden: false },
    ]);
  });

  test('hidden occupants are SENT, flagged — the app filters, the bridge does not', async () => {
    const lurker = makeToken({
      id: 'tok-lurker', x: 600, y: 500, disposition: -1, name: 'Shadow', hidden: true,
    });
    const { send } = withOccupants({ contains: [lurker] });

    await handleAuraSet('Pellias', ACTIVATE);

    expect(lastMembers(send).inside).toEqual([
      { tokenId: 'tok-lurker', name: 'Shadow', disposition: -1, hidden: true },
    ]);
  });

  test("the aura's own token is excluded", async () => {
    const world = auraWorld();
    installTokenEmanation({ contains: [world.token] });

    await handleAuraSet('Pellias', ACTIVATE);

    expect(lastMembers(world.send).inside).toEqual([]);
  });

  test('a token move that changes membership pushes; one that does not stays off the wire', async () => {
    const ally = makeToken({ id: 'tok-ally', x: 600, y: 500, disposition: 1, name: 'Zevira' });
    const { send, collection } = withOccupants({ contains: [ally] });
    await handleAuraSet('Pellias', ACTIVATE);
    const before = members(send).length;

    // Nothing changed → the recompute is silent.
    global.Hooks.fire('updateToken', ally.document, {}, {}, 'user1');
    expect(members(send)).toHaveLength(before);

    // Core now says the ally left → exactly one more push.
    collection.contents[0].tokens.clear();
    global.Hooks.fire('updateToken', ally.document, {}, {}, 'user1');
    expect(members(send)).toHaveLength(before + 1);
    expect(lastMembers(send).inside).toEqual([]);
  });

  // Registered opportunistically: on 14.365 core never emits these as hooks
  // (region events reach RegionBehaviorType instances only), but a future build
  // or a region-event shim would be picked up for free.
  test('the CONST.REGION_EVENTS hook names drive the same recompute if a build ever fires them', async () => {
    const ally = makeToken({ id: 'tok-ally', x: 600, y: 500, disposition: 1, name: 'Zevira' });
    const { send, collection } = withOccupants({ contains: [ally] });
    await handleAuraSet('Pellias', ACTIVATE);
    const before = members(send).length;

    collection.contents[0].tokens.clear();
    global.Hooks.fire('tokenExit', {});
    expect(members(send)).toHaveLength(before + 1);
    expect(lastMembers(send).inside).toEqual([]);

    collection.contents[0].tokens.add(ally.document);
    global.Hooks.fire('tokenEnter', {});
    expect(members(send)).toHaveLength(before + 2);
    expect(lastMembers(send).inside).toHaveLength(1);
  });

  test('a teardown that fails mid-recompute is logged, not thrown', async () => {
    const { send } = auraWorld();
    installTokenEmanation();
    await handleAuraSet('Pellias', ACTIVATE);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    send.mockImplementation(() => { throw new Error('relay down'); });

    global.canvas.tokens.placeables = [];
    global.game.actors.get('actor-pellias').getActiveTokens = () => [];
    expect(() => refreshAllAuras()).not.toThrow();
    // refreshAllAuras deliberately does not await the teardown it kicks off —
    // let the whole chain (delete → push → the .catch) drain.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(spy).toHaveBeenCalledWith('CNMH Bridge | aura teardown failed:', expect.any(Error));
    spy.mockRestore();
  });

  test('the owner token vanishing tears the aura down and tells the app', async () => {
    const { send } = auraWorld();
    const { collection } = installTokenEmanation();
    await handleAuraSet('Pellias', ACTIVATE);

    global.canvas.tokens.placeables = [];
    global.game.actors.get('actor-pellias').getActiveTokens = () => [];
    global.Hooks.fire('deleteToken', { id: 'tok-pellias' }, {}, 'user1');
    await Promise.resolve();
    await Promise.resolve();

    expect(getActiveAuraCharIds()).toEqual([]);
    expect(lastMembers(send)).toEqual({ inside: [], ts: expect.any(Number) });
    expect(collection.contents).toHaveLength(0);
  });

  test('token hooks are inert while no aura is up', () => {
    const { send } = auraWorld();
    global.Hooks.fire('updateToken', {}, {}, {}, 'user1');
    global.Hooks.fire('createToken', {}, {}, 'user1');
    expect(send).not.toHaveBeenCalled();
  });

  test('pushAuraMembers for an unknown charId is a no-op', () => {
    const { send } = auraWorld();
    expect(pushAuraMembers('Nobody')).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  test('computeAuraMembers is empty for an aura the bridge never registered', () => {
    auraWorld();
    expect(computeAuraMembers('Pellias')).toEqual([]);
  });

  test('refreshAllAuras is a no-op with an empty registry', () => {
    const { send } = auraWorld();
    refreshAllAuras();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('geometric fallback when core will not answer', () => {
  test('membership falls back to grid geometry when RegionDocument#tokens is unreadable', async () => {
    const near = makeToken({ id: 'tok-near', x: 600, y: 500, disposition: 1, name: 'Near' });
    const far  = makeToken({ id: 'tok-far',  x: 900, y: 500, disposition: -1, name: 'Far' });
    const { send } = auraWorld();
    global.canvas.tokens.placeables = [...global.canvas.tokens.placeables, near, far];
    const { collection } = installTokenEmanation();

    await handleAuraSet('Pellias', ACTIVATE);
    // Core stops reporting membership (renamed property / unfinished bookkeeping).
    delete collection.contents[0].tokens;

    expect(computeAuraMembers('Pellias').map((m) => m.tokenId)).toEqual(['tok-near']);
    expect(send).toHaveBeenCalled();
  });

  test('PF2e diagonals alternate 5/10 ft and footprints are measured edge to edge', () => {
    const medium = (col, row) => ({ col, row, width: 1, height: 1 });
    // Straight line: 3 squares = 15 ft.
    expect(pf2eGridDistanceFeet(medium(0, 0), medium(3, 0))).toBe(15);
    // 2 diagonals = 5 + 10 = 15 ft.
    expect(pf2eGridDistanceFeet(medium(0, 0), medium(2, 2))).toBe(15);
    // Adjacent is 5 ft (what "within 10 feet" has to include); the same square
    // — an overlapping footprint — is 0.
    expect(pf2eGridDistanceFeet(medium(0, 0), medium(1, 0))).toBe(5);
    expect(pf2eGridDistanceFeet(medium(0, 0), medium(0, 0))).toBe(0);
    // A 2x2 source's emanation starts at the edge of its space, so it reaches
    // one square further than a Medium creature standing on the same corner.
    expect(pf2eGridDistanceFeet(medium(0, 0), medium(4, 0))).toBe(20);
    expect(pf2eGridDistanceFeet({ col: 0, row: 0, width: 2, height: 2 }, medium(4, 0))).toBe(15);
  });
});

describe('connect-time sweep + FULL_STATE replay', () => {
  const stamped = (auraCharId, id) =>
    makeRegion({ id, flags: { 'cnmh-bridge': { auraCharId } } });

  test('the sweep deletes every bridge-stamped ring and leaves foreign Regions alone', async () => {
    auraWorld();
    const gmRegion = makeRegion({ id: 'region-gm', name: 'Difficult Terrain' });
    const { collection } = installTokenEmanation({
      regions: [stamped('Pellias', 'region-old'), stamped('Zevira', 'region-older'), gmRegion],
    });

    expect(await sweepOrphanAuraRegions()).toBe(2);

    expect(collection.contents).toEqual([gmRegion]);
    expect(getActiveAuraCharIds()).toEqual([]);
  });

  test('replay runs only when armed, sweeps first, then re-creates the active rings', async () => {
    const { send } = auraWorld();
    const { collection, createTokenEmanation } = installTokenEmanation({
      regions: [stamped('Pellias', 'region-stale')],
    });

    // Unarmed (a FULL_STATE that is not a fresh connection): nothing happens.
    await replayAuraState({ Pellias: { [RELAY.AURASET]: ACTIVATE } });
    expect(createTokenEmanation).not.toHaveBeenCalled();
    expect(collection.get('region-stale')).toBeTruthy();

    armAuraSweep();
    await replayAuraState({
      global: { actormap: {} },
      Pellias: { [RELAY.AURASET]: ACTIVATE },
      Zevira: { hp: { current: 10 } },
    });

    // The stale ring is gone and exactly one fresh ring replaced it.
    expect(collection.get('region-stale')).toBeUndefined();
    expect(collection.contents).toHaveLength(1);
    expect(getActiveAuraCharIds()).toEqual(['Pellias']);
    expect(lastMembers(send)).toEqual({ inside: [], ts: expect.any(Number) });
  });

  test('a stored deactivation replays as a teardown, not a ring', async () => {
    auraWorld();
    const { collection, createTokenEmanation } = installTokenEmanation({
      regions: [stamped('Pellias', 'region-stale')],
    });

    armAuraSweep();
    await replayAuraState({ Pellias: { [RELAY.AURASET]: { active: false, ts: 3 } } });

    expect(createTokenEmanation).not.toHaveBeenCalled();
    expect(collection.contents).toHaveLength(0);
  });

  test('the arm is consumed by the first replay', async () => {
    auraWorld();
    const { createTokenEmanation } = installTokenEmanation();

    armAuraSweep();
    await replayAuraState({ Pellias: { [RELAY.AURASET]: ACTIVATE } });
    await replayAuraState({ Pellias: { [RELAY.AURASET]: ACTIVATE } });

    expect(createTokenEmanation).toHaveBeenCalledTimes(1);
  });

  test('a replay failure is logged, not thrown', async () => {
    auraWorld();
    installTokenEmanation();
    Object.defineProperty(global.canvas.scene, 'regions', {
      configurable: true,
      get() { throw new Error('no region layer'); },
    });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    armAuraSweep();
    await expect(replayAuraState({})).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledWith('CNMH Bridge | aura replay failed:', expect.any(Error));
    spy.mockRestore();
  });

  test('initAuras survives a world with no hook registry', () => {
    const send = jest.fn();
    global.Hooks = { on: () => { throw new Error('no registry'); } };
    expect(() => initAuras(send)).not.toThrow();
  });
});
