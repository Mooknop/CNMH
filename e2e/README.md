# E2E tests

Playwright specs for the player surface (`specs/player/**`) and GM Tools (`specs/gm/**`),
plus a `smoke.spec.ts`. Helpers in `helpers/`, fixtures (`reset`/`seed`) in `fixtures/`.

## Two run profiles

The profile is chosen in `playwright.config.ts` by whether `E2E_BASE_URL` is set.

### Local full stack — default, zero Cloudflare usage

```bash
npm run test:e2e:local
```

Playwright boots `wrangler dev --env e2e` ([env.e2e] in `wrangler.toml`) as its `webServer`:
the real `worker/index.js` + `CampaignSession` + `CampaignContent` DOs + a simulated R2
bucket, on `http://localhost:8788`, serving the freshly built app via the ASSETS binding.

- `GM_DEV_BYPASS="true"` makes every request the GM (no Cloudflare Access locally).
- `ENVIRONMENT="e2e"` un-gates `POST /api/gm/_test/reset` (otherwise staging-only).
- DO/R2 state lives in an ephemeral `.wrangler/e2e-state` dir, wiped before each run.
- 30s timeout, 0 retries — failures surface immediately and cost nothing but runner time.

No `CF_ACCESS_*` secrets and no network egress required. **Use this for day-to-day dev and PRs.**

### Staging — deploy verification only

```bash
E2E_BASE_URL=https://cnmh-staging.mooknop.workers.dev \
CF_ACCESS_CLIENT_ID=… CF_ACCESS_CLIENT_SECRET=… \
npm run test:e2e
```

Targets the deployed `cnmh-staging` Worker with CF Access service-token headers. Runs serially
with 1 retry / 60s timeout because every test writes to the shared Durable Objects, which burn
the free-tier write budget. Gated behind the `run-e2e` label / `workflow_dispatch`. Reserve it
for verifying the real deployment path (Access, real DO/R2, asset serving).

## Rule of thumb

Reach for **local** unless you specifically need to exercise the deployed Cloudflare stack.

## In CI

- **`.github/workflows/e2e-local.yml` — the PR gate.** Runs the full suite against the local
  `wrangler dev` stack on every PR that touches app/worker/e2e code. No secrets, no Cloudflare
  usage, no label needed. This is the check that should stay green.
- **`.github/workflows/staging-e2e.yml` — on-demand staging smoke.** Deploys to `cnmh-staging`
  on qualifying PRs; its E2E job is gated behind the `run-e2e` label / `workflow_dispatch` and
  runs `smoke.spec.ts` only (Access service token, real DO/R2, asset serving). Dispatch it with
  `scope=full` to run the whole suite against staging for pre-release confidence.
