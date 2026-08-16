// Scene snapshot rail tests (#1573 B1) — capture → R2 upload → snapdone ack,
// driving the real adapter capture against a mocked PIXI/canvas world.

import {
  initSnapshots, handleSnapshotRequest, handlePingPoint, handleTemplatePlace,
  pushMoverSnapshot,
} from './snapshots.js';
import { updateActorMap } from './encounter.js';
import { BRIDGE_SOURCE_FLAG } from './utils.js';
import { makeActor, makeToken } from './test/foundryMock.js';
// The invariant WS-2 exists to protect: the app's tap math must keep inverting
// a mover-centered capture with no change at all. Imported from src/ on purpose
// — a copy of the formula here would pin nothing.
import { worldPointFromTap, cellFromWorldPoint } from '../src/utils/snapshotGeometry.js';

const WT = { a: 1.5, b: 0, c: 0, d: 1.5, tx: -100, ty: -50 };

// A PIXI ObservablePoint stand-in: the adapter retargets the stage through
// set() and restores through it too.
function makePoint(x, y) {
  return { x, y, set(nx, ny) { this.x = nx; this.y = ny; } };
}

// A GM canvas world: 1200x800 viewport at 1.5x zoom, one hidden token, the
// GM-only layers visible. The extract mock snapshots layer visibility AT
// render time so the hide/restore contract is directly assertable.
function fakeCanvasWorld({ hiddenToken = null } = {}) {
  const out = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: jest.fn() }),
    toDataURL: jest.fn(() => 'data:image/webp;base64,QUJD'),
  };
  global.document = { createElement: jest.fn(() => out) };

  const visibleAtRender = {};
  const stageAtRender = {};
  const renderer = {
    screen: { width: 1200, height: 800 },
    render: jest.fn(),
    extract: {
      canvas: jest.fn(() => {
        visibleAtRender.notes = global.canvas.notes.visible;
        visibleAtRender.drawings = global.canvas.drawings.visible;
        visibleAtRender.hud = global.canvas.controls.hud.visible;
        visibleAtRender.hiddenToken = hiddenToken ? hiddenToken.visible : null;
        const { position, scale, pivot } = global.canvas.stage;
        Object.assign(stageAtRender, {
          px: position.x, py: position.y, sx: scale.x, sy: scale.y, vx: pivot.x, vy: pivot.y,
        });
        return { fake: 'extracted' };
      }),
    },
  };
  global.PIXI = {
    RenderTexture: { create: jest.fn(() => ({ destroy: jest.fn() })) },
    Point: class { constructor(x, y) { this.x = x; this.y = y; } },
  };
  global.canvas = {
    app: { renderer, view: {} },
    stage: {
      worldTransform: WT,
      // Foundry pans by moving pivot AND position together; the mover-centered
      // capture retargets all three and must put them back.
      position: makePoint(640, 400),
      scale: makePoint(1.5, 1.5),
      pivot: makePoint(2000, 1500),
      toLocal: ({ x, y }) => ({ x: (x - WT.tx) / WT.a, y: (y - WT.ty) / WT.d }),
    },
    scene: { id: 'scene-1', grid: { size: 100 } },
    notes: { visible: true },
    drawings: { visible: true },
    controls: { hud: { visible: true }, rulers: { visible: true } },
    tiles: { placeables: [] },
    tokens: { placeables: hiddenToken ? [hiddenToken] : [] },
    dimensions: { width: 4000, height: 3000 },
  };
  // bridgeSecret set, workerUrl unset (config fallback). fetch = the R2 upload.
  global.game.settings = {
    get: (_mod, key) => (key === 'bridgeSecret' ? 's3cret' : ''),
  };
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ id: 'tok_abc.webp', url: '/api/images/tok_abc.webp' }),
  }));
  return { out, visibleAtRender, stageAtRender, renderer };
}

let send;

beforeEach(() => {
  send = jest.fn();
  initSnapshots(send);
});

afterEach(() => {
  delete global.fetch;
  delete global.document;
  delete global.PIXI;
});

const lastAck = () => {
  const call = send.mock.calls.filter((c) => c[1] === 'snapdone').at(-1);
  return call ? { characterId: call[0], value: call[2] } : null;
};

describe('handleSnapshotRequest', () => {
  test('captures, uploads to the Scene Snapshots folder, and acks url + capture matrix', async () => {
    fakeCanvasWorld();
    await handleSnapshotRequest({ id: 'snap-1', ts: 1 });

    // Upload went to the secret-gated image endpoint, filed as a snapshot.
    const uploadUrl = global.fetch.mock.calls[0][0];
    expect(uploadUrl).toContain('/api/bridge/image?key=s3cret');
    expect(uploadUrl).toContain('folder=Scene%20Snapshots');
    expect(global.fetch.mock.calls[0][1]).toMatchObject({ method: 'POST' });

    const ack = lastAck();
    expect(ack.characterId).toBe('global');
    expect(ack.value).toMatchObject({
      id: 'snap-1',
      ok: true,
      url: '/api/images/tok_abc.webp',
      gridSize: 100,
      capture: {
        a: 1.5, b: 0, c: 0, d: 1.5, tx: -100, ty: -50,
        screenW: 1200, screenH: 800, sceneId: 'scene-1',
      },
    });
    // worldRect = the viewport unprojected through toLocal.
    expect(ack.value.worldRect.x1).toBeCloseTo(100 / 1.5, 3);
    expect(ack.value.worldRect.y1).toBeCloseTo(50 / 1.5, 3);
    expect(ack.value.worldRect.x2).toBeCloseTo(1300 / 1.5, 3);
    expect(ack.value.worldRect.y2).toBeCloseTo(850 / 1.5, 3);
  });

  test('the capture downscales to maxWidth and keeps the aspect', async () => {
    const { out } = fakeCanvasWorld();
    await handleSnapshotRequest({ id: 'snap-2', ts: 1 });
    expect(out.width).toBe(900);   // 1200 × 0.75
    expect(out.height).toBe(600);  // 800 × 0.75
  });

  test('GM layers and hidden tokens are excluded during render and restored after', async () => {
    const hiddenToken = { visible: true, document: { hidden: true } };
    const { visibleAtRender } = fakeCanvasWorld({ hiddenToken });
    await handleSnapshotRequest({ id: 'snap-3', ts: 1 });

    expect(visibleAtRender).toMatchObject({
      notes: false, drawings: false, hud: false, hiddenToken: false,
    });
    // Everything restored once the capture is done.
    expect(global.canvas.notes.visible).toBe(true);
    expect(global.canvas.drawings.visible).toBe(true);
    expect(global.canvas.controls.hud.visible).toBe(true);
    expect(hiddenToken.visible).toBe(true);
  });

  test('an upload failure nacks ok:false', async () => {
    fakeCanvasWorld();
    global.fetch = jest.fn(async () => ({ ok: false }));
    await handleSnapshotRequest({ id: 'snap-4', ts: 1 });
    expect(lastAck().value).toMatchObject({ id: 'snap-4', ok: false });
    expect(lastAck().value.url).toBeUndefined();
  });

  test('no renderable canvas nacks ok:false without uploading', async () => {
    fakeCanvasWorld();
    global.canvas = {};
    await handleSnapshotRequest({ id: 'snap-5', ts: 1 });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(lastAck().value).toMatchObject({ id: 'snap-5', ok: false });
  });

  test('an unconfigured relay secret nacks instead of POSTing a doomed request', async () => {
    fakeCanvasWorld();
    global.game.settings = { get: () => '' };
    await handleSnapshotRequest({ id: 'snap-6', ts: 1 });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(lastAck().value).toMatchObject({ id: 'snap-6', ok: false });
  });

  test('a request without an id is ignored', async () => {
    fakeCanvasWorld();
    await handleSnapshotRequest({ ts: 1 });
    expect(send).not.toHaveBeenCalled();
  });

  // ── Capture fallback branches ─────────────────────────────────────────────

  test('a PIXI-v8 render signature failure falls back to the legacy call shape', async () => {
    const { renderer } = fakeCanvasWorld();
    renderer.render
      .mockImplementationOnce(() => { throw new Error('v8 signature'); });
    await handleSnapshotRequest({ id: 'snap-7', ts: 1 });

    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(lastAck().value).toMatchObject({ id: 'snap-7', ok: true });
  });

  test('renderer.plugins.extract serves when renderer.extract is absent', async () => {
    const { renderer } = fakeCanvasWorld();
    renderer.plugins = { extract: renderer.extract };
    delete renderer.extract;
    await handleSnapshotRequest({ id: 'snap-8', ts: 1 });
    expect(lastAck().value).toMatchObject({ id: 'snap-8', ok: true });
  });

  test('without extract/PIXI the view itself is drawn (source fallback)', async () => {
    fakeCanvasWorld();
    delete global.canvas.app.renderer.extract;
    delete global.PIXI;
    global.canvas.app.view = { width: 800, height: 400 };
    global.canvas.app.renderer.screen = null;
    await handleSnapshotRequest({ id: 'snap-9', ts: 1 });

    const ack = lastAck();
    expect(ack.value).toMatchObject({ id: 'snap-9', ok: true });
    // Dimensions came from the raw view; 800 ≤ maxWidth so no downscale.
    expect(ack.value.capture).toMatchObject({ screenW: 800, screenH: 400 });
  });

  test('a missing worldTransform acks identity-matrix defaults', async () => {
    fakeCanvasWorld();
    global.canvas.stage.worldTransform = undefined;
    await handleSnapshotRequest({ id: 'snap-10', ts: 1 });
    expect(lastAck().value.capture).toMatchObject({
      a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0,
    });
  });

  test('a throwing toLocal falls back to scene dimensions for worldRect', async () => {
    fakeCanvasWorld();
    global.canvas.stage.toLocal = () => { throw new Error('no projection'); };
    await handleSnapshotRequest({ id: 'snap-11', ts: 1 });
    expect(lastAck().value.worldRect).toEqual({ x1: 0, y1: 0, x2: 4000, y2: 3000 });
  });

  test('a 2d context the canvas cannot supply nacks without uploading', async () => {
    const { out } = fakeCanvasWorld();
    out.getContext = () => null;
    await handleSnapshotRequest({ id: 'snap-12', ts: 1 });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(lastAck().value).toMatchObject({ id: 'snap-12', ok: false });
  });

  test('a malformed capture data URL nacks instead of uploading garbage', async () => {
    const { out } = fakeCanvasWorld();
    out.toDataURL = () => 'not-a-data-url';
    await handleSnapshotRequest({ id: 'snap-13', ts: 1 });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(lastAck().value).toMatchObject({ id: 'snap-13', ok: false });
  });

  test('hidden tiles are excluded alongside hidden tokens (#1573 B1)', async () => {
    const hiddenTile = { visible: true, document: { hidden: true } };
    const { visibleAtRender, renderer } = fakeCanvasWorld();
    global.canvas.tiles.placeables = [hiddenTile];
    renderer.extract.canvas.mockImplementation(() => {
      visibleAtRender.hiddenTile = hiddenTile.visible;
      return { fake: 'extracted' };
    });
    await handleSnapshotRequest({ id: 'snap-14', ts: 1 });

    expect(visibleAtRender.hiddenTile).toBe(false);
    expect(hiddenTile.visible).toBe(true);
  });
});

// Mover-centered captures (#1744 WS-2, epic OQ-1/OQ-5): the world rect around
// the moving token, not the GM's screen view.
describe('mover-centered capture', () => {
  // A mapped PC with a 1x1 token whose top-left is (x, y) on a 100px grid, so
  // its centre is (x + 50, y + 50). Default Speed 25 → a 1.5× radius of 37.5 ft
  // → 750 world px.
  const moverWorld = ({ x = 1000, y = 1000, speed = 25 } = {}) => {
    const world = fakeCanvasWorld();
    const token = makeToken({ id: 'tok-pellias', x, y, disposition: 1 });
    const actor = makeActor({ id: 'actor-pellias', name: 'Pellias', speed, tokens: [token] });
    token.actor = actor;
    global.game.actors.set('actor-pellias', actor);
    global.canvas.tokens.placeables = [token];
    updateActorMap({ 'actor-pellias': 'Pellias' });
    return { ...world, token };
  };

  afterEach(() => { updateActorMap({}); });

  test('captures the rect around the mover: 1.5× Speed in every direction', async () => {
    const { out } = moverWorld();
    await handleSnapshotRequest({ id: 'snap-m1', moverId: 'Pellias', ts: 1 });

    const { value } = lastAck();
    expect(value).toMatchObject({ id: 'snap-m1', ok: true, moverId: 'Pellias', trigger: 'request' });
    // centre (1050,1050) ± 750 → a 1500×1500 world rect, downscaled to 900px.
    expect(value.worldRect).toEqual({ x1: 300, y1: 300, x2: 1800, y2: 1800 });
    expect(value.capture).toMatchObject({
      a: 0.6, b: 0, c: 0, d: 0.6, tx: -180, ty: -180,
      screenW: 900, screenH: 900, sceneId: 'scene-1',
    });
    expect(value.gridSize).toBe(100);
    expect(out.width).toBe(900);
    expect(out.height).toBe(900);
  });

  // THE contract of this slice: worldRect / capture / gridSize keep their exact
  // existing semantics, so the app's untouched inverse math round-trips.
  test('a world point survives the round trip through the app\'s own tap math', async () => {
    moverWorld();
    await handleSnapshotRequest({ id: 'snap-m2', moverId: 'Pellias', ts: 1 });
    const snap = lastAck().value;

    // Forward (world → normalized) by hand, inverse via the app's helper.
    const forward = ({ x, y }) => ({
      nx: (snap.capture.a * x + snap.capture.tx) / snap.capture.screenW,
      ny: (snap.capture.d * y + snap.capture.ty) / snap.capture.screenH,
    });

    for (const world of [{ x: 1050, y: 1050 }, { x: 300, y: 300 }, { x: 1425, y: 700 }]) {
      const { nx, ny } = forward(world);
      expect(nx).toBeGreaterThanOrEqual(0);
      expect(nx).toBeLessThanOrEqual(1);
      const back = worldPointFromTap(snap, nx, ny);
      expect(back.x).toBeCloseTo(world.x, 6);
      expect(back.y).toBeCloseTo(world.y, 6);
    }

    // …and the mover's own centre resolves to the cell the token stands in.
    const centre = forward({ x: 1050, y: 1050 });
    expect(cellFromWorldPoint(worldPointFromTap(snap, centre.nx, centre.ny), snap.gridSize))
      .toEqual({ col: 10, row: 10 });
  });

  test('the matrix and the worldRect fallback agree to the pixel', async () => {
    moverWorld();
    await handleSnapshotRequest({ id: 'snap-m3', moverId: 'Pellias', ts: 1 });
    const snap = lastAck().value;

    // worldPointFromTap prefers the matrix; drop it to force the rect path.
    for (const [nx, ny] of [[0, 0], [0.25, 0.75], [1, 1]]) {
      const viaMatrix = worldPointFromTap(snap, nx, ny);
      const viaRect = worldPointFromTap({ worldRect: snap.worldRect }, nx, ny);
      expect(viaRect.x).toBeCloseTo(viaMatrix.x, 6);
      expect(viaRect.y).toBeCloseTo(viaMatrix.y, 6);
    }
  });

  test('an explicit radiusFeet overrides the Speed default', async () => {
    moverWorld();
    await handleSnapshotRequest({ id: 'snap-m4', moverId: 'Pellias', radiusFeet: 10, ts: 1 });
    // 10 ft = 200 px around (1050,1050); 400px < maxWidth so no downscale.
    expect(lastAck().value.worldRect).toEqual({ x1: 850, y1: 850, x2: 1250, y2: 1250 });
    expect(lastAck().value.capture).toMatchObject({ a: 1, tx: -850, screenW: 400, screenH: 400 });
  });

  test('a speedless actor falls back to a fixed radius instead of a zero-size rect', async () => {
    moverWorld({ speed: 0 });
    await handleSnapshotRequest({ id: 'snap-m5', moverId: 'Pellias', ts: 1 });
    // 30 ft → 600 px around (1050,1050).
    expect(lastAck().value.worldRect).toEqual({ x1: 450, y1: 450, x2: 1650, y2: 1650 });
  });

  test('the rect is clamped to the canvas bounds at the edge of the map', async () => {
    moverWorld({ x: 0, y: 0 });
    await handleSnapshotRequest({ id: 'snap-m6', moverId: 'Pellias', ts: 1 });
    // centre (50,50) ± 750 clamps to the canvas origin; 800px needs no downscale.
    expect(lastAck().value.worldRect).toEqual({ x1: 0, y1: 0, x2: 800, y2: 800 });
    expect(lastAck().value.capture).toMatchObject({ a: 1, tx: -0, ty: -0 });
  });

  test('the GM stage is retargeted for the render and restored afterwards', async () => {
    const { stageAtRender } = moverWorld();
    await handleSnapshotRequest({ id: 'snap-m7', moverId: 'Pellias', ts: 1 });

    // At render time the stage framed the mover's rect…
    expect(stageAtRender).toEqual({ px: -180, py: -180, sx: 0.6, sy: 0.6, vx: 0, vy: 0 });
    // …and the GM's own view is exactly as it was.
    expect(global.canvas.stage.position).toMatchObject({ x: 640, y: 400 });
    expect(global.canvas.stage.scale).toMatchObject({ x: 1.5, y: 1.5 });
    expect(global.canvas.stage.pivot).toMatchObject({ x: 2000, y: 1500 });
  });

  test('the stage is restored even when the render throws', async () => {
    const { renderer } = moverWorld();
    renderer.render.mockImplementation(() => { throw new Error('gpu gone'); });
    await handleSnapshotRequest({ id: 'snap-m8', moverId: 'Pellias', ts: 1 });

    expect(lastAck().value).toMatchObject({ id: 'snap-m8', ok: false });
    expect(global.canvas.stage.position).toMatchObject({ x: 640, y: 400 });
    expect(global.canvas.stage.scale).toMatchObject({ x: 1.5, y: 1.5 });
  });

  // The viewport path can fall back to drawing the raw view; the world-rect path
  // cannot — that image would be the GM's screen under a matrix claiming it is
  // the mover's neighbourhood.
  test('a build with no extractable renderer nacks instead of returning the GM view', async () => {
    moverWorld();
    delete global.canvas.app.renderer.extract;
    delete global.PIXI;
    await handleSnapshotRequest({ id: 'snap-m9', moverId: 'Pellias', ts: 1 });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(lastAck().value).toMatchObject({ id: 'snap-m9', ok: false, moverId: 'Pellias' });
  });

  test('an unresolvable moverId falls back to the legacy GM-view capture', async () => {
    moverWorld();
    await handleSnapshotRequest({ id: 'snap-m10', moverId: 'Nobody', ts: 1 });

    const { value } = lastAck();
    expect(value).toMatchObject({ id: 'snap-m10', ok: true, moverId: null, trigger: 'request' });
    // The GM viewport rect, i.e. exactly what a legacy request would have got.
    expect(value.capture).toMatchObject({ screenW: 1200, screenH: 800 });
  });

  test('a legacy request carries the additive fields as null / "request"', async () => {
    fakeCanvasWorld();
    await handleSnapshotRequest({ id: 'snap-m11', ts: 1 });
    expect(lastAck().value).toMatchObject({ moverId: null, trigger: 'request' });
  });

  test('hidden tokens are excluded from a mover-centered capture too', async () => {
    const hidden = { visible: true, document: { hidden: true } };
    const { visibleAtRender } = moverWorld();
    global.canvas.tokens.placeables.push(hidden);
    await handleSnapshotRequest({ id: 'snap-m12', moverId: 'Pellias', ts: 1 });

    expect(visibleAtRender.notes).toBe(false);
    expect(hidden.visible).toBe(true);
  });
});

// The post-move broadcast (#1744 WS-2, OQ-1 ruling): one capture for the whole
// table instead of N private snapreqs.
describe('pushMoverSnapshot', () => {
  afterEach(() => { updateActorMap({}); });

  const moverWorld = () => {
    const world = fakeCanvasWorld();
    const token = makeToken({ id: 'tok-pellias', x: 1000, y: 1000, disposition: 1 });
    const actor = makeActor({ id: 'actor-pellias', name: 'Pellias', tokens: [token] });
    token.actor = actor;
    global.game.actors.set('actor-pellias', actor);
    global.canvas.tokens.placeables = [token];
    updateActorMap({ 'actor-pellias': 'Pellias' });
    return world;
  };

  test('broadcasts one mover-centered capture tagged trigger "movedone"', async () => {
    moverWorld();
    await pushMoverSnapshot('Pellias');

    const { characterId, value } = lastAck();
    expect(characterId).toBe('global');
    expect(value).toMatchObject({ ok: true, moverId: 'Pellias', trigger: 'movedone' });
    expect(value.worldRect).toEqual({ x1: 300, y1: 300, x2: 1800, y2: 1800 });
  });

  // snapdone is correlated by `id` app-side, so a broadcast must never collide
  // with a request a client is waiting on.
  test('the broadcast carries its own id, distinct from any pending request', async () => {
    moverWorld();
    await pushMoverSnapshot('Pellias');
    expect(typeof lastAck().value.id).toBe('string');
    expect(lastAck().value.id).toMatch(/^snapmove-Pellias-/);
  });

  test('an unknown mover pushes nothing at all — a broadcast nobody asked for', async () => {
    moverWorld();
    await pushMoverSnapshot('Nobody');
    expect(send).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('no mover id is a no-op', async () => {
    moverWorld();
    await pushMoverSnapshot(null);
    expect(send).not.toHaveBeenCalled();
  });
});

// Tap-to-ping (#1573 B2). Coordinates arrive already in WORLD space — the app
// inverted the capture matrix — so the bridge only guards and forwards.
describe('handlePingPoint', () => {
  const pingWorld = ({ sceneId = 'scene-1' } = {}) => {
    const ping = jest.fn();
    global.canvas = { ping, scene: { id: sceneId } };
    return ping;
  };

  test('pings the world point on the canvas', () => {
    const ping = pingWorld();
    handlePingPoint({ id: 'ping-1', x: 500, y: 300, sceneId: 'scene-1', ts: 1 });
    expect(ping).toHaveBeenCalledWith({ x: 500, y: 300 });
  });

  test('a snapshot of another scene never pings the current one', () => {
    const ping = pingWorld({ sceneId: 'scene-2' });
    handlePingPoint({ id: 'ping-2', x: 500, y: 300, sceneId: 'scene-1', ts: 1 });
    expect(ping).not.toHaveBeenCalled();
  });

  test('an omitted sceneId pings whatever scene is open', () => {
    const ping = pingWorld();
    handlePingPoint({ id: 'ping-3', x: 10, y: 20, ts: 1 });
    expect(ping).toHaveBeenCalledWith({ x: 10, y: 20 });
  });

  test('non-finite coordinates are ignored', () => {
    const ping = pingWorld();
    handlePingPoint({ id: 'ping-4', x: 'over-there', y: 20, ts: 1 });
    handlePingPoint({ id: 'ping-5', ts: 1 });
    expect(ping).not.toHaveBeenCalled();
  });

  test('a build without Canvas#ping is a silent no-op, not a throw', () => {
    global.canvas = { scene: { id: 'scene-1' } };
    expect(() => handlePingPoint({ id: 'ping-6', x: 1, y: 2, ts: 1 })).not.toThrow();
  });

  test('never acks — the ping rail is fire-and-forget', () => {
    pingWorld();
    handlePingPoint({ id: 'ping-7', x: 500, y: 300, sceneId: 'scene-1', ts: 1 });
    expect(send).not.toHaveBeenCalled();
  });
});

// Measured templates (#1573 B4) — the real burst outline, not just a pulse.
describe('handleTemplatePlace', () => {
  // generation 13 by default (the MeasuredTemplate write); pass 14 for the
  // Region branch. 100 px squares worth 5 ft each, so 30 ft = 600 px.
  const templateWorld = ({
    sceneId = 'scene-1', created = [{ id: 'tpl-1' }], generation = 13,
  } = {}) => {
    const createEmbeddedDocuments = jest.fn().mockResolvedValue(created);
    const ping = jest.fn();
    global.game.release = { generation };
    global.canvas = {
      ping,
      scene: {
        id: sceneId, grid: { size: 100, distance: 5 }, createEmbeddedDocuments,
      },
    };
    return { createEmbeddedDocuments, ping };
  };

  const lastTemplateAck = () => {
    const call = send.mock.calls.filter((c) => c[1] === 'templatedone').at(-1);
    return call ? call[2] : null;
  };

  test('draws a circle for a burst, pings its centre, and acks the template id', async () => {
    const { createEmbeddedDocuments, ping } = templateWorld();
    await handleTemplatePlace({
      id: 'tpl-req-1', shape: 'burst', feet: 20, x: 500, y: 300, sceneId: 'scene-1', ts: 1,
    });

    expect(createEmbeddedDocuments).toHaveBeenCalledWith(
      'MeasuredTemplate',
      [expect.objectContaining({ t: 'circle', x: 500, y: 300, distance: 20 })],
      expect.objectContaining({ [BRIDGE_SOURCE_FLAG]: 'app' }),
    );
    expect(ping).toHaveBeenCalledWith({ x: 500, y: 300 });
    expect(lastTemplateAck()).toMatchObject({ id: 'tpl-req-1', ok: true, templateId: 'tpl-1' });
  });

  test('an emanation is a circle too', async () => {
    const { createEmbeddedDocuments } = templateWorld();
    await handleTemplatePlace({
      id: 'tpl-req-2', shape: 'emanation', feet: 30, x: 100, y: 100, ts: 1,
    });
    expect(createEmbeddedDocuments).toHaveBeenCalledWith(
      'MeasuredTemplate',
      [expect.objectContaining({ t: 'circle', distance: 30 })],
      expect.anything(),
    );
  });

  test('on v13 a cone draws nothing but still pings — a facing is the GM’s call', async () => {
    const { createEmbeddedDocuments, ping } = templateWorld();
    await handleTemplatePlace({
      id: 'tpl-req-3', shape: 'cone', feet: 15, x: 500, y: 300, sceneId: 'scene-1', ts: 1,
    });
    expect(createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(ping).toHaveBeenCalledWith({ x: 500, y: 300 });
    expect(lastTemplateAck()).toMatchObject({ id: 'tpl-req-3', ok: false });
  });

  // Directional shapes (#1735 S2) — the payload's `direction` is COMPASS
  // degrees (0 = north, clockwise); the adapter owns the translation to
  // Foundry's Region rotation (0 = east, clockwise) and this rail just carries
  // the field through, origin point included.
  test('a cone with a facing draws a Region wedge, pings its origin, and acks ok', async () => {
    const { createEmbeddedDocuments, ping } = templateWorld({ generation: 14 });
    await handleTemplatePlace({
      id: 'tpl-req-8',
      shape: 'cone',
      feet: 30,
      x: 500,
      y: 300,
      sceneId: 'scene-1',
      direction: 45, // NE
      ts: 1,
    });

    expect(createEmbeddedDocuments).toHaveBeenCalledWith(
      'Region',
      [expect.objectContaining({
        shapes: [{
          type: 'cone', x: 500, y: 300, radius: 600, angle: 90, rotation: 315,
        }],
      })],
      expect.objectContaining({ [BRIDGE_SOURCE_FLAG]: 'app' }),
    );
    // The pulse still marks the ORIGIN of the cone, the point the app sent.
    expect(ping).toHaveBeenCalledWith({ x: 500, y: 300 });
    expect(lastTemplateAck()).toMatchObject({ id: 'tpl-req-8', ok: true, templateId: 'tpl-1' });
  });

  test('a line carries its width through, defaulting to 5 ft', async () => {
    const { createEmbeddedDocuments } = templateWorld({ generation: 14 });
    await handleTemplatePlace({
      id: 'tpl-req-9', shape: 'line', feet: 60, x: 0, y: 0, direction: 90, width: 10, ts: 1,
    });
    await handleTemplatePlace({
      id: 'tpl-req-10', shape: 'line', feet: 60, x: 0, y: 0, direction: 90, ts: 1,
    });
    const shapeOf = (call) => createEmbeddedDocuments.mock.calls[call][1][0].shapes[0];
    expect(shapeOf(0)).toEqual({
      type: 'line', x: 0, y: 0, length: 1200, width: 200, rotation: 0,
    });
    expect(shapeOf(1).width).toBe(100);
    expect(lastTemplateAck()).toMatchObject({ id: 'tpl-req-10', ok: true });
  });

  test('a directional shape with no facing nacks and never writes the canvas', async () => {
    const { createEmbeddedDocuments, ping } = templateWorld({ generation: 14 });
    await handleTemplatePlace({
      id: 'tpl-req-11', shape: 'cone', feet: 30, x: 500, y: 300, sceneId: 'scene-1', ts: 1,
    });
    expect(createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(ping).toHaveBeenCalledWith({ x: 500, y: 300 });
    expect(lastTemplateAck()).toMatchObject({ id: 'tpl-req-11', ok: false });
  });

  test('a stale scene draws nothing and nacks', async () => {
    const { createEmbeddedDocuments } = templateWorld({ sceneId: 'scene-2' });
    await handleTemplatePlace({
      id: 'tpl-req-4', shape: 'burst', feet: 20, x: 1, y: 2, sceneId: 'scene-1', ts: 1,
    });
    expect(createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(lastTemplateAck()).toMatchObject({ id: 'tpl-req-4', ok: false });
  });

  test('a create that throws nacks instead of bubbling', async () => {
    templateWorld();
    global.canvas.scene.createEmbeddedDocuments = jest.fn().mockRejectedValue(new Error('boom'));
    await handleTemplatePlace({
      id: 'tpl-req-5', shape: 'burst', feet: 20, x: 1, y: 2, sceneId: 'scene-1', ts: 1,
    });
    expect(lastTemplateAck()).toMatchObject({ id: 'tpl-req-5', ok: false });
  });

  test('a request without an id is ignored', async () => {
    templateWorld();
    await handleTemplatePlace({ shape: 'burst', feet: 20, x: 1, y: 2, ts: 1 });
    expect(send).not.toHaveBeenCalled();
  });
});
