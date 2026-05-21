import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  // Staging is a single shared instance — run specs serially to avoid
  // test data collisions. Parallelism lives inside a spec file via test.step.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Cloudflare Access service-token headers — absent locally (uses GM_DEV_BYPASS).
    extraHTTPHeaders: process.env.CF_ACCESS_CLIENT_ID
      ? {
          'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID,
          'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET!,
        }
      : {},
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Runs all specs. GM editor specs are desktop-only by directory convention
      // (e2e/specs/gm/**); player-surface specs in e2e/specs/player/** run on
      // both this project and mobile-chromium below.
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
      // Player-surface only — GM Tools has no responsive design.
      testMatch: ['**/specs/player/**'],
    },
  ],
});
