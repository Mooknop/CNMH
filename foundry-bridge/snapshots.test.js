// Scene snapshot rail tests (#1573 B1) — capture → R2 upload → snapdone ack,
// driving the real adapter capture against a mocked PIXI/canvas world.

import { initSnapshots, handleSnapshotRequest, handlePingPoint } from './snapshots.js';

const WT = { a: 1.5, b: 0, c: 0, d: 1.5, tx: -100, ty: -50 };

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
  const renderer = {
    screen: { width: 1200, height: 800 },
    render: jest.fn(),
    extract: {
      canvas: jest.fn(() => {
        visibleAtRender.notes = global.canvas.notes.visible;
        visibleAtRender.drawings = global.canvas.drawings.visible;
        visibleAtRender.hud = global.canvas.controls.hud.visible;
        visibleAtRender.hiddenToken = hiddenToken ? hiddenToken.visible : null;
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
  return { out, visibleAtRender, renderer };
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
