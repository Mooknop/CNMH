/**
 * Party Ledger + Party resource dashboard (#946, sub-issue of #519).
 *
 * The issue predates most of the downtime/exploration suite, so first, what is
 * ALREADY covered elsewhere and deliberately not repeated here:
 *   - allocating/locking a downtime plan and every write it produces
 *     (`specs/player/downtime-spine.spec.ts`, single-PC),
 *   - picking an exploration activity, one's OWN banner/chip, and the
 *     Follow-the-Expert pairing writes (`specs/player/exploration-activities.spec.ts`),
 *   - the GM dashboard's WRITE controls — Adjust HP, Apply Effect
 *     (`specs/gm/gm-dashboard.spec.ts`).
 *
 * What had zero coverage, and what this file owns — the aggregated PARTY views:
 *   1. the Downtime Party Ledger (#711 DowntimePartyLedger): every PC's week
 *      rendered from their synced `cnmh_downtime_<id>`, the presence rail's
 *      locked-in tally (PartyPresenceRail — no spec touched `.ppr` at all), and
 *      the ✦ paired-activity thread (#723);
 *   2. the exploration Party Activities board (#712 ExplorationPartyBoard):
 *      TEAMMATES' seeded picks and the rail's chosen tally (the existing spec
 *      only ever asserts the viewer's own chip);
 *   3. the GM Party resource dashboard (#230 PartyPanel / liveStateRegistry /
 *      useCharacterLiveState): per-PC HP/focus/hero-points/consumables/stance
 *      aggregation, graceful degrade (no chip without the key), and the inline
 *      ±1 nudge writing the registry's pool shape back;
 *   4. cross-character sync fidelity: one PC's update reflecting on another
 *      client's party view THROUGH THE REAL LOCAL DO (two browser contexts on
 *      the real relay — `mockSession` is per-page, so only the real
 *      CampaignSession exercises record + fan-out; cf. live-sync.spec.ts, which
 *      covers content, not per-character session keys).
 *
 * Lives under `specs/gm/**` (chromium-only): #230 is GM-desktop-only, and the
 * two-context test is transport-focused (the sync-resilience precedent) — the
 * player boards are plain flex rows with nothing viewport-specific to re-run
 * on mobile.
 *
 * Tests 1-3 mock the relay (fixtures/session.ts) to seed per-PC state
 * deterministically; peer pushes stand in for the other players' writes.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { expectOnSheet, expectSheet, openPlayTab } from '../../helpers/sheet';
import { PERIOD, block } from '../../helpers/downtime';

// Distinct first names — PartyLedgerRow's gutter renders the first name only,
// so rows are located by it.
const YOU = { id: 'e2e-ledger-you', name: 'Vex Marlowe' };
const SMITH = { id: 'e2e-ledger-smith', name: 'Orin Smith' };
const IDLER = { id: 'e2e-ledger-idler', name: 'Talia Reeve' };

const FIGHTER = { id: 'e2e-party-fighter', name: 'Bran Ironhide' };
const CASTER = { id: 'e2e-party-caster', name: 'Selene Voss' };

const hpSeed = (current: number, max: number, extra: object = {}) => ({
  current, max, temp: 0, dying: 0, wounded: 0, doomed: 0, ...extra,
});

// A party-board row (downtime `.dpl-rows` / exploration `.epb-rows` both render
// PartyLedgerRow shells) located by the PC's first name in the name gutter.
const boardRow = (page: Page, firstName: string) =>
  page.locator('.plr').filter({ has: page.locator('.plr-name', { hasText: firstName }) });

test.describe('Party Ledger — activity boards', () => {
  test('downtime ledger renders every PC’s week, the locked-in tally, and the ✦ pairing', async ({
    page, reset, seed,
  }) => {
    await reset();
    await seed({
      character: [
        { id: YOU.id, name: YOU.name, level: 5 },
        { id: SMITH.id, name: SMITH.name, level: 5 },
        { id: IDLER.id, name: IDLER.name, level: 5 },
      ],
    });

    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_downtimeblock_global: block(5),
        // The viewer: 3 of 5 days planned, not locked yet.
        [`cnmh_downtime_${YOU.id}`]: {
          periodStartedAt: PERIOD, plan: { Research: 3 }, status: 'planning',
        },
        // A teammate: sealed week, Crafting paired to the resident expert (#723)
        // — `paired[activity] = expertCharId` is what DowntimeAllocator writes.
        [`cnmh_downtime_${SMITH.id}`]: {
          periodStartedAt: PERIOD, plan: { Crafting: 4 }, status: 'ready',
          paired: { Crafting: YOU.id },
        },
        // The third PC has written nothing at all this period.
      },
    });

    await page.goto(`/character/${YOU.id}`);
    await expectOnSheet(page, YOU.id);
    await expectSheet(page, YOU.name);
    await openPlayTab(page, 'Downtime');

    // Presence rail: exactly one sealed plan out of three PCs, labelled with
    // the downtime ready-state vocabulary.
    const rail = page.locator('.ppr');
    await expect(rail.locator('.ppr-count')).toContainText('1/3');
    await expect(rail.locator('.ppr-count')).toContainText('locked in');
    // …and the rail knows WHO: avatar tooltips carry per-PC status.
    await expect(rail.locator(`.ppr-avatar[title="${SMITH.name} — locked in"]`)).toBeVisible();
    await expect(rail.locator(`.ppr-avatar[title="${IDLER.name} — planning"]`)).toBeVisible();

    // One ledger row per PC, viewer first with the You tag.
    const rows = page.locator('.dpl-rows .plr');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('Vex');
    await expect(rows.first().locator('.plr-you-tag')).toHaveText('You');

    // The viewer's ribbon: 3 Research days + the 2-day free remainder, derived
    // from the plan against the block's 5-day budget.
    const yourRow = boardRow(page, 'Vex');
    await expect(yourRow.locator('.dpl-seg[title="Research · 3d"]')).toBeVisible();
    await expect(yourRow.locator('.dpl-seg.free[title="2 free"]')).toBeVisible();

    // The teammate's ribbon renders from THEIR synced key: 4 Crafting days
    // carrying the ✦ paired thread, 1 free.
    const smithRow = boardRow(page, 'Orin');
    const pairedSeg = smithRow.locator('.dpl-seg.paired[title="Crafting · 4d"]');
    await expect(pairedSeg).toBeVisible();
    await expect(pairedSeg.locator('.dpl-seg-mark')).toHaveText('✦');
    await expect(smithRow.locator('.dpl-seg.free[title="1 free"]')).toBeVisible();

    // No state at all reads as an entirely free week, not a missing row.
    await expect(boardRow(page, 'Talia').locator('.dpl-seg.free[title="5 free"]')).toBeVisible();

    // A teammate locking in mid-view (peer UPDATE) re-renders both the row and
    // the tally without a reload.
    session.push(`cnmh_downtime_${IDLER.id}`, {
      periodStartedAt: PERIOD, plan: { 'Earn Income': 2 }, status: 'ready',
    });
    await expect(boardRow(page, 'Talia').locator('.dpl-seg[title="Earn Income · 2d"]')).toBeVisible();
    await expect(rail.locator('.ppr-count')).toContainText('2/3');
    await expect(rail.locator(`.ppr-avatar[title="${IDLER.name} — locked in"]`)).toBeVisible();
  });

  test('exploration board shows teammates’ picks and counts them on the rail', async ({
    page, reset, seed,
  }) => {
    await reset();
    await seed({
      character: [
        { id: YOU.id, name: YOU.name, level: 5 },
        { id: SMITH.id, name: SMITH.name, level: 5 },
        { id: IDLER.id, name: IDLER.name, level: 5 },
      ],
    });

    // Default play mode is exploration — only the teammates' picks are seeded.
    // The viewer stays undecided so `useExplorationReady` can't flip the tab to
    // the Movement pad (it does the moment EVERY PC has a pick).
    const session = await mockSession(page, {
      seed: {
        [`cnmh_exploration_${SMITH.id}`]: 'Scout',
        [`cnmh_exploration_${IDLER.id}`]: 'Avoid Notice',
      },
    });

    await page.goto(`/character/${YOU.id}`);
    await expectOnSheet(page, YOU.id);
    await expectSheet(page, YOU.name);
    await openPlayTab(page, 'Exploration');

    // Rail: two of three chosen, and the tooltips name who's still planning.
    const rail = page.locator('.ppr');
    await expect(rail.locator('.ppr-count')).toContainText('2/3');
    await expect(rail.locator('.ppr-count')).toContainText('chosen');
    await expect(rail.locator(`.ppr-avatar[title="${YOU.name} — planning"]`)).toBeVisible();
    await expect(rail.locator(`.ppr-avatar[title="${SMITH.name} — chosen"]`)).toBeVisible();

    // Each teammate's row carries THEIR activity chip, read from their own
    // synced key; the viewer's own row is the muted placeholder.
    await expect(boardRow(page, 'Orin').locator('.epb-chip')).toHaveText('Scout');
    await expect(boardRow(page, 'Talia').locator('.epb-chip')).toHaveText('Avoid Notice');
    await expect(boardRow(page, 'Vex').locator('.epb-chip--empty')).toHaveText('deciding…');

    // A teammate switching activities (peer UPDATE) replaces their chip live.
    session.push(`cnmh_exploration_${IDLER.id}`, 'Defend');
    await expect(boardRow(page, 'Talia').locator('.epb-chip')).toHaveText('Defend');
    // Still 2/3 — switching isn't un-choosing.
    await expect(rail.locator('.ppr-count')).toContainText('2/3');
  });
});

test.describe('Party resource dashboard (#230)', () => {
  test('per-PC live resources aggregate from each character’s synced state, and the inline nudge writes back', async ({
    page, reset, seed,
  }) => {
    await reset();
    await seed({
      character: [
        { id: FIGHTER.id, name: FIGHTER.name, level: 5 },
        // The caster's focus max comes from character data (getFocusInfo), so
        // the registry can render remaining/max rather than a bare spent count.
        { id: CASTER.id, name: CASTER.name, level: 5, spellcasting: { focus: { max: 3 } } },
      ],
    });

    const session = await mockSession(page, {
      seed: {
        // Fighter: hurt, wounded, holding hero points, in a stance.
        [`cnmh_hp_${FIGHTER.id}`]: hpSeed(12, 50, { wounded: 1 }),
        [`cnmh_heropoints_${FIGHTER.id}`]: 2,
        [`cnmh_stance_${FIGHTER.id}`]: { active: true, name: 'Mountain Stance', ts: 1 },
        // Caster: full HP, one focus point spent, one consumable used.
        [`cnmh_hp_${CASTER.id}`]: hpSeed(30, 30),
        [`cnmh_focus_${CASTER.id}`]: 1,
        [`cnmh_consumed_${CASTER.id}`]: { 'e2e-potion': 1 },
      },
    });

    await page.goto('/gm');

    const fighterRow = page.getByTestId(`party-row-${FIGHTER.id}`);
    const casterRow = page.getByTestId(`party-row-${CASTER.id}`);
    await expect(fighterRow).toBeVisible({ timeout: 15_000 });

    // HP readouts are the seeded values, not scaffolding defaults.
    await expect(page.getByLabel(`hp-${FIGHTER.id}`)).toHaveText('12/50');
    await expect(page.getByLabel(`wounded-${FIGHTER.id}`)).toHaveText('Wounded 1');
    await expect(page.getByLabel(`hp-${CASTER.id}`)).toHaveText('30/30');

    // Registry-driven chips: 1 spent of a 3-point pool reads 2/3 (the max comes
    // off the character, the spent count off the synced key); hero points are a
    // bare count; the consumables ledger names what was used.
    await expect(page.getByTestId(`party-chip-${CASTER.id}-focus`)).toContainText('2/3');
    await expect(page.getByTestId(`party-chip-${FIGHTER.id}-heropoints`)).toContainText('2');
    await expect(page.getByTestId(`party-chip-${CASTER.id}-consumed`)).toContainText('e2e-potion: 1');
    // Graceful degrade: no focus key on the fighter → no focus chip, not a 0/0.
    await expect(page.getByTestId(`party-chip-${FIGHTER.id}-focus`)).toHaveCount(0);

    // Combat-state pill, formatted through the same registry as the inspector.
    await expect(page.getByTestId(`party-pill-${FIGHTER.id}-stance`)).toContainText('Mountain Stance');

    // Inline quick action (#230 slice 3): +1 focus refunds a spent point via the
    // registry's pool shape — the key stores SPENT, so the wire value is 0.
    await page.getByRole('button', { name: `increase Focus for ${CASTER.name}` }).click();
    await session.expectSent(`cnmh_focus_${CASTER.id}`, (v) => v === 0);
    await expect(page.getByTestId(`party-chip-${CASTER.id}-focus`)).toContainText('3/3');

    // Cross-character fidelity at the view: a peer's HP update (a heal landing
    // on the fighter from elsewhere) re-renders the row live — value AND badge.
    session.push(`cnmh_hp_${FIGHTER.id}`, hpSeed(45, 50));
    await expect(page.getByLabel(`hp-${FIGHTER.id}`)).toHaveText('45/50');
    await expect(page.getByLabel(`wounded-${FIGHTER.id}`)).toHaveCount(0);
  });
});

test.describe('Cross-character sync through the real DO', () => {
  // Two real peers on the real local CampaignSession DO — no mockSession
  // anywhere, so the UPDATE → record → fan-out path itself is under test (the
  // e2e worker env reports Foundry present, so per-character writes aren't
  // sandbox-frozen). Same context bootstrapping as live-sync.spec.ts.
  const ctxOptions = (baseURL: string | undefined) => {
    const base: Record<string, unknown> = { baseURL };
    if (process.env.CF_ACCESS_CLIENT_ID) {
      base.extraHTTPHeaders = {
        'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET!,
      };
    }
    return base;
  };

  test('one PC’s activity pick reaches a teammate’s party board without a reload', async (
    { browser, reset, seed },
    testInfo,
  ) => {
    const PICKER = { id: 'e2e-live-scout', name: 'Juno Hale' };
    const WATCHER = { id: 'e2e-live-watch', name: 'Rook Danner' };

    await reset();
    // Two PCs: the watcher never picks, so neither tab can flip to Movement.
    await seed({
      character: [
        { id: PICKER.id, name: PICKER.name, level: 5 },
        { id: WATCHER.id, name: WATCHER.name, level: 5 },
      ],
    });

    const { baseURL } = testInfo.project.use;
    const contextA = await browser.newContext(ctxOptions(baseURL));
    const contextB = await browser.newContext(ctxOptions(baseURL));
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await pageA.goto(`/character/${PICKER.id}`);
      await pageB.goto(`/character/${WATCHER.id}`);
      await expectSheet(pageA, PICKER.name);
      await expectSheet(pageB, WATCHER.name);
      await openPlayTab(pageA, 'Exploration');
      await openPlayTab(pageB, 'Exploration');

      // Both relay subscriptions must be live before the pick broadcasts —
      // otherwise the UPDATE can race the watcher's WS open.
      await Promise.all([
        expect(pageA.getByTestId('sync-status')).toHaveAttribute('data-connected', 'true'),
        expect(pageB.getByTestId('sync-status')).toHaveAttribute('data-connected', 'true'),
      ]);

      // Fresh session: nobody has picked anything on the watcher's board.
      await expect(pageB.locator('.epb-rows .epb-chip--empty')).toHaveCount(2);
      await expect(pageB.locator('.ppr-count')).toContainText('0/2');

      // The picker locks in Scout through the real UI (writes
      // cnmh_exploration_<id> to the real DO, which fans it out).
      await pageA
        .locator('.el-activity-list button.action-row')
        .filter({ has: pageA.locator('.action-row__name', { hasText: /^Scout$/ }) })
        .click();
      const detail = pageA.getByRole('dialog', { name: 'Scout' });
      await detail.getByRole('button', { name: 'Set as active' }).click();

      // The watcher's board reflects it live: the picker's row chip and the
      // rail tally, with no reload anywhere.
      await expect(
        boardRow(pageB, 'Juno').locator('.epb-chip'),
      ).toHaveText('Scout', { timeout: 20_000 });
      await expect(pageB.locator('.ppr-count')).toContainText('1/2');
      await expect(
        pageB.locator(`.ppr-avatar[title="${PICKER.name} — chosen"]`),
      ).toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
