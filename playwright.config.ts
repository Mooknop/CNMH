import { defineConfig, devices } from '@playwright/test';

// Two run profiles, selected by whether E2E_BASE_URL is set:
//   • LOCAL (unset)  → full-stack `wrangler dev --env e2e` on :8788, booted as
//     Playwright's webServer. Real Worker + both DOs + simulated R2, zero CF
//     usage. `npm run test:e2e:local`.
//   • STAGING (set)  → point at the deployed cnmh-staging Worker with CF Access
//     service-token headers. `E2E_BASE_URL=… npm run test:e2e` (CI default).
const LOCAL = !process.env.E2E_BASE_URL;

// LOCAL only — lets scripts/e2eShards.mjs (#685 Track 1b) run N of these stacks
// side by side on one machine, each on its own port with its own DO/R2 state
// dir, so a plain shard-less run behaves exactly as before (PORT defaults to
// 8788, same as always).
const PORT = Number(process.env.E2E_PORT || 8788);
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

// Dedicated, ephemeral DO/R2 state dir for the local stack — wiped before
// wrangler reads it so each run starts clean even before the first reset().
// Keyed by port so parallel shards (each its own port) never share state.
const E2E_STATE_DIR = process.env.E2E_STATE_DIR || `.wrangler/e2e-state-${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Single shared instance (local DO or staging) — run specs serially to avoid
  // test data collisions. Parallelism lives inside a spec file via test.step.
  // Keep this at 1 even under scripts/e2eShards.mjs: each shard is its own
  // wrangler-dev PROCESS on its own port (Track 1b), not extra Playwright
  // workers against one stack. The content DO is a hardcoded singleton
  // (`idFromName('osprey-covey')`) and `/api/gm/_test/reset` is a global wipe,
  // so two workers sharing one stack would clobber each other's seeded state.
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
  // Per-assertion timeout (Playwright default 5s). The seed fixture now barriers
  // on content propagation, so the data race is gone; this just gives a cold CI
  // *render* a little headroom after the data is present. Kept modest so a truly
  // stuck assertion still fails fast; specs with known-slow saves set their own.
  expect: { timeout: LOCAL ? 7_000 : 10_000 },
  reporter: process.env.CI ? [['html'], ['github']] : 'list',

  // Local stack: build the app (served via the ASSETS binding) then boot the
  // real Worker + DOs. STAGING runs against an already-deployed Worker, so no
  // webServer. The inline node rm wipes prior DO/R2 state before wrangler reads it.
  //
  // E2E_SKIP_BUILD=1 omits the `npm run build:app` step. scripts/e2eShards.mjs
  // (#685 Track 1b) sets this: it builds once up front and fans out N shards
  // that all boot off that one `build/` — without this, N concurrent
  // `vite build` runs would race on the same output directory. Unset (the
  // default for a plain `npm run test:e2e:local`), this behaves exactly as
  // before.
  webServer: LOCAL
    ? {
        command: [
          `node -e "require('fs').rmSync('${E2E_STATE_DIR}',{recursive:true,force:true})"`,
          ...(process.env.E2E_SKIP_BUILD ? [] : ['npm run build:app']),
          `npx wrangler dev --env e2e --port ${PORT} --persist-to ${E2E_STATE_DIR}`,
        ].join(' && '),
        url: `http://localhost:${PORT}/api/content`,
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
