import { test as base, expect } from '@playwright/test';

export { expect };

// `reset` fixture calls /api/gm/_test/reset to wipe both DOs before a test.
// Access headers are set globally in playwright.config.ts, so the request
// goes through Cloudflare Access exactly the same as any GM API call.
export const test = base.extend<{
  reset: (opts?: { keepSession?: boolean; keepContent?: boolean }) => Promise<void>;
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
    });
  },
});
