import { test as base, expect } from '@playwright/test';

export { expect };

type SeedCollections = {
  quest?: object[];
  faction?: object[];
  calendar?: object[];
  lore?: object[];
  character?: object[];
  item?: object[];
  spell?: object[];
  effect?: object[];
};

// `reset` fixture calls /api/gm/_test/reset to wipe both DOs before a test.
// Access headers are set globally in playwright.config.ts, so the request
// goes through Cloudflare Access exactly the same as any GM API call.
//
// `seed` fixture calls /api/gm/seed to populate collections with known test
// data. Pass `force: true` to overwrite non-empty collections (needed when a
// prior failed test left data behind). Each collection value is an array of
// raw documents with an `id` field.
export const test = base.extend<{
  reset: (opts?: { keepSession?: boolean; keepContent?: boolean }) => Promise<void>;
  seed: (collections: SeedCollections, opts?: { force?: boolean }) => Promise<void>;
}>({
  reset: async ({ request }, use) => {
    await use(async (opts = {}) => {
      const params = new URLSearchParams();
      if (opts.keepSession) params.set('keep_session', '1');
      if (opts.keepContent) params.set('keep_content', '1');
      const url = `/api/gm/_test/reset${params.size ? `?${params}` : ''}`;
      const res = await request.post(url);
      if (!res.ok()) {
        throw new Error(`Staging reset failed: ${res.status()} ${await res.text()}`);
      }
      // Guard against Cloudflare Access serving a 200 login-page HTML when the
      // service token isn't recognized — we'd see ok() but no JSON body.
      const ct = res.headers()['content-type'] || '';
      if (!ct.includes('application/json')) {
        throw new Error(`Staging reset returned non-JSON (likely Access interstitial): ${ct}`);
      }
      const body = await res.json();
      if (body.ok !== true) {
        throw new Error(`Staging reset returned unexpected body: ${JSON.stringify(body)}`);
      }
    });
  },

  seed: async ({ request }, use) => {
    await use(async (collections, opts = {}) => {
      const res = await request.post('/api/gm/seed', {
        data: { force: opts.force ?? true, collections },
      });
      if (!res.ok()) {
        throw new Error(`Staging seed failed: ${res.status()} ${await res.text()}`);
      }
      const ct = res.headers()['content-type'] || '';
      if (!ct.includes('application/json')) {
        throw new Error(`Staging seed returned non-JSON (likely Access interstitial): ${ct}`);
      }
      const body = await res.json();
      if (body.ok !== true) {
        throw new Error(`Staging seed returned unexpected body: ${JSON.stringify(body)}`);
      }
    });
  },
});
