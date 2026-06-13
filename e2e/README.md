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

## Known failures

A batch of GM specs currently fail against the real app (they fail on staging too — the
e2e job had been skipped long enough for the suite to drift). These are **not** local-stack
issues; tracked in **#313** (editor deselects after create, collapsed Maintenance `<details>`,
a duplicate-selector spec bug). Until that lands, expect those specs red on both profiles.
