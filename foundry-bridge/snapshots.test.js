// Scene snapshot rail tests (#1573 B1) — capture → R2 upload → snapdone ack,
// driving the real adapter capture against a mocked PIXI/canvas world.

import { initSnapshots, handleSnapshotRequest } from './snapshots.js';

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
});
