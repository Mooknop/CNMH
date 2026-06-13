import { defineConfig, devices } from '@playwright/test';

// Two run profiles, selected by whether E2E_BASE_URL is set:
//   • LOCAL (unset)  → full-stack `wrangler dev --env e2e` on :8788, booted as
//     Playwright's webServer. Real Worker + both DOs + simulated R2, zero CF
//     usage. `npm run test:e2e:local`.
//   • STAGING (set)  → point at the deployed cnmh-staging Worker with CF Access
//     service-token headers. `E2E_BASE_URL=… npm run test:e2e` (CI default).
const LOCAL = !process.env.E2E_BASE_URL;
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788';

// Dedicated, ephemeral DO/R2 state dir for the local stack — wiped before
// wrangler reads it so each run starts clean even before the first reset().
const E2E_STATE_DIR = '.wrangler/e2e-state';

export default defineConfig({
  testDir: './e2e',
  // Single shared instance (local DO or staging) — run specs serially to avoid
  // test data collisions. Parallelism lives inside a spec file via test.step.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // CI (local-stack gate or staging): 1 retry absorbs transient flake — a slow
  // wrangler-dev boot mid-suite, a rare race — without blocking the PR; 1 (not 2)
  // still caps write-amplification on the shared staging DO. Local dev: 0, so a
  // real failure surfaces immediately.
  retries: process.env.CI ? 1 : 0,
  // Local: Playwright's default 30s is ample. Staging: 60s gives slower remote
  // saves room before the request context is torn down (the "Request context
  // disposed" cascade on retry beforeEach is the symptom of 30s being too tight).
  timeout: LOCAL ? 30_000 : 60_000,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',

  // Local stack: build the app (served via the ASSETS binding) then boot the
  // real Worker + DOs. STAGING runs against an already-deployed Worker, so no
  // webServer. The inline node rm wipes prior DO/R2 state before wrangler reads it.
  webServer: LOCAL
    ? {
        command: `node -e "require('fs').rmSync('${E2E_STATE_DIR}',{recursive:true,force:true})" && npm run build:app && npx wrangler dev --env e2e --port 8788 --persist-to ${E2E_STATE_DIR}`,
        url: 'http://localhost:8788/api/content',
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    : undefined,

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
