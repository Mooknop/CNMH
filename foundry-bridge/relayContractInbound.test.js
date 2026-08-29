// Inbound relay-contract tests (#1749 S1 follow-up) — the app→bridge half of
// the tripwire relayContract.test.js never built.
//
// relayContract.test.js drives each bridge feature module and shape-checks
// what it SENT (bridge→app) against __fixtures__/relay/<channel>.json; the
// app's vitest suite consumes the SAME files. Inbound channels (app→bridge)
// have always been driven with plain inline arguments — nothing recorded a
// payload a rename on the app side could ever fail against.
//
// This file closes that gap for the newest inbound contracts (#1749's
// `action`, plus `moveplan` and `snapreq`, all shipped in the last three
// weeks, plus `templateplace`'s directional payload from #1735 S2 — see
// the __fixtures__/relay/inbound README section in the bridge
// README's Tests section for the full remainder and the update rule).
//
// Each fixture under __fixtures__/relay/inbound/<channel>.json is
// HAND-AUTHORED from the real app producer's emitted shape (there is no
// "record" mode here — there is nothing bridge-side to capture an app
// emission FROM). This file's job is the bridge half of the tripwire: drive
// the real handler with the committed fixture and prove the bridge genuinely
// accepts it — no throw, and the handler's real observable effect fires. The
// app half (src/test/relayInboundContract.test.jsx) drives the real producer
// hook and shape-compares ITS emission against the SAME fixture file (via
// __fixtures__/relay/shape.js's diffShapes, exactly like the outbound rail),
// so a field rename on either side fails a named test on both.

import fs from 'fs';
import path from 'path';

import { handleAction, _resetTargeting } from './targeting.js';
import { initMovement, handleMovePlan } from './movement.js';
import { initGroupMove, handleGroupMoveRequest } from './groupMove.js';
import { initSnapshots, handleSnapshotRequest, handleTemplatePlace } from './snapshots.js';
import { initAuras, handleAuraSet, _resetAuras } from './auras.js';
import { updateActorMap } from './encounter.js';
import { RELAY } from './syncKeys.js';
import {
  makeActor, makeToken, makeCombat, makeCombatant, equipV14Movement,
  installTokenEmanation,
} from './test/foundryMock.js';

const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'relay', 'inbound');

function readFixture(channel) {
  const file = path.join(FIXTURE_DIR, `${channel}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// The same PC token at grid (5,5), speed 10, used by relayContract.test.js's
// movementWorld() — reused here so the `moveplan`/`snapreq` fixtures resolve
// against a familiar, representative world.
function movementWorld() {
  const send = jest.fn();
  updateActorMap({ 'actor-pellias': 'Pellias' });
  initMovement(send);
  const token = makeToken({ id: 'tok-pellias', x: 500, y: 500 });
  const actor = makeActor({ id: 'actor-pellias', speed: 10, tokens: [token] });
  token.actor = actor;
  global.game.actors.set('actor-pellias', actor);
  global.canvas.tokens.placeables = [token];
  return send;
}

describe('inbound relay contract (#1749 S1 follow-up)', () => {
  describe(`${RELAY.ACTION} — foundry-bridge/targeting.js handleAction`, () => {
    test('the committed fixture is accepted: resolves the target and writes the canvas', () => {
      const actor = makeActor({ id: 'actor-pellias', name: 'Pellias' });
      const tokPellias = makeToken({ id: 'tok-pellias', actor });
      const tokGoblin = makeToken({ id: 'tok-goblin' });
      const combat = makeCombat({
        combatants: [
          makeCombatant({ id: 'cbt-pellias', actorId: 'actor-pellias', tokenId: 'tok-pellias' }),
          makeCombatant({ id: 'cbt-goblin', actorId: null, tokenId: 'tok-goblin' }),
        ],
        activeTurnIndex: 0, // Pellias is the active combatant — the fixture's writer.
      });
      global.game.combat = combat;
      global.canvas.tokens.placeables = [tokPellias, tokGoblin];
      updateActorMap({ 'actor-pellias': 'Pellias' });
      _resetTargeting();

      const fixture = readFixture(RELAY.ACTION);

      let resolved;
      expect(() => { resolved = handleAction(fixture.characterId, fixture.value); }).not.toThrow();

      // Observable effect: the fixture's targets resolved to real tokens and
      // reached Foundry's user target set (the ACTIVE-COMBATANT gate, #1749
      // OQ-3, passes for this fixture's charId).
      expect(resolved).toEqual([
        { entryId: 'cbt-goblin', token: tokGoblin, offGuard: false },
      ]);
      expect(global.game.user.updateTokenTargets).toHaveBeenCalledWith(['tok-goblin']);
    });
  });

  describe(`${RELAY.MOVEPLAN} — foundry-bridge/movement.js handleMovePlan`, () => {
    test('the committed fixture is accepted: plans a real route and replies moveplanned', async () => {
      const send = movementWorld();
      global.game.release = { generation: 14 };
      equipV14Movement(global.canvas.tokens.get('tok-pellias'));

      const fixture = readFixture(RELAY.MOVEPLAN);

      await expect(handleMovePlan(fixture.characterId, fixture.value)).resolves.not.toThrow();

      const call = send.mock.calls.find((c) => c[1] === RELAY.MOVEPLANNED);
      expect(call).toBeTruthy();
      const [charId, , payload] = call;
      expect(charId).toBe(fixture.characterId);
      // Observable effect: the waypoints were actually planned into a route —
      // three requested cells produce a three-cell path, correlated by ts.
      expect(payload.path).toHaveLength(fixture.value.waypoints.length);
      expect(payload.reqTs).toBe(fixture.value.ts);
      expect(typeof payload.costFeet).toBe('number');
    });
  });

  describe(`${RELAY.GROUPMOVEREQ} — foundry-bridge/groupMove.js handleGroupMoveRequest`, () => {
    test('the committed fixture is accepted: both movers land on distinct ring cells', async () => {
      const send = jest.fn();
      global.game.release = { generation: 14 };
      updateActorMap({ 'actor-ayla': 'Ayla', 'actor-brann': 'Brann' });
      initGroupMove(send);

      const place = (charId, col) => {
        const id = `actor-${charId.toLowerCase()}`;
        const token = makeToken({ id: `tok-${charId.toLowerCase()}`, x: col * 100, y: 1000 });
        const actor = makeActor({ id, name: charId, speed: 30, tokens: [token] });
        token.actor = actor;
        global.game.actors.set(id, actor);
        equipV14Movement(token);
        return token;
      };
      global.canvas.tokens.placeables = [place('Ayla', 9), place('Brann', 12)];

      const fixture = readFixture(RELAY.GROUPMOVEREQ);

      await expect(handleGroupMoveRequest(fixture.value)).resolves.not.toThrow();

      const call = send.mock.calls.find((c) => c[1] === RELAY.GROUPMOVEDONE);
      expect(call).toBeTruthy();
      const [characterId, , payload] = call;
      expect(characterId).toBe(fixture.characterId);
      expect(payload.id).toBe(fixture.value.id);
      // Observable effect: the fixture's `moverIds` and `target` were genuinely
      // read — one row per requested mover, in request order, each on its own
      // cell ringing the tapped one.
      expect(payload.results.map((r) => r.moverId)).toEqual(fixture.value.moverIds);
      expect(payload.results.every((r) => r.ok && r.reached)).toBe(true);
      const cells = payload.results.map((r) => `${r.dest.col},${r.dest.row}`);
      expect(new Set(cells).size).toBe(fixture.value.moverIds.length);
      for (const r of payload.results) {
        expect(Math.max(
          Math.abs(r.dest.col - fixture.value.target.col),
          Math.abs(r.dest.row - fixture.value.target.row),
        )).toBeLessThanOrEqual(1);
      }
    });
  });

  describe(`${RELAY.SNAPREQ} — foundry-bridge/snapshots.js handleSnapshotRequest`, () => {
    test('the committed fixture is accepted: resolves the mover into a captured world rect', async () => {
      const send = movementWorld();
      initSnapshots(send);

      // The capture-rendering seam (mirrors relayContract.test.js's SNAPDONE
      // recipe): a minimal PIXI/canvas world so captureWorldRect can render.
      const out = {
        width: 0, height: 0,
        getContext: () => ({ drawImage: jest.fn() }),
        toDataURL: () => 'data:image/webp;base64,QUJD',
      };
      global.document = { createElement: () => out };
      class Point {
        constructor(x = 0, y = 0) { this.x = x; this.y = y; }
        set(x, y) { this.x = x; this.y = y; }
      }
      global.PIXI = { RenderTexture: { create: () => ({ destroy: jest.fn() }) }, Point };
      Object.assign(global.canvas, {
        app: { renderer: { render: jest.fn(), extract: { canvas: () => ({}) } } },
        stage: { position: new Point(0, 0), scale: new Point(1, 1), pivot: new Point(0, 0) },
      });
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'tok_snap.webp', url: '/api/images/tok_snap.webp' }),
      }));

      try {
        const fixture = readFixture(RELAY.SNAPREQ);

        await expect(handleSnapshotRequest(fixture.value)).resolves.not.toThrow();

        const call = send.mock.calls.find((c) => c[1] === RELAY.SNAPDONE);
        expect(call).toBeTruthy();
        const [characterId, , payload] = call;
        expect(characterId).toBe('global');
        expect(payload.id).toBe(fixture.value.id);
        // Observable effect: `moverId` resolved to a real token and a world
        // rect was computed around it (echoed non-null) — proof the fixture's
        // moverId/radiusFeet fields were genuinely read and understood, not
        // just accepted as opaque JSON.
        expect(payload.moverId).toBe(fixture.value.moverId);
        expect(payload.ok).toBe(true);
      } finally {
        delete global.fetch;
        delete global.document;
        delete global.PIXI;
      }
    });
  });

  describe(`${RELAY.TEMPLATEPLACE} — foundry-bridge/snapshots.js handleTemplatePlace`, () => {
    // A CONE fixture on purpose (#1735 S2): the directional payload is the new
    // half of this contract — `direction` in COMPASS degrees (0 = north,
    // clockwise, multiples of 45), `x`/`y` the shape's ORIGIN rather than a
    // centre. A line adds `width` (feet, default 5); a burst/emanation carries
    // neither field.
    test('the committed fixture is accepted: draws the Region wedge its facing asks for', async () => {
      const send = jest.fn();
      initSnapshots(send);
      const createEmbeddedDocuments = jest.fn().mockResolvedValue([{ id: 'region-1' }]);
      const ping = jest.fn();
      global.game.release = { generation: 14 };
      global.canvas = {
        ping,
        scene: {
          id: 'scene-1', grid: { size: 100, distance: 5 }, createEmbeddedDocuments,
        },
      };

      const fixture = readFixture(RELAY.TEMPLATEPLACE);

      await expect(handleTemplatePlace(fixture.value)).resolves.not.toThrow();

      const call = send.mock.calls.find((c) => c[1] === RELAY.TEMPLATEDONE);
      expect(call).toBeTruthy();
      const [characterId, , payload] = call;
      expect(characterId).toBe('global');
      expect(payload).toMatchObject({ id: fixture.value.id, ok: true, templateId: 'region-1' });
      // Observable effect: the fixture's `shape`/`feet`/`direction` were really
      // read — a 30 ft cone facing NE (compass 45) is a 600 px wedge at Region
      // rotation 315, drawn at the origin point the fixture named.
      expect(createEmbeddedDocuments.mock.calls[0][1][0].shapes[0]).toEqual({
        type: 'cone',
        x: fixture.value.x,
        y: fixture.value.y,
        radius: 600,
        angle: 90,
        rotation: 315,
      });
      expect(ping).toHaveBeenCalledWith({ x: fixture.value.x, y: fixture.value.y });
    });
  });

  describe(`${RELAY.AURASET} — foundry-bridge/auras.js handleAuraSet`, () => {
    // An ACTIVATION fixture (#1733 S1): `active:true` with an explicitly
    // authored `feet`. There is no default radius — an aura whose ability
    // carries no `areaShape { shape:'emanation', feet }` is never sent at all —
    // so the fixture pins that `feet` is part of the payload, not an option.
    // `label`/`color` are the optional ring presentation.
    //
    // Hand-authored from the CONTRACT rather than from a live producer: the app
    // half of the epic has not shipped its `useAura` bridge write yet, exactly
    // like `templateplace`'s cone fixture waited for #1735 S3. The app-side
    // mirror in src/test/relayInboundContract.test.jsx picks this file up when
    // #1733's app slice lands.
    afterEach(() => { delete global.foundry; _resetAuras(); });

    test('the committed fixture is accepted: attaches an emanation Region and answers auramembers', async () => {
      const send = movementWorld();
      initAuras(send);

      // A second creature standing in the aura, and in the current combat — so
      // the members payload has to carry BOTH id spaces (tokenId always,
      // entryId only for a combatant).
      const ally = makeToken({ id: 'tok-ally', x: 600, y: 500, disposition: 1, name: 'Zevira' });
      global.canvas.tokens.placeables = [...global.canvas.tokens.placeables, ally];
      global.game.combat = makeCombat({
        combatants: [makeCombatant({ id: 'cbt-ally', actorId: null, tokenId: 'tok-ally' })],
      });
      const { createTokenEmanation } = installTokenEmanation({ contains: [ally] });

      const fixture = readFixture(RELAY.AURASET);

      await expect(handleAuraSet(fixture.characterId, fixture.value)).resolves.not.toThrow();

      // Observable effect 1: the fixture's `feet`/`label`/`color` were really
      // read — core is handed the RANGE IN GRID UNITS (feet, NOT pixels: this
      // API authors the shape itself) plus the ring's presentation, and the
      // Region is stamped with the charId the sweep reads back.
      expect(createTokenEmanation).toHaveBeenCalledTimes(1);
      const [tokenDoc, range, regionData] = createTokenEmanation.mock.calls[0];
      expect(tokenDoc).toBe(global.canvas.tokens.get('tok-pellias').document);
      expect(range).toBe(fixture.value.feet);
      expect(regionData).toMatchObject({
        name: fixture.value.label,
        color: fixture.value.color,
        visibility: 2,
        flags: { 'cnmh-bridge': { auraCharId: fixture.characterId } },
      });

      // Observable effect 2: initial membership went back on the read-back
      // channel, keyed by the same charId the fixture activated.
      const call = send.mock.calls.find((c) => c[1] === RELAY.AURAMEMBERS);
      expect(call).toBeTruthy();
      const [charId, , payload] = call;
      expect(charId).toBe(fixture.characterId);
      expect(payload.inside).toEqual([{
        entryId: 'cbt-ally',
        tokenId: 'tok-ally',
        name: 'Zevira',
        disposition: 1,
        hidden: false,
      }]);
    });
  });
});
