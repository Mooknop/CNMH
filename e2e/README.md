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

## Mocking the session socket (`fixtures/session.ts`)

`mockSession(page, { seed })` intercepts the `/session/*` relay with
`page.routeWebSocket`, mirroring `worker/CampaignSession.js`. Call it **before**
`page.goto`. It lets a spec:

- **seed synced `cnmh_*` state** deterministically (replayed as `FULL_STATE` on connect), and
- **simulate a peer the backend can't provide** — above all the Foundry bridge:
  `session.push('cnmh_moveopts_<id>', …)` plays the bridge, `session.onSent('cnmh_movereq_<id>', …)`
  reacts to what the app sends, `session.expectSent('cnmh_moveconfirm_<id>', matcher)` asserts it.

It only intercepts `/session`, so `/api/content` + `/content-sync` still load real content from the
local stack. See `specs/player/movement.spec.ts` for the movement state-machine example.

**When to mock vs. not:** mock when you're simulating a peer (the bridge) or seeding synced state;
use the **real** relay when the sync layer itself is under test (`specs/gm/live-sync.spec.ts`).
It's opt-in — only specs that call `mockSession` are mocked.

**The offline sandbox:** the handshake reports Foundry **present** by default, because with it absent
the write-gate (#553) freezes per-character synced writes and unrelated assertions start failing for
reasons the spec never meant to exercise. Pass `mockSession(page, { foundry: false, seed })` to test
the sandbox itself; `[data-testid="sync-status"][data-state="sandbox"]` is the clean gate for
"genuinely in the sandbox" as opposed to merely disconnected
(`specs/player/focus-dossier.spec.ts`).

## Protocol-gated bridge rails (`helpers/bridge.ts`)

Presence is not enough for a rail that gates on the bridge handshake: `useBridgeStatus` reads its
protocol off `cnmh_bridgehello_global`, and with no hello seeded that's `null`, so the feature never
renders and the spec fails as "the button was never there". Seed `bridgeHello(N)` alongside the rest
of the state.

`helpers/bridge.ts` also holds the per-rail floors and timeouts — `ROLL_PROTOCOL` /
`ROLL_TIMEOUT_MS` (`src/utils/diceRelay.js`) and `SNAP_PROTOCOL` / `PING_PROTOCOL` /
`TEMPLATE_PROTOCOL` / `SNAP_TIMEOUT_MS` (`src/utils/snapshotRelay.js`). They are **copies**: `e2e/`
deliberately never imports from `src/` (the same reason `CAMPAIGN_ID` is restated in
`fixtures/session.ts`), so one file carries the drift rather than every spec.

## In CI

- **`.github/workflows/e2e-local.yml` — the PR gate.** Runs the full suite against the local
  `wrangler dev` stack on every PR that touches app/worker/e2e code. No secrets, no Cloudflare
  usage, no label needed. This is the check that should stay green.
- **`.github/workflows/staging-e2e.yml` — on-demand staging smoke.** Deploys to `cnmh-staging`
  on qualifying PRs; its E2E job is gated behind the `run-e2e` label / `workflow_dispatch` and
  runs `smoke.spec.ts` only (Access service token, real DO/R2, asset serving). Dispatch it with
  `scope=full` to run the whole suite against staging for pre-release confidence.
