/**
 * Downtime activities — Earn Income + Training (#1621, under epic #1589).
 *
 * Two player-facing downtime resolvers that had no E2E:
 *   • EarnIncomeResolver — reads the GM's per-PC task level
 *     (cnmh_earnincometask_global), rolls the flat check, and SUBMITS the
 *     outcome to the GM review queue (cnmh_downtimeresults_global). No gold is
 *     credited player-side; the GM's DowntimeResultsApproval does that later.
 *   • TrainingProjects — starts a track on cnmh_training_<id>, the allocator
 *     banks planned Training hours into it, and a track that meets its
 *     benchmark queues a pending training result and leaves the player's list.
 *
 * The downtime block + a locked plan are seeded directly via mockSession rather
 * than driven through GM Tools — that path is the spine spec's job (#1619).
 *
 * Degrees of success are pinned by the *entered total*, not by the seeded
 * character's skill build: the resolver takes the raw d20 and the final total as
 * two free inputs, so a total of DC+10 or DC−11 fixes the degree no matter what
 * the sheet's modifiers are.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';

const EARNER_ID = 'e2e-earner';
const EARNER_NAME = 'E2E Earner';
const TRAINEE_ID = 'e2e-trainee';
const TRAINEE_NAME = 'E2E Trainee';

// The block's `startedAt` is the period identity; every period-scoped write is
// compared against it by VALUE (downtimeUtils.periodKey JSON-stringifies), so a
// plain number is a perfectly good stand-in for the game-date object.
const PERIOD = 1;
const block = (days: number) => ({ active: true, days, startedAt: PERIOD });

// A plan the allocator has already locked in. `status: 'ready'` is what gates
// the Earn Income resolver into the tab (DowntimeTab renders it only when
// planLocked); selected/ledger are derived from `plan` by periodState, so the
// plan alone is the whole seed.
const lockedPlan = (plan: Record<string, number>) => ({
  periodStartedAt: PERIOD,
  plan,
  status: 'ready',
});

// The GM's Earn Income task override (DowntimeControl writes this map).
// Level 7 → DC 23, and for a Trained skill: 200cp on a success, 250cp on a
// critical success (the level-8 row), 40cp on a failure, nothing on a crit fail.
const TASK_LEVEL = 7;
const TASK_DC = 23;

// Support for one Training Vendor. Presence in cnmh_support_global is what makes
// a vendor's tracks offerable (data/trainingVendors.availableTrainingVendors).
const GARRISON = 'sandpoint-garrison';

// A Shield Block track mid-flight. 160h is the catalog benchmark; `hours` is
// where the PC already is, so a short seeded block finishes the arithmetic.
const shieldBlockTrack = (hours: number) => ({
  id: 'e2e-track-1',
  vendorId: GARRISON,
  offeringId: 'shield-block',
  hours,
  benchmarkHours: 160,
  status: 'in-progress',
  startedAt: PERIOD,
});

const expectSheet = (page: Page, name: string) =>
  expect(page.getByRole('heading', { name, level: 1 })).toBeVisible({ timeout: 15_000 });

// The mode-aware play tab. It only exists once cnmh_playmode_global is
// 'downtime' with no encounter running, so awaiting it is also the hydration
// gate for everything the tab renders.
const openDowntimeTab = (page: Page) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Downtime', exact: true })
    .click();

test.describe('Earn Income', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      character: [{
        id: EARNER_ID,
        name: EARNER_NAME,
        level: 5,
        // Trained Crafting (the field is `proficiency`, not `rank`) — Crafting is
        // the one skill every Earn Income job accepts, so it's always offered.
        skills: { crafting: { proficiency: 1 } },
      }],
    });
  });

  const seedEarner = (page: Page, days = 2) =>
    mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_downtimeblock_global: block(days),
        [`cnmh_downtime_${EARNER_ID}`]: lockedPlan({ 'Earn Income': days }),
        cnmh_earnincometask_global: { [EARNER_ID]: TASK_LEVEL },
      },
    });

  test('the GM-assigned task shows its level + DC and one unresolved roll per day', async ({ page }) => {
    await seedEarner(page);
    await page.goto(`/character/${EARNER_ID}`);
    await expectSheet(page, EARNER_NAME);
    await openDowntimeTab(page);

    // The header carries the task the GM published, flagged as an override
    // (without one the resolver would use the freelance job's own level, 4).
    await expect(page.locator('.eir-task')).toContainText(`Level ${TASK_LEVEL} · DC ${TASK_DC}`);
    await expect(page.locator('.eir-task')).toContainText('GM-set');
    // One roll per committed Earn Income day.
    await expect(page.getByText('2 unresolved rolls')).toBeVisible();
  });

  test('a critical success previews the level-above payout and is staged for the GM, not credited', async ({ page }) => {
    const session = await seedEarner(page);
    await page.goto(`/character/${EARNER_ID}`);
    await expectSheet(page, EARNER_NAME);
    await openDowntimeTab(page);

    await page.getByLabel('Earn Income skill').selectOption('crafting');
    // total ≥ DC + 10 is a critical success outright — the d20 face only matters
    // for the nat-1/20 shift, so a 10 keeps the degree purely total-driven.
    await page.getByLabel('Raw d20 die').fill('10');
    await page.getByLabel('Check total').fill(String(TASK_DC + 10));

    // Trained crit success on a level-7 task pays the level-8 Trained row: 250cp.
    await expect(page.locator('.eir-preview')).toContainText('Critical Success');
    await expect(page.locator('.eir-preview')).toContainText('2 gp 5 sp (2.5 gp)');

    await page.getByRole('button', { name: 'Submit for GM' }).click();

    const results = await session.expectSent(
      'cnmh_downtimeresults_global',
      (v) => v?.entries?.length === 1,
    );
    expect(results.entries[0]).toMatchObject({
      kind: 'earn-income',
      charId: EARNER_ID,
      taskLevel: TASK_LEVEL,
      dc: TASK_DC,
      skillKey: 'crafting',
      degree: 'criticalSuccess',
      payoutCp: 250,
      // Staged, NOT credited — the GM's approval queue turns this into gold.
      status: 'pending',
      periodStartedAt: PERIOD,
    });

    // Anchor for the absence assertion: the roll slot is consumed, so everything
    // the submit was going to write has been written.
    await expect(page.getByText('1 unresolved roll')).toBeVisible();
    expect(session.sent.filter((m) => m.stateType === 'gold')).toEqual([]);
  });

  test('a failure still pays the Failed amount; a critical failure pays nothing', async ({ page }) => {
    const session = await seedEarner(page);
    await page.goto(`/character/${EARNER_ID}`);
    await expectSheet(page, EARNER_NAME);
    await openDowntimeTab(page);

    // Roll 1 — inside the failure band (below the DC, but not by 11+).
    await page.getByLabel('Earn Income skill').selectOption('crafting');
    await page.getByLabel('Raw d20 die').fill('10');
    await page.getByLabel('Check total').fill(String(TASK_DC - 3));
    // The Failed column is proficiency-independent: 40cp at task level 7.
    await expect(page.locator('.eir-preview')).toContainText('4 sp (0.4 gp)');
    await page.getByRole('button', { name: 'Submit for GM' }).click();

    await expect(page.getByText('1 unresolved roll')).toBeVisible();

    // Roll 2 — total ≤ DC − 11 is a critical failure; a natural 1 can only keep
    // it there (the shift clamps at the bottom degree).
    await page.getByLabel('Earn Income skill').selectOption('crafting');
    await page.getByLabel('Raw d20 die').fill('1');
    await page.getByLabel('Check total').fill(String(TASK_DC - 11));
    await expect(page.locator('.eir-preview')).toContainText('Critical Failure');
    await expect(page.locator('.eir-preview')).toContainText('No income');
    await page.getByRole('button', { name: 'Submit for GM' }).click();

    const results = await session.expectSent(
      'cnmh_downtimeresults_global',
      (v) => v?.entries?.length === 2,
    );
    expect(results.entries.map((e: any) => [e.degree, e.payoutCp])).toEqual([
      ['failure', 40],
      ['criticalFailure', 0],
    ]);
    // Neither degree is a silent no-op: both reach the GM queue as their own entry.
    expect(results.entries.every((e: any) => e.status === 'pending')).toBe(true);
  });
});

test.describe('Training', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      character: [{ id: TRAINEE_ID, name: TRAINEE_NAME, level: 5 }],
    });
  });

  test('starting a track at a supported vendor writes it to cnmh_training_<id>', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_downtimeblock_global: block(3),
        // The party supports the Garrison → its tracks become offerable.
        cnmh_support_global: { [GARRISON]: { earnedAt: null } },
      },
    });

    await page.goto(`/character/${TRAINEE_ID}`);
    await expectSheet(page, TRAINEE_NAME);
    await openDowntimeTab(page);

    // Only Shield Block is eligible: the three Specialized tiers require it first.
    await page.getByRole('button', { name: '+ New' }).click();
    await page.getByLabel('Training track').selectOption(`${GARRISON}::shield-block`);
    await page.getByRole('button', { name: 'Start training' }).click();

    const training = await session.expectSent(
      `cnmh_training_${TRAINEE_ID}`,
      (v) => v?.tracks?.length === 1,
    );
    expect(training.tracks[0]).toMatchObject({
      vendorId: GARRISON,
      offeringId: 'shield-block',
      hours: 0,
      benchmarkHours: 160,
      status: 'in-progress',
    });

    await expect(page.getByRole('list', { name: 'Training tracks' })).toContainText('Shield Block');
    await expect(page.getByRole('list', { name: 'Training tracks' })).toContainText('0h / 160h');
  });

  test('allocating Training days banks 8h per day into the in-flight track', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_downtimeblock_global: block(2),
        cnmh_support_global: { [GARRISON]: { earnedAt: null } },
        [`cnmh_training_${TRAINEE_ID}`]: { tracks: [shieldBlockTrack(100)] },
      },
    });

    await page.goto(`/character/${TRAINEE_ID}`);
    await expectSheet(page, TRAINEE_NAME);
    await openDowntimeTab(page);

    // Plan both days into Training, then lock in — hours bank only on lock-in.
    await page.getByRole('button', { name: 'More Training' }).click();
    await page.getByRole('button', { name: 'More Training' }).click();
    // With a single target the default split puts all 16h on it.
    await expect(page.getByText('16 / 16h allocated')).toBeVisible();
    await page.getByRole('button', { name: /Lock in/ }).click();

    const training = await session.expectSent(
      `cnmh_training_${TRAINEE_ID}`,
      (v) => v?.tracks?.[0]?.hours === 116,
    );
    expect(training.tracks[0].id).toBe('e2e-track-1');
    await expect(page.getByRole('list', { name: 'Training tracks' })).toContainText('116h / 160h');
  });

  test('a track that meets its benchmark queues a pending training result and leaves the list', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_downtimeblock_global: block(1),
        cnmh_support_global: { [GARRISON]: { earnedAt: null } },
        // 152h banked — one more 8h day completes the 160h track.
        [`cnmh_training_${TRAINEE_ID}`]: { tracks: [shieldBlockTrack(152)] },
      },
    });

    await page.goto(`/character/${TRAINEE_ID}`);
    await expectSheet(page, TRAINEE_NAME);
    await openDowntimeTab(page);

    await page.getByRole('button', { name: 'More Training' }).click();
    await expect(page.getByText('8 / 8h allocated')).toBeVisible();
    await page.getByRole('button', { name: /Lock in/ }).click();

    // Completion is staged for the GM exactly like Earn Income: the grant payload
    // rides along so approval needs no vendor-catalog re-lookup. Nothing on the
    // character doc changes player-side.
    const results = await session.expectSent(
      'cnmh_downtimeresults_global',
      (v) => v?.entries?.length === 1,
    );
    expect(results.entries[0]).toMatchObject({
      kind: 'training',
      charId: TRAINEE_ID,
      vendorId: GARRISON,
      offeringId: 'shield-block',
      offeringName: 'Shield Block',
      status: 'pending',
    });
    expect(results.entries[0].grant).toMatchObject({
      kind: 'reaction',
      reaction: { name: 'Shield Block' },
    });

    // The finished track drops out of the player's list once queued.
    await session.expectSent(`cnmh_training_${TRAINEE_ID}`, (v) => v?.tracks?.length === 0);
    await expect(page.getByText('No active training.')).toBeVisible();
  });
});
