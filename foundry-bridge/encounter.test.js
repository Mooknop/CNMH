// Encounter module unit tests — combat hooks → encounter payload, turn command.
// Runs against the mocked adapter/globals (test/setup.js). Version-independent:
// all Foundry reads go through pf2eAdapter.

import {
  initEncounter, handleTurnCommand, handleInitCommit, updateActorMap, getActorMap,
} from './encounter.js';
import { makeCombat, makeCombatant, makeActor } from './test/foundryMock.js';

let send;

function init() {
  send = jest.fn();
  updateActorMap({});       // reset module-level actor map between tests
  initEncounter(send);      // registers hooks on the fresh Hooks from setup.js
}

beforeEach(init);

// Goblin (init 22) and Pellias (init 18); Pellias is mapped to a PC.
function combatWithGoblinAndPellias({ activeTurnIndex = 0, ...rest } = {}) {
  const pellias = makeCombatant({ id: 'cbt-pellias', name: 'Pellias', actorId: 'actor-pellias', initiative: 18 });
  const goblin  = makeCombatant({ id: 'cbt-goblin',  name: 'Goblin',  actorId: 'actor-goblin',  initiative: 22 });
  return makeCombat({ id: 'combat1', combatants: [pellias, goblin], activeTurnIndex, ...rest });
}

describe('actor map', () => {
  test('updateActorMap / getActorMap round-trip; null resets to {}', () => {
    updateActorMap({ 'actor-pellias': 'Pellias' });
    expect(getActorMap()).toEqual({ 'actor-pellias': 'Pellias' });
    updateActorMap(null);
    expect(getActorMap()).toEqual({});
  });
});

describe('encounter payload push', () => {
  test('createCombat pushes a sorted encounter to global/encounter', () => {
    updateActorMap({ 'actor-pellias': 'Pellias' });
    const combat = combatWithGoblinAndPellias({ activeTurnIndex: 0 });

    global.Hooks.fire('createCombat', combat);

    expect(send).toHaveBeenCalledTimes(1);
    const [characterId, key, payload] = send.mock.calls[0];
    expect(characterId).toBe('global');
    expect(key).toBe('encounter');

    // Sorted by initiative desc: Goblin (22) then Pellias (18).
    expect(payload.order.map((e) => e.name)).toEqual(['Goblin', 'Pellias']);
    expect(payload.phase).toBe('in-progress');
    expect(payload.round).toBe(1);
    expect(payload.foundryCombatId).toBe('combat1');
  });

  test('mapped combatant is a pc with charId; unmapped is an enemy', () => {
    updateActorMap({ 'actor-pellias': 'Pellias' });
    global.Hooks.fire('createCombat', combatWithGoblinAndPellias());

    const { order } = send.mock.calls[0][2];
    const goblin = order.find((e) => e.name === 'Goblin');
    const pellias = order.find((e) => e.name === 'Pellias');
    expect(goblin.kind).toBe('enemy');
    expect(goblin.charId).toBeUndefined();
    expect(pellias.kind).toBe('pc');
    expect(pellias.charId).toBe('Pellias');
  });

  test('enemy combatant entry includes defenses when an actor is present', () => {
    const goblinActor = makeActor({ id: 'actor-goblin' });
    goblinActor.system.attributes.ac = { value: 15 };
    goblinActor.system.saves = { fortitude: { value: 8 }, reflex: { value: 5 }, will: { value: 3 } };
    goblinActor.system.attributes.immunities  = [];
    goblinActor.system.attributes.resistances = [];
    goblinActor.system.attributes.weaknesses  = [];
    global.game.actors.set('actor-goblin', goblinActor);

    global.Hooks.fire('createCombat', combatWithGoblinAndPellias());

    const { order } = send.mock.calls[0][2];
    const goblin = order.find((e) => e.name === 'Goblin');
    expect(goblin.defenses).toEqual({
      ac: 15,
      saves: { fortitude: 8, reflex: 5, will: 3 },
      immunities: [], resistances: [], weaknesses: [],
    });
  });

  test('combatant entry without an actor omits defenses', () => {
    // Pellias has an actor; Goblin has no actor in game.actors in this test variant.
    global.Hooks.fire('createCombat', combatWithGoblinAndPellias());

    const { order } = send.mock.calls[0][2];
    const goblin = order.find((e) => e.name === 'Goblin');
    expect(goblin.defenses).toBeUndefined();
  });

  test('enemy entry includes bestiary when an actor is present', () => {
    const goblinActor = makeActor({
      id: 'actor-goblin',
      img: 'tokens/goblin.webp',
      level: 1,
      rarity: 'common',
      traits: ['goblin', 'humanoid'],
      perception: 5,
      publicNotes: '<p>A goblin.</p>',
    });
    global.game.actors.set('actor-goblin', goblinActor);

    global.Hooks.fire('createCombat', combatWithGoblinAndPellias());

    const { order } = send.mock.calls[0][2];
    const goblin = order.find((e) => e.name === 'Goblin');
    expect(goblin.bestiary).toBeDefined();
    expect(goblin.bestiary.level).toBe(1);
    expect(goblin.bestiary.rarity).toBe('common');
    // Token image is resolved asynchronously (#394). With no window/fetch in the
    // test env the raw Foundry-relative path is never leaked — img is null until
    // a stable app URL is uploaded (covered in tokenImages.test.js).
    expect(goblin.bestiary.img).toBeNull();
    expect(goblin.bestiary.description).toBe('A goblin.');
  });

  test('resolves the enemy token image and re-pushes with the stable URL', async () => {
    global.window = { location: { origin: 'https://foundry.example' } };
    global.fetch = jest.fn()
      // GET the token bytes from Foundry (same origin as the bridge).
      .mockResolvedValueOnce({ ok: true, blob: async () => ({ type: 'image/webp', size: 1234 }) })
      // POST to the Worker's bridge-image endpoint → stable app URL.
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'tok_abc.webp', url: '/api/images/tok_abc.webp' }) });

    try {
      const goblinActor = makeActor({ id: 'actor-goblin', img: 'tokens/goblin.webp', level: 1 });
      global.game.actors.set('actor-goblin', goblinActor);

      // Register the combat so the post-upload re-push can resolve the live combat.
      const combat = combatWithGoblinAndPellias();
      global.game.combat = combat;
      global.Hooks.fire('createCombat', combat);

      // First push happens synchronously with img unresolved.
      expect(send.mock.calls[0][2].order.find((e) => e.name === 'Goblin').bestiary.img).toBeNull();

      // Let the async fetch → upload → re-push chain settle.
      await new Promise((res) => setTimeout(res, 0));

      // The Worker upload URL carried the secret and a derived name.
      const uploadCall = global.fetch.mock.calls.find(([u]) => String(u).includes('/api/bridge/image'));
      expect(uploadCall).toBeDefined();
      expect(uploadCall[0]).toContain('name=goblin');
      expect(uploadCall[1]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'image/webp' } });

      // The re-push carries the resolved stable URL.
      const last = send.mock.calls[send.mock.calls.length - 1][2];
      expect(last.order.find((e) => e.name === 'Goblin').bestiary.img).toBe('/api/images/tok_abc.webp');
    } finally {
      delete global.window;
      delete global.fetch;
    }
  });

  test('enemy entry includes a top-level creatureKey', () => {
    const goblinActor = makeActor({
      id: 'actor-goblin',
      name: 'Goblin',
      level: 1,
      compendiumSource: 'Compendium.pf2e.bestiary.Actor.gob',
    });
    global.game.actors.set('actor-goblin', goblinActor);

    global.Hooks.fire('createCombat', combatWithGoblinAndPellias());

    const { order } = send.mock.calls[0][2];
    const goblin = order.find((e) => e.name === 'Goblin');
    expect(goblin.creatureKey).toBe('Compendium.pf2e.bestiary.Actor.gob');
  });

  test('PC entry does not include bestiary or creatureKey even when an actor is present', () => {
    updateActorMap({ 'actor-pellias': 'Pellias' });
    const pelliasActor = makeActor({ id: 'actor-pellias', level: 5 });
    global.game.actors.set('actor-pellias', pelliasActor);

    global.Hooks.fire('createCombat', combatWithGoblinAndPellias());

    const { order } = send.mock.calls[0][2];
    const pellias = order.find((e) => e.name === 'Pellias');
    expect(pellias.kind).toBe('pc');
    expect(pellias.bestiary).toBeUndefined();
    expect(pellias.creatureKey).toBeUndefined();
  });

  test('enemy entry without an actor omits bestiary', () => {
    global.Hooks.fire('createCombat', combatWithGoblinAndPellias());

    const { order } = send.mock.calls[0][2];
    const goblin = order.find((e) => e.name === 'Goblin');
    expect(goblin.bestiary).toBeUndefined();
  });

  test('currentTurnIndex maps the active combatant into the sorted order', () => {
    // Pellias is combatants[0] but sorts second by initiative; make him active.
    global.Hooks.fire('createCombat', combatWithGoblinAndPellias({ activeTurnIndex: 0 }));
    const { currentTurnIndex, order } = send.mock.calls[0][2];
    expect(order[currentTurnIndex].name).toBe('Pellias');
  });

  test('phase reflects combat lifecycle', () => {
    global.Hooks.fire('createCombat', makeCombat({ active: true, started: false, round: 0, combatants: [] }));
    expect(send.mock.calls[0][2].phase).toBe('setup');

    send.mockClear();
    global.Hooks.fire('createCombat', makeCombat({ active: false, started: true, round: 3, combatants: [] }));
    expect(send.mock.calls[0][2].phase).toBe('ended');
  });

  test('deleteCombat pushes idle state', () => {
    global.Hooks.fire('deleteCombat', makeCombat());
    const [characterId, key, payload] = send.mock.calls.at(-1);
    expect(characterId).toBe('global');
    expect(key).toBe('encounter');
    expect(payload).toMatchObject({ active: false, phase: 'idle', order: [], foundryCombatId: null });
  });

  test('updateCombat with the bridge echo flag does not re-push', () => {
    const combat = combatWithGoblinAndPellias();
    global.Hooks.fire('updateCombat', combat, {}, { _bridgeUpdate: true });
    expect(send).not.toHaveBeenCalled();
  });

  test('createCombatant re-pushes via its combat', () => {
    const combat = combatWithGoblinAndPellias();
    const combatant = makeCombatant({ combat });
    global.Hooks.fire('createCombatant', combatant);
    expect(send).toHaveBeenCalledWith('global', 'encounter', expect.objectContaining({ foundryCombatId: 'combat1' }));
  });
});

describe('handleTurnCommand', () => {
  test('next-turn advances the active combat', async () => {
    const combat = combatWithGoblinAndPellias();
    global.game.combat = combat;
    await handleTurnCommand({ action: 'next-turn' });
    expect(combat.nextTurn).toHaveBeenCalledTimes(1);
  });

  test('prefers the stored combat id over the active combat', async () => {
    const stored = combatWithGoblinAndPellias();
    global.Hooks.fire('createCombat', stored);     // sets _activeCombatId = combat1
    global.game.combats.set('combat1', stored);
    global.game.combat = makeCombat({ id: 'other' }); // different active combat
    await handleTurnCommand({ action: 'next-turn' });
    expect(stored.nextTurn).toHaveBeenCalledTimes(1);
  });

  test('ignores non next-turn actions', async () => {
    const combat = combatWithGoblinAndPellias();
    global.game.combat = combat;
    await handleTurnCommand({ action: 'something-else' });
    expect(combat.nextTurn).not.toHaveBeenCalled();
  });

  test('no-op when there is no combat', async () => {
    global.game.combat = null;
    await expect(handleTurnCommand({ action: 'next-turn' })).resolves.toBeUndefined();
  });
});

describe('handleInitCommit', () => {
  // A fresh setup-phase combat (active, not yet started) ready to receive inits.
  function setupCombat() {
    const combat = combatWithGoblinAndPellias({ started: false });
    global.game.combat = combat;
    return combat;
  }

  test('batches PC initiatives, rolls NPCs, then starts combat — in order', async () => {
    const combat = setupCombat();
    const calls = [];
    combat.setMultipleInitiatives.mockImplementation((inits) => { calls.push(['setMultipleInitiatives', inits]); return Promise.resolve(); });
    combat.rollNPC.mockImplementation(() => { calls.push(['rollNPC']); return Promise.resolve(combat); });
    combat.startCombat.mockImplementation(() => { calls.push(['startCombat']); return Promise.resolve(combat); });

    await handleInitCommit({
      rolls: [
        { entryId: 'cbt-pellias', initiative: 18 },
        { entryId: 'cbt-vask', initiative: 14 },
      ],
      rollNpcs: true,
    });

    expect(calls).toEqual([
      ['setMultipleInitiatives', [
        { id: 'cbt-pellias', value: 18 },
        { id: 'cbt-vask', value: 14 },
      ]],
      ['rollNPC'],
      ['startCombat'],
    ]);
  });

  test('passes a per-roll statistic through to SetInitiativeData when present', async () => {
    const combat = setupCombat();
    await handleInitCommit({ rolls: [{ entryId: 'cbt-pellias', initiative: 18, statistic: 'stealth' }], rollNpcs: false });
    expect(combat.setMultipleInitiatives).toHaveBeenCalledWith([
      { id: 'cbt-pellias', value: 18, statistic: 'stealth' },
    ]);
  });

  test('rollNpcs: false skips the NPC roll', async () => {
    const combat = setupCombat();
    await handleInitCommit({ rolls: [{ entryId: 'cbt-pellias', initiative: 18 }], rollNpcs: false });
    expect(combat.setMultipleInitiatives).toHaveBeenCalledWith([{ id: 'cbt-pellias', value: 18 }]);
    expect(combat.rollNPC).not.toHaveBeenCalled();
    expect(combat.startCombat).toHaveBeenCalledTimes(1);
  });

  test('idempotent — no-op when combat is already started', async () => {
    const combat = combatWithGoblinAndPellias({ started: true });
    global.game.combat = combat;
    await handleInitCommit({ rolls: [{ entryId: 'cbt-pellias', initiative: 18 }], rollNpcs: true });
    expect(combat.setMultipleInitiatives).not.toHaveBeenCalled();
    expect(combat.rollNPC).not.toHaveBeenCalled();
    expect(combat.startCombat).not.toHaveBeenCalled();
  });

  test('no-op when there is no active combat', async () => {
    global.game.combat = null;
    await expect(handleInitCommit({ rolls: [], rollNpcs: true })).resolves.toBeUndefined();
  });

  test('skips entries with a missing id or non-numeric initiative', async () => {
    const combat = setupCombat();
    await handleInitCommit({
      rolls: [
        { entryId: 'cbt-pellias', initiative: 18 },
        { entryId: '', initiative: 5 },
        { entryId: 'cbt-x', initiative: undefined },
      ],
      rollNpcs: false,
    });
    expect(combat.setMultipleInitiatives).toHaveBeenCalledWith([{ id: 'cbt-pellias', value: 18 }]);
    expect(combat.startCombat).toHaveBeenCalledTimes(1);
  });

  test('no rolls → still rolls NPCs and starts (the GM "start anyway" path)', async () => {
    const combat = setupCombat();
    await handleInitCommit({ rolls: [], rollNpcs: true });
    expect(combat.setMultipleInitiatives).not.toHaveBeenCalled();
    expect(combat.rollNPC).toHaveBeenCalledTimes(1);
    expect(combat.startCombat).toHaveBeenCalledTimes(1);
  });
});
