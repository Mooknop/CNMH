/**
 * The juice event channel (#1346, epic #1343) — `cnmh_fx_global`, written by
 * `src/hooks/useFxChannel.js` and by nothing else.
 *
 * The key holds a small ring buffer of structured one-shot events
 * `{ id, kind, charId, ts }`. It is shared, global, and appended to by every
 * client, so the properties worth pinning are structural, never cosmetic — this
 * spec deliberately asserts nothing about how an animation *looked*:
 *
 *   - EMIT       a committed ability use appends one well-formed event;
 *   - BOUNDED    the buffer is capped at FX_BUFFER_CAP, oldest-out;
 *   - DELIVERY   a peer's fresh event reaches this device (RollToast) and
 *                blooms the addressed PC (useFxBloom → data-fx="bloom");
 *   - ADDRESSING an event for a different charId is delivered but does not
 *                bloom this stage;
 *   - ONE-SHOT   an id already consumed never fires again, even re-delivered
 *                inside a later buffer while still inside the freshness window;
 *   - HYDRATION  a buffer replayed in FULL_STATE at mount is history, not
 *                feedback (the FX_EVENT_FRESH_MS guard).
 *
 * Two observables carry all of it. The RollToast (`data-testid="roll-toast"`,
 * ROLL_TOAST_MS = 4s) is the *delivery* probe — it fires for any charId, so it
 * proves an event landed without saying anything about addressing. The stage
 * portrait's `data-fx="bloom"` is the *addressed* probe, but it lives only
 * FX_FLASH_MS (600ms), far too short to sample with a plain locator without
 * flake — so a MutationObserver records bloom transitions cumulatively and the
 * assertions read that log instead of racing the CSS. Absence assertions
 * ("the wrong client does not flash") are anchored on a toast that definitely
 * arrives after the point in question.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { activeEncounter, expectOffTurnLive, pcEntry, readyTurnState } from '../../helpers/encounter';

// Copies of src/hooks/useFxChannel.js + src/hooks/useValueFlash.js — e2e/ never
// imports from src/ (see helpers/bridge.ts's header for the rationale). Local to
// this file for now; a factor-out candidate for helpers/ if a second spec ever
// needs the fx rail.
const FX_BUFFER_CAP = 10;
const FX_EVENT_FRESH_MS = 5_000;

// The PC whose portrait holds the stage (the actor), and the PC whose sheet the
// browser is on (the viewer). Distinct enough that a `hasText` filter can never
// confuse the two toasts.
const ACTOR_ID = 'e2e-fx-actor';
const ACTOR_NAME = 'E2E Fx Actor';
const VIEWER_ID = 'e2e-fx-viewer';
const VIEWER_NAME = 'E2E Fx Viewer';

const ABILITY = 'E2E Juice Shout';

const party = [
  { id: ACTOR_ID, name: ACTOR_NAME, level: 5, actions: [{ name: ABILITY, actions: '1', description: 'A rallying shout.' }] },
  { id: VIEWER_ID, name: VIEWER_NAME, level: 5, actions: [{ name: ABILITY, actions: '1', description: 'A rallying shout.' }] },
];

// A buffer entry as useFxChannel writes it. `roll` is the optional compact
// payload (utils/rollToast) that makes RollToast render — d20 is deliberately
// never 20 or 1, because those make the toast's own die carry data-fx="bloom"
// /"shake" and would pollute the bloom probe.
const fxEvent = (
  id: string,
  charId: string,
  ts: number,
  extra: Record<string, unknown> = {},
) => ({ id, kind: 'ability', charId, ts, ...extra });

const rollPayload = (flavor: string) => ({
  d20: 12,
  total: 22,
  flavor,
  attack: true,
  targets: [{ name: 'E2E Goblin', degree: 'success' }],
  more: 0,
});

// The page's own clock, so a seeded `ts` is measured against the same Date.now()
// useFxChannel compares it to.
const pageNow = (page: Page) => page.evaluate(() => Date.now());

const toast = (page: Page) => page.getByTestId('roll-toast');
const toastFor = (page: Page, name: string) => toast(page).filter({ hasText: name });

// ── The fx probe ────────────────────────────────────────────────────────────
// Both observables are transient: the bloom lives FX_FLASH_MS (600ms) and
// re-keys its node, the toast ROLL_TOAST_MS (4s). Sampling either with a plain
// locator races the render, and — worse for the absence boxes — a flash that
// fired and cleared before the assertion ran is indistinguishable from one that
// never fired. So a MutationObserver, installed as an init script so it is
// watching before the app's first paint, counts them CUMULATIVELY: every 0→1
// edge of `.stage-portrait[data-fx="bloom"]` is one bloom, every distinct
// roll-toast node is one delivery. Assertions read those counters.
// Local helper; a factor-out candidate for helpers/ if a second spec wants it.
type FxRecord = { blooms: number; toasts: number };

const installFxRecorder = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __fxRec?: FxRecord & { lit: boolean } };
    const rec = { blooms: 0, toasts: 0, lit: false };
    w.__fxRec = rec;
    const seen = new WeakSet<Element>();
    const sample = () => {
      const lit = document.querySelector('.stage-portrait[data-fx="bloom"]') !== null;
      if (lit && !rec.lit) rec.blooms += 1;
      rec.lit = lit;
      for (const el of document.querySelectorAll('[data-testid="roll-toast"]')) {
        if (seen.has(el)) continue;
        seen.add(el);
        rec.toasts += 1;
      }
    };
    const start = () => {
      sample();
      new MutationObserver(sample).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-fx'],
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  });

const fxRec = (page: Page): Promise<FxRecord> =>
  page.evaluate(() => {
    const r = (window as unknown as { __fxRec?: FxRecord }).__fxRec;
    return { blooms: r?.blooms ?? -1, toasts: r?.toasts ?? -1 };
  });

const bloomCount = async (page: Page) => (await fxRec(page)).blooms;

const litPortrait = (page: Page) => page.locator('.stage-portrait[data-fx="bloom"]');

const openEncounterTab = (page: Page) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Encounter', exact: true })
    .click();

const expectSheet = (page: Page, name: string) =>
  expect(page.getByRole('heading', { name, level: 1 })).toBeVisible({ timeout: 15_000 });

/**
 * Land on VIEWER's sheet with ACTOR holding the turn: EncounterSkeleton mounts
 * RollToast (delivery probe) and EncounterStage puts ACTOR's portrait — the one
 * bloom-capable node on the page, charId = ACTOR — on screen.
 */
const receiverSetup = async (
  page: Page,
  seed: (data: Record<string, unknown>) => Promise<void>,
  fxSeed?: unknown[],
): Promise<MockSession> => {
  await seed({ character: party });
  const session = await mockSession(page, {
    seed: {
      cnmh_encounter_global: activeEncounter(ACTOR_ID, ACTOR_NAME, {
        currentTurnIndex: 0,
        order: [pcEntry(ACTOR_ID, ACTOR_NAME, 20), pcEntry(VIEWER_ID, VIEWER_NAME, 10)],
      }),
      [`cnmh_turnstate_${VIEWER_ID}`]: readyTurnState(),
      ...(fxSeed ? { cnmh_fx_global: fxSeed } : {}),
    },
  });

  // Before goto: the recorder has to be watching from the first paint, or a
  // mount-time flash (exactly what the hydration box forbids) could fire and
  // clear before the spec is looking.
  await installFxRecorder(page);
  await page.goto(`/character/${VIEWER_ID}`);
  await expectSheet(page, VIEWER_NAME);
  await openEncounterTab(page);
  // Encounter-hydration gate: nothing below may be sampled before the off-turn
  // stage exists, or the probe watches a page with no portrait on it.
  // Encounter-hydration gate: nothing below may be sampled before the off-turn
  // stage exists, or the probe watches a page with no portrait on it. It is
  // also the barrier for a seeded fx buffer — FULL_STATE is ONE message, so a
  // rendered encounter proves every other seeded key landed with it. (The
  // tempting localStorage mirror is not a barrier here: useSyncedState only
  // writes it on a subscriber notify, and a snapshot that beats the hook's
  // mount is read straight out of the session cache instead.)
  await expectOffTurnLive(page);
  return session;
};

/** Land on ACTOR's own sheet, on their turn — the only surface that emits. */
const emitterSetup = async (
  page: Page,
  seed: (data: Record<string, unknown>) => Promise<void>,
  fxSeed?: unknown[],
): Promise<MockSession> => {
  await seed({ character: party });
  const session = await mockSession(page, {
    seed: {
      cnmh_encounter_global: activeEncounter(ACTOR_ID, ACTOR_NAME),
      [`cnmh_turnstate_${ACTOR_ID}`]: readyTurnState(),
      ...(fxSeed ? { cnmh_fx_global: fxSeed } : {}),
    },
  });

  await page.goto(`/character/${ACTOR_ID}`);
  await expectSheet(page, ACTOR_NAME);
  await openEncounterTab(page);
  // Own-turn hydration gate ("End turn" only exists once cnmh_encounter_global
  // has landed) — and, because FULL_STATE is one message, the barrier for a
  // seeded fx buffer too: the emit below must not race the buffer it appends to.
  await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible({ timeout: 15_000 });
  return session;
};

// Deck tile → confirm sheet → modal confirm. handleConfirm's very first act is
// the emitFx call, so every committed use goes through here.
const useAbility = async (page: Page) => {
  await page.getByRole('tab', { name: 'Actions' }).click();
  await page.getByRole('button', { name: new RegExp(ABILITY) }).first().click();
  await page.getByRole('button', { name: /^Confirm / }).click();
  await page.getByLabel('confirm-cast').click();
};

test.describe('FX juice channel (cnmh_fx_global)', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('emit: a committed ability use appends one structured event', async ({ page, seed }) => {
    const session = await emitterSetup(page, seed);
    const before = await pageNow(page);

    await useAbility(page);

    const buffer = await session.expectSent(
      'cnmh_fx_global',
      (v) => Array.isArray(v) && v.length > 0,
    );
    expect(Array.isArray(buffer)).toBe(true);
    expect(buffer).toHaveLength(1);

    const [evt] = buffer;
    // The four fields the channel's contract is written in. `id` is minted per
    // emit (it is what makes the event one-shot) and `ts` is what makes it
    // ageable — neither may be inherited from the ability.
    expect(typeof evt.id).toBe('string');
    expect(evt.id.length).toBeGreaterThan(0);
    expect(evt.kind).toBe('ability');
    expect(evt.charId).toBe(ACTOR_ID);
    expect(typeof evt.ts).toBe('number');
    expect(evt.ts).toBeGreaterThanOrEqual(before);
  });

  test('bounded: a full buffer drops its oldest entry rather than growing', async ({ page, seed }) => {
    // Twelve already-aged entries — `ts: 1` keeps them outside
    // FX_EVENT_FRESH_MS so hydrating them fires nothing (see the hydration
    // test) and this stays purely about the ring buffer's arithmetic.
    const seeded = Array.from({ length: 12 }, (_, i) =>
      fxEvent(`fx-old-${i}`, ACTOR_ID, 1),
    );
    const session = await emitterSetup(page, seed, seeded);

    await useAbility(page);

    const buffer = await session.expectSent(
      'cnmh_fx_global',
      (v) => Array.isArray(v) && v.some((e: { id?: string }) => !String(e?.id).startsWith('fx-old-')),
    );
    // 12 seeded + 1 emitted would be 13; the cap holds it at 10.
    expect(buffer).toHaveLength(FX_BUFFER_CAP);

    const ids: string[] = buffer.map((e: { id: string }) => e.id);
    // Oldest-out, newest-in — not "reject the write" and not "truncate the tail".
    expect(ids).not.toContain('fx-old-0');
    expect(ids).not.toContain('fx-old-1');
    expect(ids).not.toContain('fx-old-2');
    expect(ids).toContain('fx-old-3');
    expect(ids).toContain('fx-old-11');
    expect(ids[ids.length - 1]).not.toMatch(/^fx-old-/);
    expect(buffer[buffer.length - 1].charId).toBe(ACTOR_ID);
  });

  test('delivery: a peer event toasts here and blooms the addressed portrait', async ({ page, seed }) => {
    const session = await receiverSetup(page, seed);
    expect(await bloomCount(page)).toBe(0);

    const now = await pageNow(page);
    session.push('cnmh_fx_global', [
      fxEvent('fx-live-1', ACTOR_ID, now, { roll: rollPayload(`Strike: ${ABILITY}`) }),
    ]);

    // Delivery: the toast names the acting PC and carries the die + total the
    // event shipped — the receiving device renders it from the payload alone.
    const card = toast(page);
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(ACTOR_NAME);
    await expect(card).toContainText('12');
    await expect(card).toContainText('22');
    await expect(card).toContainText('Hit');

    // Addressed: the stage portrait belongs to ACTOR, and it bloomed exactly once.
    await expect.poll(() => bloomCount(page)).toBe(1);

    // FX_FLASH_MS: the flash is a one-shot, so it releases the portrait on its
    // own. Anchored on the count above — without that this would pass on a page
    // that never bloomed at all.
    await expect(litPortrait(page)).toHaveCount(0);
    // …and it did not simply re-arm: still one bloom, not a loop.
    expect(await bloomCount(page)).toBe(1);
  });

  test('addressing: an event for another charId lands but blooms nothing here', async ({ page, seed }) => {
    const session = await receiverSetup(page, seed);

    const now = await pageNow(page);
    // Addressed to the VIEWER — whose sheet this is, but who is NOT the PC on
    // the stage. Nothing on this page carries useFxBloom(VIEWER_ID).
    session.push('cnmh_fx_global', [
      fxEvent('fx-other-1', VIEWER_ID, now, { roll: rollPayload('Cast: E2E Bless') }),
    ]);

    // Anchor: the event unambiguously reached this device (the toast is
    // charId-blind by design), so the bloom's absence below is the addressing
    // check and not a dead channel.
    await expect(toastFor(page, VIEWER_NAME)).toHaveCount(1);
    expect(await bloomCount(page)).toBe(0);
    await expect(litPortrait(page)).toHaveCount(0);

    // And the staged portrait is not inert — its own charId still blooms it.
    const now2 = await pageNow(page);
    session.push('cnmh_fx_global', [
      fxEvent('fx-other-1', VIEWER_ID, now, { roll: rollPayload('Cast: E2E Bless') }),
      fxEvent('fx-mine-1', ACTOR_ID, now2),
    ]);
    await expect.poll(() => bloomCount(page)).toBe(1);
  });

  test('one-shot: a re-delivered id never fires twice', async ({ page, seed }) => {
    const session = await receiverSetup(page, seed);

    const now = await pageNow(page);
    const first = fxEvent('fx-once-1', ACTOR_ID, now);
    session.push('cnmh_fx_global', [first]);

    await expect.poll(() => bloomCount(page)).toBe(1);
    // Let it release, so a re-fire would be a fresh 0→1 edge the recorder sees.
    await expect(litPortrait(page)).toHaveCount(0);

    // Re-deliver the SAME id in a later buffer — a reconnect replay, a peer
    // echoing the ring back — alongside a new event that gives the assertion an
    // anchor. `ts` is re-stamped from the page clock on purpose: that takes the
    // FX_EVENT_FRESH_MS window out of the picture, so the only thing that can
    // suppress the re-fire is the id guard this test exists to pin.
    const now2 = await pageNow(page);
    session.push('cnmh_fx_global', [
      { ...first, ts: now2 },
      fxEvent('fx-once-2', VIEWER_ID, now2, { roll: rollPayload('Cast: E2E Bless') }),
    ]);

    // The new entry fired — so the whole buffer was walked in this pass, and the
    // re-delivered entry was walked with it.
    await expect(toastFor(page, VIEWER_NAME)).toHaveCount(1);
    // Yet the consumed id stayed consumed.
    expect(await bloomCount(page)).toBe(1);
    await expect(litPortrait(page)).toHaveCount(0);
    expect(await bloomCount(page)).toBe(1);
  });

  test('hydration: a buffer replayed at mount is history, not feedback', async ({ page, seed }) => {
    // A previous session's events, replayed verbatim in FULL_STATE on connect
    // (mockSession replays its seed on every connect, exactly like the DO).
    // They are well-formed and addressed to the PC on the stage — only their
    // age disqualifies them, which is the whole point of FX_EVENT_FRESH_MS:
    // a bloom is a "right now" cue, and a replayed one reads as a ghost.
    const ghostTs = Date.now() - FX_EVENT_FRESH_MS * 12;
    const stale = [
      fxEvent('fx-ghost-1', ACTOR_ID, ghostTs, { roll: rollPayload('Strike: A Ghost') }),
      fxEvent('fx-ghost-2', ACTOR_ID, ghostTs + 1, { roll: rollPayload('Strike: Another Ghost') }),
    ];
    const session = await receiverSetup(page, seed, stale);

    // Nothing fired at mount — and these are the CUMULATIVE counters, so a
    // flash that came and went during the load would still be caught.
    expect(await fxRec(page)).toEqual({ blooms: 0, toasts: 0 });

    // Anchor: the channel is live — a fresh event on the very same buffer,
    // still carrying both ghosts, fires normally.
    const now = await pageNow(page);
    session.push('cnmh_fx_global', [
      ...stale,
      fxEvent('fx-fresh-1', ACTOR_ID, now, { roll: rollPayload(`Strike: ${ABILITY}`) }),
    ]);

    await expect(toast(page)).toHaveCount(1);
    await expect(toast(page)).toContainText(ABILITY);
    // Exactly one bloom — the two ghosts were consumed silently, not replayed.
    await expect.poll(() => bloomCount(page)).toBe(1);
    expect(await bloomCount(page)).toBe(1);
  });
});
