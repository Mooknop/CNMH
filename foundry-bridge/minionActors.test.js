// Minion ↔ Foundry actor linking + spawn (#362, slice 1).
//
// Covers ownership-derived link derivation (familiar/companion role + owner PC),
// onScene reflecting placed tokens, the push map shape, and the spawn handler
// (creates a token in a free adjacent cell; no-op when already on scene).

import {
  getMinionActorLinks,
  findOpenAdjacentCell,
  createTokenForActor,
} from './pf2eAdapter.js';
import {
  initMinionActors,
  pushMinionActors,
  handleMinionActorsReq,
  handleSpawnMinion,
} from './minionActors.js';
import { updateActorMap } from './encounter.js';
import { makeActor, makeToken, makeGame } from './test/foundryMock.js';
import { BRIDGE_SOURCE_FLAG } from './utils.js';

const GM = { id: 'gm', isGM: true };
const PLAYER = { id: 'player1', isGM: false };
// GM owns everything (OWNER=3); the player owns their PC + minions.
const OWNED = { gm: 3, player1: 3 };

// Ashka (PC), her familiar Lazarus, and her companion Zevira (an NPC actor).
function makeWorld({ zeviraTokens = [], extraActors = [] } = {}) {
  const ashka = makeActor({
    id: 'actor-ashka', name: 'Ashka', type: 'character',
    hasPlayerOwner: true, ownership: OWNED,
  });
  const lazarus = makeActor({
    id: 'actor-laz', name: 'Lazarus', type: 'familiar',
    hasPlayerOwner: true, ownership: OWNED,
  });
  const zevira = makeActor({
    id: 'actor-zev', name: 'Zevira', type: 'npc',
    hasPlayerOwner: true, ownership: OWNED, tokens: zeviraTokens,
  });
  const actors = [ashka, lazarus, zevira, ...extraActors];
  // Rebuild game so the actors/users collections expose .contents (the derivation
  // iterates contents; a bare .set() wouldn't update it).
  global.game = makeGame({ actors, users: [GM, PLAYER] });
  updateActorMap({ 'actor-ashka': 'Ashka' });
  return { ashka, lazarus, zevira };
}

describe('getMinionActorLinks', () => {
  test('derives familiar + companion roles tied to the owning PC', () => {
    makeWorld();
    const links = getMinionActorLinks({ 'actor-ashka': 'Ashka' });

    expect(links).toContainEqual(
      expect.objectContaining({ foundryActorId: 'actor-laz', ownerCharId: 'Ashka', role: 'familiar', name: 'Lazarus', onScene: false })
    );
    expect(links).toContainEqual(
      expect.objectContaining({ foundryActorId: 'actor-zev', ownerCharId: 'Ashka', role: 'companion', name: 'Zevira' })
    );
  });

  test('onScene is true when the minion has a placed token', () => {
    makeWorld({ zeviraTokens: [makeToken({ id: 'tok-zev', x: 0, y: 0 })] });
    const links = getMinionActorLinks({ 'actor-ashka': 'Ashka' });
    const zev = links.find((l) => l.foundryActorId === 'actor-zev');
    expect(zev.onScene).toBe(true);
  });

  test('skips minions whose owning player has no mapped PC', () => {
    makeWorld();
    // Empty actor map → no PC resolves, so no links.
    expect(getMinionActorLinks({})).toEqual([]);
  });

  test("a GM-only-owned NPC is not treated as a player's companion", () => {
    const monster = makeActor({
      id: 'actor-mon', name: 'Goblin', type: 'npc',
      hasPlayerOwner: false, ownership: { gm: 3 },
    });
    makeWorld({ extraActors: [monster] });
    const links = getMinionActorLinks({ 'actor-ashka': 'Ashka' });
    expect(links.find((l) => l.foundryActorId === 'actor-mon')).toBeUndefined();
  });
});

describe('findOpenAdjacentCell', () => {
  test('returns a free neighbouring cell next to the owner', () => {
    // 100px grid; owner at grid (5,5). No other tokens / walls.
    global.canvas.tokens.placeables = [];
    const owner = makeToken({ id: 'tok-owner', x: 500, y: 500 });
    const { x, y } = findOpenAdjacentCell(owner);
    // First scanned neighbour is (4,4) → pixels (400,400).
    expect({ x, y }).toEqual({ x: 400, y: 400 });
  });

  test('skips occupied neighbours', () => {
    const owner = makeToken({ id: 'tok-owner', x: 500, y: 500 });
    const blocker = makeToken({ id: 'tok-b', x: 400, y: 400 }); // grid (4,4)
    global.canvas.tokens.placeables = [owner, blocker];
    const { x, y } = findOpenAdjacentCell(owner);
    expect({ x, y }).not.toEqual({ x: 400, y: 400 });
  });
});

describe('createTokenForActor', () => {
  test("places a token built from the actor's prototype at the given position", async () => {
    const actor = makeActor({ id: 'actor-zev', prototypeToken: { name: 'Zevira', width: 1 } });
    await createTokenForActor(actor, 700, 800);

    expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith(
      'Token',
      [expect.objectContaining({ name: 'Zevira', x: 700, y: 800 })],
      { [BRIDGE_SOURCE_FLAG]: 'app' },
    );
  });
});

describe('minionActors module', () => {
  let send;
  beforeEach(() => {
    send = jest.fn();
    initMinionActors(send);
  });

  test('pushMinionActors emits a map keyed by <ownerCharId>-<role>', () => {
    makeWorld();
    pushMinionActors();

    const [characterId, key, value] = send.mock.calls.at(-1);
    expect(characterId).toBe('global');
    expect(key).toBe('minionactors');
    expect(value['Ashka-familiar']).toEqual(
      expect.objectContaining({ foundryActorId: 'actor-laz', role: 'familiar' })
    );
    expect(value['Ashka-companion']).toEqual(
      expect.objectContaining({ foundryActorId: 'actor-zev', role: 'companion' })
    );
  });

  test('registered Foundry hooks re-push the map on actor/token changes', () => {
    makeWorld();
    for (const hook of ['createActor', 'updateActor', 'deleteActor', 'createToken', 'deleteToken']) {
      send.mockClear();
      global.Hooks.fire(hook);
      expect(send).toHaveBeenCalledWith('global', 'minionactors', expect.any(Object));
    }
  });

  test('handleSpawnMinion ignores a malformed request', async () => {
    makeWorld();
    await handleSpawnMinion(undefined);
    await handleSpawnMinion({ role: 'companion' });
    expect(global.canvas.scene.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test('handleMinionActorsReq re-pushes the map', () => {
    makeWorld();
    send.mockClear();
    handleMinionActorsReq();
    expect(send).toHaveBeenCalledWith('global', 'minionactors', expect.any(Object));
  });

  test('handleSpawnMinion creates the minion token adjacent to its owner', async () => {
    const { ashka } = makeWorld();
    const ownerToken = makeToken({ id: 'tok-ashka', x: 500, y: 500 });
    ashka.getActiveTokens = () => [ownerToken];
    global.canvas.tokens.placeables = [ownerToken];

    await handleSpawnMinion({ ownerCharId: 'Ashka', role: 'companion' });

    expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
    const [, [tokenData]] = global.canvas.scene.createEmbeddedDocuments.mock.calls[0];
    // Adjacent to the owner at grid (5,5).
    expect(Math.abs(tokenData.x - 500)).toBeLessThanOrEqual(100);
    expect(Math.abs(tokenData.y - 500)).toBeLessThanOrEqual(100);
  });

  test('handleSpawnMinion is a no-op when the minion is already on scene', async () => {
    const { ashka } = makeWorld({ zeviraTokens: [makeToken({ id: 'tok-zev', x: 0, y: 0 })] });
    const ownerToken = makeToken({ id: 'tok-ashka', x: 500, y: 500 });
    ashka.getActiveTokens = () => [ownerToken];

    await handleSpawnMinion({ ownerCharId: 'Ashka', role: 'companion' });
    expect(global.canvas.scene.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test('handleSpawnMinion is a no-op when the owner has no token', async () => {
    makeWorld();
    global.canvas.tokens.placeables = [];
    await handleSpawnMinion({ ownerCharId: 'Ashka', role: 'companion' });
    expect(global.canvas.scene.createEmbeddedDocuments).not.toHaveBeenCalled();
  });
});
