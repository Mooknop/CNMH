/**
 * Downtime Crafting + Augment Gear (#593 cost split, #1191 hour-bank, #1202 U2
 * augmentations) — the player-facing life of a craft project, from "start it" to
 * "hand it to the GM".
 *
 * Both panels live on the mode-aware Downtime tab and share ONE synced key,
 * `cnmh_craftprojects_<charId>` — Augment Gear tags its entries `kind:'augment'`
 * so the DowntimeAllocator's Crafting hour-bank accrues them while the Crafting
 * Projects list filters them out. That shared-key/split-panel arrangement is what
 * most of these boxes are really about:
 *
 *   - Start: the project lands with its ref/level/threshold AND the money math
 *     (costCp / paidCp / remainingCp), with half the Price debited from gold.
 *   - Progress: days on the Crafting slider become banked hours at lock-in, and
 *     the card's `Nh / Mh` readout follows.
 *   - Completion: threshold → Craft check → Complete now → a `pending` entry on
 *     `cnmh_downtimeresults_global` (a GM review queue — NOT an item grant).
 *   - Augment Gear: its own entry point writes a `kind:'augment'` project that
 *     the Crafting Projects list refuses to show.
 *   - Cost: over-budget disables Start; an affordable grade re-enables it.
 *
 * The downtime block is seeded straight onto `cnmh_downtimeblock_global` through
 * mockSession (#293) rather than driven through the GM's start-a-period UI —
 * that path belongs to the downtime-spine spec.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { block, openDowntimeTab, budgetLine } from '../../helpers/downtime';

const CHAR_ID = 'e2e-crafter';
const CHAR_NAME = 'E2E Crafter';

const CRAFT_KEY = `cnmh_craftprojects_${CHAR_ID}`;
const GOLD_KEY = `cnmh_gold_${CHAR_ID}`;
const RESULTS_KEY = 'cnmh_downtimeresults_global';

// A two-grade item: the Moderate grade is level 6 (→ DC 22) at 35 gp, so the
// up-front half is 17.5 gp and the remainder another 17.5 — every number below
// is derived from those two.
const antidoteDoc = {
  id: 'e2e-antidote',
  name: 'E2E Antidote',
  weight: 0.1,
  variants: [
    { level: 1, label: 'Lesser', price: 3 },
    { level: 6, label: 'Moderate', price: 35 },
  ],
};

// Augment Gear needs a host in inventory and an augmentation doc that fits it.
// `shield` is what the affix classifier reads for augTarget:['shield']; the
// 0.1-Bulk light category passes because the augmentation declares no usage gate.
const targeDoc = {
  id: 'e2e-targe',
  name: 'E2E Targe',
  weight: 0.1,
  price: 1,
  shield: { hp: 12, hardness: 3, bonus: 1, brokenThreshold: 6 },
};
const coatDoc = {
  id: 'e2e-coat-of-arms',
  type: 'augmentation',
  augTarget: ['shield'],
  name: 'E2E Coat of Arms',
  price: 20,
};

const TARGE_UID = 'uid-targe-1';

// `hasCrafting` in DowntimeTab gates the whole Crafting rail (both panels, the
// allocator's Crafting slider, Move Rune) on trained Crafting — proficiency 2
// (expert) also lands on the project as `craftRank`.
const character = (inventory: object[] = []) => ({
  id: CHAR_ID,
  name: CHAR_NAME,
  level: 5,
  class: 'Fighter',
  maxHp: 50,
  ac: 18,
  skills: { crafting: { proficiency: 2 } },
  inventory,
});

// The shape CraftingProjects/DowntimeAllocator persist per project. Stated in
// full because the allocator's banking and the check stage both read fields the
// UI never shows (craftRank drives the gp/day, remainingCp the finish price).
const antidoteProject = (over: Record<string, unknown> = {}) => ({
  id: 'p-antidote',
  ref: 'e2e-antidote',
  level: 6,
  name: 'E2E Antidote (Moderate)',
  source: 'catalog-item',
  threshold: 16,
  hours: 0,
  price: 35,
  costCp: 3500,
  paidCp: 1750,
  remainingCp: 1750,
  craftRank: 2,
  status: 'in-progress',
  ...over,
});

// The two panels are siblings with identical markup (they share CraftingProjects.css)
// and both header a "+ New" button, so every interaction has to be panel-scoped.
const craftPanel = (page: Page) => page.locator('.cp-wrap').filter({ hasText: 'Crafting Projects' });
const augPanel = (page: Page) => page.locator('.cp-wrap').filter({ hasText: 'Augment Gear' });

const expectSheet = (page: Page) =>
  expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });

test.describe('Downtime crafting', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('start a project: the catalog entry lands on the project rail with its cost split', async ({
    page,
    seed,
  }) => {
    await seed({ item: [antidoteDoc], character: [character()] });

    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_downtimeblock_global: block(3),
        [GOLD_KEY]: 100,
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openDowntimeTab(page);

    const craft = craftPanel(page);
    await expect(craft).toBeVisible();
    await expect(craft.getByText('No active projects.')).toBeVisible();

    await craft.getByRole('button', { name: '+ New' }).click();
    await craft.getByRole('button', { name: 'From Catalog' }).click();
    // Content is wiped by reset() and re-seeded per test, so the catalog holds
    // exactly the docs this spec authored — the option list is deterministic.
    await craft.getByLabel('Catalog item').selectOption('e2e-antidote');
    await craft.getByLabel('Item grade').selectOption('6');

    // The up-front preview is the affordability contract: half of 35 gp.
    await expect(craft.getByText('Up-front: 17.5 gp')).toBeVisible();
    await expect(craft.getByText('(½ of 35 gp)')).toBeVisible();

    await craft.getByRole('button', { name: 'Start project' }).click();

    // Half the materials cost is debited from personal gold at start (#593)…
    await session.expectSent(GOLD_KEY, (v) => v === 82.5);
    // …and the project carries the whole money model, not just a name.
    const written = await session.expectSent(CRAFT_KEY, (v) => (v?.projects || []).length === 1);
    expect(written.projects[0]).toMatchObject({
      ref: 'e2e-antidote',
      level: 6,
      name: 'E2E Antidote (Moderate)',
      // A catalog item costs 16h of setup; a known recipe would be 8h.
      source: 'catalog-item',
      threshold: 16,
      hours: 0,
      price: 35,
      costCp: 3500,
      paidCp: 1750,
      remainingCp: 1750,
      craftRank: 2,
      status: 'in-progress',
    });

    // The card reads back the required days (16h of setup) and what is still owed.
    await expect(craft.getByText('0h / 16h')).toBeVisible();
    const meta = craft.locator('.cp-project-meta');
    await expect(meta).toContainText('Level 6');
    await expect(meta).toContainText('DC 22');
    await expect(meta).toContainText('16h (item)');
    await expect(meta).toContainText('17.5 gp left');
  });

  test('no open block: the day budget and the allocator are absent, so no day can be banked', async ({
    page,
    seed,
  }) => {
    await seed({ item: [antidoteDoc], character: [character()] });

    await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        // Deliberately NO cnmh_downtimeblock_global — the GM hasn't opened a period.
        [GOLD_KEY]: 100,
        [CRAFT_KEY]: { projects: [antidoteProject()] },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openDowntimeTab(page);

    await expect(page.getByText('Not started')).toBeVisible();
    await expect(page.getByText('The GM hasn’t started a downtime period yet.')).toBeVisible();

    // ANCHOR for the absence assertions below: the seeded project rendering is
    // proof the tab hydrated and the Crafting rail mounted, so anything still
    // missing at this point is missing by design rather than not-yet-rendered.
    const craft = craftPanel(page);
    await expect(craft.getByText('E2E Antidote (Moderate)')).toBeVisible();
    await expect(craft.getByText('0h / 16h')).toBeVisible();

    // Everything that turns days into hours is gated on `block.active`: no
    // per-character ledger, no allocator, hence no Crafting slider and no lock-in.
    await expect(page.getByRole('button', { name: /Lock in/ })).toHaveCount(0);
    await expect(page.getByLabel('Crafting days')).toHaveCount(0);
    await expect(page.getByLabel('More Crafting')).toHaveCount(0);

    // NOTE (#1620 issue text): the box expected the activity to be "unavailable"
    // without an open block. It isn't — CraftingProjects renders under DowntimeTab's
    // `hasCrafting` guard alone, so a project can still be STARTED between periods.
    // That is coherent (a project is period-independent state; only banking days
    // needs a block) so this asserts what ships rather than the issue's wording.
    await expect(craft.getByRole('button', { name: '+ New' })).toBeEnabled();
  });

  test('progress: a day on the Crafting slider banks 8h into the project at lock-in', async ({
    page,
    seed,
  }) => {
    await seed({ item: [antidoteDoc], character: [character()] });

    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_downtimeblock_global: block(3),
        [GOLD_KEY]: 100,
        [CRAFT_KEY]: { projects: [antidoteProject()] },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openDowntimeTab(page);

    await expect(page.getByText('3 days available')).toBeVisible();
    const craft = craftPanel(page);
    await expect(craft.getByText('0h / 16h')).toBeVisible();

    // One day onto Crafting. The stepper is the deterministic way to move the
    // slider (a range input's drag would depend on pixel geometry).
    await page.getByRole('button', { name: 'More Crafting' }).click();
    // The remaining-days readout follows the plan immediately (it derives from
    // the plan, not from a committed ledger).
    await expect(budgetLine(page)).toContainText('1 / 3 planned');
    await expect(budgetLine(page)).toContainText('2 free');

    // A planned day is 8 un-banked hours; with one project the default split
    // puts all of them on it, which is also what makes the plan lockable.
    await expect(page.getByText('Bank 8h across projects')).toBeVisible();
    await expect(page.getByLabel('Hours for E2E Antidote (Moderate)')).toHaveValue('8');
    await expect(page.getByText('8 / 8h allocated')).toBeVisible();

    await page.getByRole('button', { name: /Lock in/ }).click();

    // Lock-in is what actually moves hours onto the project…
    const banked = await session.expectSent(CRAFT_KEY, (v) => v?.projects?.[0]?.hours === 8);
    expect(banked.projects[0]).toMatchObject({ id: 'p-antidote', hours: 8, status: 'in-progress' });
    // …and the card's readout follows it.
    await expect(craft.getByText('8h / 16h')).toBeVisible();
    await expect(craft.getByText('0h / 16h')).toHaveCount(0);

    // The banked hours are recorded per-project so a re-lock only banks the delta,
    // and the slider can no longer drop below its banked floor.
    await session.expectSent(
      `cnmh_downtime_${CHAR_ID}`,
      (v) => v?.status === 'ready' && v?.craftApplied?.['p-antidote'] === 8,
    );
  });

  test('completion: the Craft check and Complete-now file a pending result for the GM', async ({
    page,
    seed,
  }) => {
    await seed({ item: [antidoteDoc], character: [character()] });

    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_downtimeblock_global: block(3),
        [GOLD_KEY]: 100,
        // Setup hours already met (16/16) — this box is about what happens AFTER
        // the threshold, and banking two days is the previous test's job.
        [CRAFT_KEY]: { projects: [antidoteProject({ hours: 16 })] },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openDowntimeTab(page);

    const craft = craftPanel(page);
    // At threshold the progress bar is replaced by the check prompt, carrying the
    // item's level-based DC (level 6 → 22).
    await expect(craft.getByText('Setup done — make your Craft check (DC 22)')).toBeVisible();

    await craft.getByLabel('d20 die for E2E Antidote (Moderate)').fill('15');
    await craft.getByLabel('check total for E2E Antidote (Moderate)').fill('25');
    await craft.getByRole('button', { name: 'Resolve Craft check for E2E Antidote (Moderate)' }).click();

    // 25 vs DC 22 on a natural 15 → plain success, which parks the project on a
    // finish-or-keep-working decision.
    await expect(craft.getByText('Success', { exact: true })).toBeVisible();
    const completeNow = craft.getByRole('button', { name: 'Complete E2E Antidote (Moderate) now' });
    await expect(completeNow).toContainText('Complete now (17.5 gp)');
    await completeNow.click();

    // The other half of the materials cost comes out of gold…
    await session.expectSent(GOLD_KEY, (v) => v === 82.5);
    // …and the finished project is handed to the GM review queue.
    const results = await session.expectSent(RESULTS_KEY, (v) => (v?.entries || []).length === 1);
    expect(results.entries[0]).toMatchObject({
      kind: 'crafting',
      charId: CHAR_ID,
      charName: CHAR_NAME,
      ref: 'e2e-antidote',
      level: 6,
      itemName: 'E2E Antidote (Moderate)',
      degree: 'success',
      // The result's `paidCp` is the project's FULL costCp, not its up-front
      // half — by the time it is submitted both halves have been paid.
      paidCp: 3500,
      status: 'pending',
    });

    // NOTE (#1620 issue text): the box said completion "yields the item". It does
    // not — the item grant is the GM's to make from the results queue; the player
    // side only drops the project once it has been submitted.
    await session.expectSent(CRAFT_KEY, (v) => (v?.projects || []).length === 0);
    await expect(craft.getByText('No active projects.')).toBeVisible();
  });

  test('augment gear: its own entry point writes a kind:augment project the Crafting list refuses', async ({
    page,
    seed,
  }) => {
    await seed({
      item: [targeDoc, coatDoc],
      character: [character([{ ref: 'e2e-targe', quantity: 1, uid: TARGE_UID }])],
    });

    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_downtimeblock_global: block(3),
        [GOLD_KEY]: 100,
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openDowntimeTab(page);

    const aug = augPanel(page);
    await expect(aug).toBeVisible();
    await expect(aug.getByText('No gear being augmented.')).toBeVisible();

    await aug.getByRole('button', { name: '+ New' }).click();
    await aug.getByLabel('Augment host').selectOption(TARGE_UID);
    // `exact` because "Augmentation" also prefixes the "Augmentation choice"
    // select this augmentation happens not to need.
    await aug.getByLabel('Augmentation', { exact: true }).selectOption('e2e-coat-of-arms');
    // Unlike Crafting's half-now/half-later split, an augmentation is paid in full.
    await expect(aug.getByText('20 gp up front')).toBeVisible();

    await aug.getByRole('button', { name: 'Start (1 day)' }).click();

    await session.expectSent(GOLD_KEY, (v) => v === 80);
    const written = await session.expectSent(CRAFT_KEY, (v) => (v?.projects || []).length === 1);
    expect(written.projects[0]).toMatchObject({
      kind: 'augment',
      hostUid: TARGE_UID,
      hostName: 'E2E Targe',
      augRef: 'e2e-coat-of-arms',
      augName: 'E2E Coat of Arms',
      hours: 0,
      // A flat crafting day, and no Craft check at all.
      threshold: 8,
      price: 20,
      status: 'in-progress',
    });

    // It shows on the augment rail…
    await expect(aug.getByRole('list', { name: 'Augmentation projects' })).toContainText('E2E Coat of Arms');
    await expect(aug.getByText('0h / 8h')).toBeVisible();
    await expect(aug.getByText('A flat crafting day — no check')).toBeVisible();
    // …and NOT on the Crafting rail, even though both read the same synced key —
    // the `kind` tag is the whole separation.
    await expect(craftPanel(page).getByText('No active projects.')).toBeVisible();
  });

  test('materials cost: an unaffordable grade blocks Start, an affordable one re-opens it', async ({
    page,
    seed,
  }) => {
    await seed({ item: [antidoteDoc], character: [character()] });

    await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_downtimeblock_global: block(3),
        // 10 gp: short of the Moderate grade's 17.5 up-front, ample for Lesser's 1.5.
        [GOLD_KEY]: 10,
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openDowntimeTab(page);

    const craft = craftPanel(page);
    await craft.getByRole('button', { name: '+ New' }).click();
    await craft.getByRole('button', { name: 'From Catalog' }).click();
    await craft.getByLabel('Catalog item').selectOption('e2e-antidote');
    await craft.getByLabel('Item grade').selectOption('6');

    // Over budget is a hard block, and the note says why rather than failing silently.
    await expect(craft.getByText('— over your 10 gp')).toBeVisible();
    await expect(craft.getByRole('button', { name: 'Start project' })).toBeDisabled();

    // Same item, cheaper grade: 3 gp → 1.5 up front, which 10 gp covers.
    await craft.getByLabel('Item grade').selectOption('1');
    await expect(craft.getByText('Up-front: 1.5 gp')).toBeVisible();
    await expect(craft.getByText('— over your 10 gp')).toHaveCount(0);
    await expect(craft.getByRole('button', { name: 'Start project' })).toBeEnabled();
  });
});
