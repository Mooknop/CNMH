// tokenImages unit tests (#394) — resolve a Foundry-relative token path into a
// stable app URL by uploading the bytes to the Worker, with graceful fallbacks.
//
// The worker URL falls back to config.js's WORKER_WSS_URL; the relay secret comes
// from the per-world module setting (never the repo), so these tests stub the
// settings mock with one.

import {
  initTokenImages, resolveTokenUrl, ensureTokenUploaded,
} from './tokenImages.js';

const RAW = 'tokens/goblin.webp';
const ORIGIN = 'https://foundry.example';
const SECRET = 'test-relay-secret';

// Key-aware settings stub: the module reads BOTH `workerUrl` and `bridgeSecret`,
// so a blanket jest.fn() returning one value would poison the other.
function stubSettings(overrides = {}) {
  const values = { bridgeSecret: SECRET, ...overrides };
  global.game.settings.get = jest.fn((_mod, key) => values[key]);
}

// fetch mock: first call (GET bytes) → blob; second call (POST upload) → json.
function mockFetchHappy({ type = 'image/webp', size = 1234, uploadUrl = '/api/images/tok_abc.webp' } = {}) {
  return jest.fn()
    .mockResolvedValueOnce({ ok: true, blob: async () => ({ type, size }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'tok_abc.webp', url: uploadUrl }) });
}

beforeEach(() => {
  initTokenImages();
  global.window = { location: { origin: ORIGIN } };
  stubSettings();
});

afterEach(() => {
  delete global.window;
  delete global.fetch;
});

test('resolveTokenUrl returns null before resolution, the stable URL after upload', async () => {
  global.fetch = mockFetchHappy();
  expect(resolveTokenUrl(RAW)).toBeNull();

  const onResolved = jest.fn();
  await ensureTokenUploaded(RAW, onResolved);

  expect(resolveTokenUrl(RAW)).toBe('/api/images/tok_abc.webp');
  expect(onResolved).toHaveBeenCalledTimes(1);
});

test('uploads bytes to the bridge-secret-gated Worker endpoint with a derived name', async () => {
  global.fetch = mockFetchHappy();
  await ensureTokenUploaded(RAW, jest.fn());

  // GET the bytes from Foundry (absolutized against window origin).
  expect(global.fetch.mock.calls[0][0]).toBe(`${ORIGIN}/tokens/goblin.webp`);

  // POST to the Worker, carrying the shared secret + a catalog name.
  const [uploadUrl, init] = global.fetch.mock.calls[1];
  expect(uploadUrl).toContain('https://cnmh.mooknop.workers.dev/api/bridge/image');
  expect(uploadUrl).toContain(`key=${SECRET}`);
  expect(uploadUrl).toContain('name=goblin');
  expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'image/webp' } });
});

test('derives the HTTPS Worker origin from the configured wss workerUrl setting', async () => {
  stubSettings({ workerUrl: 'wss://staging.example.workers.dev' });
  global.fetch = mockFetchHappy();
  await ensureTokenUploaded(RAW, jest.fn());

  expect(global.fetch.mock.calls[1][0]).toContain('https://staging.example.workers.dev/api/bridge/image');
});

test('skips the upload entirely when no relay secret is configured', async () => {
  stubSettings({ bridgeSecret: '' });
  global.fetch = mockFetchHappy();

  await ensureTokenUploaded(RAW, jest.fn());

  // Bytes were read, but nothing was POSTed — an unauthenticated upload can only 403.
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(resolveTokenUrl(RAW)).toBe(`${ORIGIN}/tokens/goblin.webp`);
});

test('falls back to the absolute URL when the bytes cannot be fetched (cross-origin/opaque)', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('CORS'));
  const onResolved = jest.fn();

  await ensureTokenUploaded(RAW, onResolved);

  expect(resolveTokenUrl(RAW)).toBe(`${ORIGIN}/tokens/goblin.webp`);
  expect(onResolved).toHaveBeenCalledTimes(1);
  // Only the GET was attempted — no upload POST.
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('falls back to the absolute URL when the byte type is not an allowed image', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, blob: async () => ({ type: 'image/gif', size: 10 }) });

  await ensureTokenUploaded(RAW, jest.fn());

  expect(resolveTokenUrl(RAW)).toBe(`${ORIGIN}/tokens/goblin.webp`);
  expect(global.fetch).toHaveBeenCalledTimes(1); // no upload POST for disallowed type
});

test('falls back to the absolute URL when the upload POST fails', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, blob: async () => ({ type: 'image/webp', size: 10 }) })
    .mockResolvedValueOnce({ ok: false });

  await ensureTokenUploaded(RAW, jest.fn());

  expect(resolveTokenUrl(RAW)).toBe(`${ORIGIN}/tokens/goblin.webp`);
});

test('caches data: URLs verbatim without any network call', async () => {
  global.fetch = jest.fn();
  const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';

  await ensureTokenUploaded(dataUrl, jest.fn());

  expect(resolveTokenUrl(dataUrl)).toBe(dataUrl);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('is idempotent — concurrent sightings upload only once', async () => {
  global.fetch = mockFetchHappy();
  const onResolved = jest.fn();

  await Promise.all([
    ensureTokenUploaded(RAW, onResolved),
    ensureTokenUploaded(RAW, onResolved),
  ]);

  // Exactly one GET + one POST, one resolution callback.
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(onResolved).toHaveBeenCalledTimes(1);
});

test('leaves the image unresolved when there is no window (no origin to absolutize against)', async () => {
  delete global.window;
  global.fetch = jest.fn();
  const onResolved = jest.fn();

  await ensureTokenUploaded(RAW, onResolved);

  expect(resolveTokenUrl(RAW)).toBeNull();
  expect(onResolved).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('initTokenImages clears the cache', async () => {
  global.fetch = mockFetchHappy();
  await ensureTokenUploaded(RAW, jest.fn());
  expect(resolveTokenUrl(RAW)).not.toBeNull();

  initTokenImages();
  expect(resolveTokenUrl(RAW)).toBeNull();
});
