import { describe, test, expect, beforeEach } from 'vitest';
import worker from './index.js';

// Dispatcher smoke tests (#1318): drive the real fetch handler against stubbed
// bindings and assert routing + auth gating + envelope behavior. Deep handler
// logic (audit buckets, reference scanning) is covered by its own unit tests.

const BASE = 'https://cnmh.test';

function makeEnv(overrides = {}) {
  const calls = { session: [], content: [], assets: [] };
  const doStub = (log) => ({
    idFromName: (name) => `id-${name}`,
    get: () => ({
      fetch: (req) => {
        log.push(new URL(req.url).pathname);
        return Promise.resolve(Response.json({ stub: true }));
      },
    }),
  });
  return {
    calls,
    env: {
      GM_DEV_BYPASS: 'true', // requireGm returns a fake identity
      BRIDGE_SECRET: 'shhh',
      ENVIRONMENT: 'e2e',
      CAMPAIGN_SESSION: doStub(calls.session),
      CAMPAIGN_CONTENT: doStub(calls.content),
      CAMPAIGN_IMAGES: {
        get: async () => null,
        head: async () => null,
        put: async () => {},
        delete: async () => {},
        list: async () => ({ objects: [], truncated: false }),
      },
      ASSETS: {
        fetch: (req) => {
          calls.assets.push(new URL(req.url).pathname);
          return Promise.resolve(new Response('asset'));
        },
      },
      ...overrides,
    },
  };
}

const req = (path, init) => new Request(`${BASE}${path}`, init);

describe('worker dispatch', () => {
  let calls, env;
  beforeEach(() => {
    ({ calls, env } = makeEnv());
  });

  test('unmatched paths fall through to ASSETS (SPA fallback)', async () => {
    const res = await worker.fetch(req('/character/pc-1'), env);
    expect(await res.text()).toBe('asset');
    expect(calls.assets).toEqual(['/character/pc-1']);
  });

  test('session traffic forwards to the CampaignSession DO', async () => {
    await worker.fetch(req('/session/osprey-covey'), env);
    expect(calls.session).toEqual(['/session/osprey-covey']);
  });

  test('bare /session/ is a 400 with the JSON envelope', async () => {
    const res = await worker.fetch(req('/session/'), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing campaign id' });
  });

  test('bridge traffic requires the shared secret', async () => {
    const denied = await worker.fetch(req('/bridge/osprey-covey'), env);
    expect(denied.status).toBe(403);
    await worker.fetch(req('/bridge/osprey-covey?key=shhh'), env);
    expect(calls.session).toEqual(['/bridge/osprey-covey']);
  });

  test('public content snapshot forwards to the content DO without auth', async () => {
    await worker.fetch(req('/api/content'), env);
    expect(calls.content).toEqual(['/api/content']);
  });

  test('whoami returns the GM identity through the guard', async () => {
    const res = await worker.fetch(req('/api/gm/whoami'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: expect.any(String) });
  });

  test('GM routes are denied without an identity', async () => {
    ({ calls, env } = makeEnv({ GM_DEV_BYPASS: undefined }));
    const res = await worker.fetch(req('/api/gm/usage'), env);
    expect(res.status).toBe(403);
    expect(calls.content).toEqual([]);
  });

  test('the /api/gm/* catch-all forwards authed GM writes to the content DO', async () => {
    await worker.fetch(req('/api/gm/item/dagger', { method: 'PUT', body: '{}' }), env);
    expect(calls.content).toEqual(['/api/gm/item/dagger']);
  });

  test('specific GM routes win over the catch-all (delete guarded by reference scan)', async () => {
    const res = await worker.fetch(req('/api/gm/images/img_x.png/delete', { method: 'POST' }), env);
    // Content stub returns { stub: true } (no references) → deletion proceeds.
    expect(await res.json()).toEqual({ ok: true });
  });

  test('_test/reset is env-gated even for an authed GM', async () => {
    ({ calls, env } = makeEnv({ ENVIRONMENT: 'production' }));
    const res = await worker.fetch(req('/api/gm/_test/reset', { method: 'POST' }), env);
    expect(res.status).toBe(404);
  });

  test('_test/reset wipes both DOs in e2e', async () => {
    const res = await worker.fetch(req('/api/gm/_test/reset', { method: 'POST' }), env);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls.content).toEqual(['/_internal/reset']);
    expect(calls.session).toEqual(['/_internal/reset']);
  });

  test('image serve 404s with the envelope when the object is missing', async () => {
    const res = await worker.fetch(req('/api/images/tok_missing.png'), env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  test('image serve streams a hit with immutable caching', async () => {
    env.CAMPAIGN_IMAGES.get = async (key) =>
      key === 'tok_hit.png'
        ? { body: 'bytes', httpMetadata: { contentType: 'image/png' } }
        : null;
    const res = await worker.fetch(req('/api/images/tok_hit.png'), env);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Cache-Control')).toContain('immutable');
  });

  test('bridge image preflight is open CORS; POST requires the secret', async () => {
    const pre = await worker.fetch(req('/api/bridge/image', { method: 'OPTIONS' }), env);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe('*');

    const denied = await worker.fetch(req('/api/bridge/image', { method: 'POST', body: 'x' }), env);
    expect(denied.status).toBe(403);

    const wrongMethod = await worker.fetch(req('/api/bridge/image?key=shhh', { method: 'PUT' }), env);
    expect(wrongMethod.status).toBe(405);
  });

  test('GM image upload rejects non-multipart bodies with the envelope', async () => {
    const res = await worker.fetch(req('/api/gm/images', { method: 'POST', body: 'not-form' }), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Expected multipart/form-data' });
  });
});
