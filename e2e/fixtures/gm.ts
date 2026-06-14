import { test as base, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { waitForContent } from '../helpers/content';

export { expect };

// POST with retry on transient 5xx / connection errors. The local `wrangler dev`
// stack occasionally restarts mid-request ("Your worker restarted mid-request",
// 503), and staging has brief blips; reset/seed are idempotent, so retrying is
// safe and turns those infra hiccups from a test failure into a non-event.
async function postWithRetry(
  request: APIRequestContext,
  url: string,
  opts: Parameters<APIRequestContext['post']>[1] = {},
  attempts = 4,
): Promise<APIResponse> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await request.post(url, opts);
      if (res.status() < 500) return res;
      lastErr = new Error(`${url} → ${res.status()} ${await res.text()}`);
    } catch (err) {
      lastErr = err; // connection reset while the worker is restarting
    }
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  throw new Error(`${url} failed after ${attempts} attempts: ${String(lastErr)}`);
}

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
      const res = await postWithRetry(request, url);
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
      const res = await postWithRetry(request, '/api/gm/seed', {
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

      // Propagation barrier: the seed POST commits to the CampaignContent DO, but
      // the app reads its content from the same DO on `page.goto`. Block here until
      // every seeded doc is visible in /api/content so no spec can navigate ahead
      // of its own data — the root cause of the seed→goto→interact flake class.
      // Safe for all collections: /api/content always returns every collection key
      // (snapshot() inits them to []), so findInCollection resolves by id.
      for (const [collection, docs] of Object.entries(collections)) {
        if (!Array.isArray(docs)) continue;
        for (const doc of docs) {
          const id = (doc as { id?: string })?.id;
          if (!id) continue;
          await waitForContent(request, collection, id, (entry) => !!entry);
        }
      }
    });
  },
});
