/**
 * Sync-layer resilience (#1599, epic #1589) — the two fixes that shipped as
 * INCIDENTS and never got a regression guard:
 *
 *   #1509  writes made while the socket was down were silently dropped. Now
 *          `SessionContext.pendingSends` queues them, `onopen` flushes them, and
 *          the next FULL_STATE is OVERLAID with the still-pending values so the
 *          DO's pre-flush snapshot can't wipe the very write just flushed.
 *   #1476  a key ABSENT from FULL_STATE is authoritative — it means "cleared",
 *          not "no news". Before the fix a cleared key came back from stale
 *          local state.
 *
 * Both live in the client, in the reconnect path, and neither is observable
 * through the real DO: nothing can make a live Durable Object drop a socket on
 * cue. So unlike `live-sync.spec.ts` (two real peers, sync fidelity between
 * them) this file mocks the transport deliberately — the unit under test is
 * SessionContext's queue/flush/reconcile logic, and the socket is the thing we
 * need to control. `fixtures/session.ts` can't help: its `mockSession` serves one
 * immutable snapshot and never closes, so this file carries a local relay that
 * can drop the link and vary the snapshot per connect.
 *
 * The write used throughout is a Stance entry (see `stances.spec.ts`) — the
 * cheapest real player-originated synced write in the app.
 *
 * Verified by mutation, not just by passing: deleting the overlay loop from
 * SessionContext's FULL_STATE handler turns "the reconnect snapshot does not
 * wipe the write it raced" red — and leaves the other four green. A regression
 * guard that has never been seen to fail isn't known to guard anything.
 *
 * Lives under `specs/gm/**` (chromium only) despite driving a player sheet: the
 * subject is the transport, not a player surface, so there is nothing for the
 * mobile project to add and the reconnect waits below are slow enough that
 * running it twice would be pure cost.
 */

import { test, expect } from '../../fixtures/gm';
import type { Page, WebSocketRoute } from '@playwright/test';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';
import { expectSheet, openPlayTab } from '../../helpers/sheet';
import { bridgeHello, TEMPLATE_PROTOCOL } from '../../helpers/bridge';

const CHAR_ID = 'e2e-fighter';
const CHAR_NAME = 'E2E Fighter';
const STANCE_KEY = `cnmh_stance_${CHAR_ID}`;

// Mirrors fixtures/session.ts — e2e is a separate TS project and never imports
// from src/, so the campaign id and key regex are restated here too.
const CAMPAIGN_ID = 'osprey-covey';
const KEY_RE = /^cnmh_([^_]+)_(.+)$/;

const decompose = (key: string) => {
  const m = KEY_RE.exec(key);
  if (!m) throw new Error(`sync-resilience: "${key}" is not a cnmh_<type>_<id> key`);
  return { stateType: m[1], characterId: m[2] };
};

const toPayload = (seed: Record<string, unknown>) => {
  const payload: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(seed)) {
    const { characterId, stateType } = decompose(key);
    (payload[characterId] ??= {})[stateType] = value;
  }
  return payload;
};

/** A client→server UPDATE, tagged with WHICH connection carried it. */
type Frame = { connect: number; key: string; value: any };

// Keys an open sheet writes on its own schedule, unprompted by any interaction:
// the encounter's elapsed-seconds ticker and the doors panel's opening probe.
// They land unpredictably, so the ordering assertion has to exclude them or it
// compares stance writes against whatever the clock happened to do.
const AMBIENT = [/^cnmh_combatsecs_/, /^cnmh_doorreq_/];

/**
 * The distinct keys one connection carried, in FIRST-write order, ambient
 * traffic removed. First-write order is the right normalization: `pendingSends`
 * is a Map keyed `characterId|stateType`, so a key repeated while offline keeps
 * its original queue position and only its value moves.
 */
const keyOrder = (frames: Frame[], connect: number) => {
  const seen: string[] = [];
  for (const f of frames) {
    if (f.connect !== connect) continue;
    if (AMBIENT.some((re) => re.test(f.key))) continue;
    if (!seen.includes(f.key)) seen.push(f.key);
  }
  return seen;
};

/**
 * A relay mock that can be dropped and that serves a different snapshot per
 * connect — the two capabilities `mockSession` deliberately doesn't have.
 *
 * `snapshots[i]` is the FULL_STATE for the i-th connect; the last entry repeats
 * for any further reconnects, so a two-element array covers "seed, then come
 * back with something different".
 */
async function resilientRelay(
  page: Page,
  { snapshots, foundry = true }: { snapshots: Array<Record<string, unknown>>; foundry?: boolean },
) {
  const frames: Frame[] = [];
  let connects = 0;
  let active: WebSocketRoute | null = null;

  await page.routeWebSocket(`**/session/${CAMPAIGN_ID}`, (ws) => {
    connects += 1;
    const which = connects;
    active = ws;

    const seed = snapshots[Math.min(which, snapshots.length) - 1];
    ws.send(JSON.stringify({ type: 'FULL_STATE', payload: toPayload(seed) }));
    ws.send(JSON.stringify({ type: 'PRESENCE', foundry }));

    ws.onMessage((raw) => {
      let msg: any;
      try {
        msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
      } catch {
        return;
      }
      if (msg?.type !== 'UPDATE' || !msg.characterId || !msg.key) return;
      // Record against the connection that carried it — the whole point of this
      // file is WHEN a frame arrived, not just that it did.
      frames.push({ connect: which, key: `cnmh_${msg.key}_${msg.characterId}`, value: msg.value });
    });
  });

  return {
    frames,
    connects: () => connects,

    /** Frames for `key`, optionally restricted to one connection. */
    on(key: string, connect?: number) {
      return frames.filter((f) => f.key === key && (connect === undefined || f.connect === connect));
    },

    /**
     * Drop the link, as a DO restart or a backgrounded phone would. 1001 ("going
     * away") rather than 1006: 1006 is reserved for an abnormal close that no
     * endpoint may send explicitly. SessionContext's `onclose` doesn't inspect
     * the code — any close schedules the same reconnect — so the distinction is
     * only about sending a legal frame.
     */
    async drop() {
      if (!active) throw new Error('resilientRelay.drop(): nothing connected yet');
      await active.close({ code: 1001, reason: 'e2e drop' });
      active = null;
    },

    /**
     * Wait for the n-th connection to be established. SessionContext retries on
     * a 3s timer (RECONNECT_MS), so this needs headroom well past one tick.
     */
    async waitForConnect(n: number) {
      await expect
        .poll(() => connects, { timeout: 15_000, message: `relay never reached connect #${n}` })
        .toBeGreaterThanOrEqual(n);
    },
  };
}

const syncStatus = (page: Page) => page.getByTestId('sync-status');

// Stance-trait actions render as tiles in the deck's Actions segment; handleUse
// routes the Stance trait straight to enter (confirm sheet, no roll).
const stanceAction = (name: string) => ({
  name,
  actions: '1',
  traits: ['Stance'],
  description: `Enter ${name}.`,
});

const enterStance = async (page: Page, name: string) => {
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await page.getByRole('button', { name: /^Confirm / }).click();
};

// Every snapshot carries the bridge hello. Without it `useBridgeStatus` resolves
// protocol 0 (< MIN_BRIDGE_PROTOCOL) and SyncStatus renders 'stale' instead of
// 'live' — which would make every badge assertion below fail for a reason this
// file isn't about. It also has to be in EACH snapshot, not just the first: this
// spec varies the snapshot per connect, and #1476 means a key the snapshot omits
// is treated as cleared.
const BASE_SEED = { cnmh_bridgehello_global: bridgeHello(TEMPLATE_PROTOCOL) };

const ENCOUNTER_SEED = {
  ...BASE_SEED,
  cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
  [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
};

test.describe('Sync resilience', () => {
  // SessionContext retries on a 3s timer (RECONNECT_MS) and these tests spend
  // real wall-clock waiting for it — the absent-key test rides two full cycles.
  // The config's 30s local default doesn't leave room, and the reconnect delay is
  // the behaviour under test, so it can't be shortened away.
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test.describe('offline write queue (#1509)', () => {
    test.beforeEach(async ({ seed }) => {
      await seed({
        character: [{
          id: CHAR_ID,
          name: CHAR_NAME,
          level: 5,
          actions: [stanceAction('E2E Dragon Stance'), stanceAction('E2E Mountain Stance')],
        }],
      });
    });

    test('a write made while the link is down flushes on reconnect', async ({ page }) => {
      // Same snapshot on every connect: this test is about the write surviving,
      // not about what the server says afterwards.
      const relay = await resilientRelay(page, { snapshots: [ENCOUNTER_SEED] });

      await page.goto(`/character/${CHAR_ID}`);
      await expectSheet(page, CHAR_NAME);
      await openPlayTab(page, 'Encounter');
      await page.getByRole('tab', { name: 'Actions' }).click();
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'live');

      await relay.drop();
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'offline');

      await enterStance(page, 'E2E Dragon Stance');

      // The badge is the user-visible half of the fix: "queued", not "eaten".
      // Distinguishing pending from plain offline is the whole reason the state
      // exists (SyncStatus.jsx), so assert the distinction, not just non-live.
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'pending');
      // Nothing reached the wire on the dead socket.
      expect(relay.on(STANCE_KEY, 1)).toHaveLength(0);

      await relay.waitForConnect(2);
      await expect
        .poll(() => relay.on(STANCE_KEY, 2).length, { timeout: 10_000 })
        .toBeGreaterThan(0);
      expect(relay.on(STANCE_KEY, 2)[0].value).toMatchObject({
        active: true,
        name: 'E2E Dragon Stance',
      });

      // Queue drained → the badge goes back to live rather than sticking.
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'live');
    });

    test('a write superseded while down flushes once, with the final value', async ({ page }) => {
      const relay = await resilientRelay(page, { snapshots: [ENCOUNTER_SEED] });

      await page.goto(`/character/${CHAR_ID}`);
      await expectSheet(page, CHAR_NAME);
      await openPlayTab(page, 'Encounter');
      await page.getByRole('tab', { name: 'Actions' }).click();
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'live');

      await relay.drop();
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'offline');

      // Two stances, same key. Only one stance can be active, so the second
      // supersedes the first — pendingSends is keyed `characterId|stateType`
      // with newest-wins, so the intermediate value must never reach the wire.
      await enterStance(page, 'E2E Dragon Stance');
      await enterStance(page, 'E2E Mountain Stance');
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'pending');

      await relay.waitForConnect(2);
      await expect
        .poll(() => relay.on(STANCE_KEY, 2).length, { timeout: 10_000 })
        .toBeGreaterThan(0);
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'live');

      const stanceFrames = relay.on(STANCE_KEY, 2);
      expect(stanceFrames).toHaveLength(1);
      expect(stanceFrames[0].value).toMatchObject({ active: true, name: 'E2E Mountain Stance' });
    });

    test('the reconnect snapshot does not wipe the write it raced (#1509 overlay)', async ({ page }) => {
      // THE regression this file exists for. The DO builds FULL_STATE when the
      // socket attaches — BEFORE the frames flushed in onopen are processed — so
      // the snapshot legitimately lacks the key that was just flushed. Without
      // SessionContext's overlay, useSyncedState's "absent key is authoritative"
      // reconcile (#1476) would treat that gap as a clear and revert the write.
      //
      // Connect 2 therefore serves a snapshot with NO stance key, exactly as the
      // real DO would in that race.
      const relay = await resilientRelay(page, { snapshots: [ENCOUNTER_SEED, ENCOUNTER_SEED] });

      await page.goto(`/character/${CHAR_ID}`);
      await expectSheet(page, CHAR_NAME);
      await openPlayTab(page, 'Encounter');
      await page.getByRole('tab', { name: 'Actions' }).click();
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'live');

      await relay.drop();
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'offline');
      await enterStance(page, 'E2E Dragon Stance');
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'pending');

      await relay.waitForConnect(2);
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'live');
      await expect
        .poll(() => relay.on(STANCE_KEY, 2).length, { timeout: 10_000 })
        .toBeGreaterThan(0);

      // The stance survives the snapshot that omitted it. The EffectsPanel's
      // voluntary-leave button is the rendered proof — it exists only while the
      // stance is active, so a reverted write makes it disappear.
      await openPlayTab(page, 'Stats');
      await expect(page.getByRole('button', { name: 'Leave E2E Dragon Stance' })).toBeVisible();
    });

    test('the flush preserves the order the writes were made in', async ({ page }) => {
      // A stance entry writes two keys (the stance itself and the encounter log).
      // Rather than hard-coding which goes first — an implementation detail that
      // would make this brittle — the test CALIBRATES: it performs one stance
      // entry while live, records the key order that produced, then repeats the
      // interaction offline and asserts the flush reproduces the same order.
      const relay = await resilientRelay(page, { snapshots: [ENCOUNTER_SEED] });

      await page.goto(`/character/${CHAR_ID}`);
      await expectSheet(page, CHAR_NAME);
      await openPlayTab(page, 'Encounter');
      await page.getByRole('tab', { name: 'Actions' }).click();
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'live');

      // Calibration run, on the live socket.
      await enterStance(page, 'E2E Dragon Stance');
      await expect
        .poll(() => relay.on(STANCE_KEY, 1).length, { timeout: 10_000 })
        .toBeGreaterThan(0);
      const liveKeys = keyOrder(relay.frames, 1);
      // Guard the calibration itself: a single-key run would make the assertion
      // below vacuous.
      expect(liveKeys.length).toBeGreaterThan(1);

      await relay.drop();
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'offline');

      await enterStance(page, 'E2E Mountain Stance');
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'pending');

      await relay.waitForConnect(2);
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'live');
      await expect
        .poll(() => relay.on(STANCE_KEY, 2).length, { timeout: 10_000 })
        .toBeGreaterThan(0);

      // Same keys, same relative order — the queue is insertion-ordered, not a
      // bag that happens to drain.
      expect(keyOrder(relay.frames, 2)).toEqual(liveKeys);
    });
  });

  test.describe('absent-key authority (#1476)', () => {
    test.beforeEach(async ({ seed }) => {
      await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
    });

    test('a key dropped from the snapshot clears, and does not come back on the next reconnect', async ({
      page,
    }) => {
      // Connect 1 says the campaign is in downtime; connects 2+ omit the key
      // entirely — the GM cleared it. Absence is authoritative, so the sheet must
      // fall back to the default mode rather than staying sticky on downtime.
      const relay = await resilientRelay(page, {
        snapshots: [{ ...BASE_SEED, cnmh_playmode_global: 'downtime' }, { ...BASE_SEED }],
      });

      await page.goto(`/character/${CHAR_ID}`);
      await expectSheet(page, CHAR_NAME);

      const rail = page.getByRole('navigation', { name: 'Character sheet sections' });
      await expect(rail.getByRole('button', { name: 'Downtime', exact: true })).toBeVisible();

      await relay.drop();
      await relay.waitForConnect(2);
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'live');

      // Cleared: the mode-aware tab falls back to Exploration.
      await expect(rail.getByRole('button', { name: 'Exploration', exact: true })).toBeVisible();
      await expect(rail.getByRole('button', { name: 'Downtime', exact: true })).toHaveCount(0);

      // …and stays cleared. `useSyncedState` writes every synced value through to
      // localStorage, so 'downtime' is still sitting in this origin's storage;
      // a second empty snapshot proves the reconcile purges it instead of letting
      // it resurrect on the next hydration.
      await relay.drop();
      await relay.waitForConnect(3);
      await expect(syncStatus(page)).toHaveAttribute('data-state', 'live');
      await expect(rail.getByRole('button', { name: 'Exploration', exact: true })).toBeVisible();
      await expect(rail.getByRole('button', { name: 'Downtime', exact: true })).toHaveCount(0);
    });
  });
});
