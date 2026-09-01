/**
 * GM dock downtime pane — redesigned view coverage (#1861, wave-4 slice of the
 * #1853 no-scroll redesign whose seven views shipped across #1862-#1869).
 *
 * `dock-downtime-research.spec.ts` already covers Research's accrual math and
 * Reputation's stepper/persistence; this file is the rest of the redesign:
 *
 *   1. Rail navigation — all seven buttons exist with `aria-pressed` semantics
 *      and switching lands on each view's own heading (`showDowntimeView`
 *      already proves this per-call; this test proves it end-to-end and
 *      checks the PREVIOUSLY active button actually released its pressed
 *      state, which no existing spec does).
 *   2. The redesign's own acceptance clause, verbatim from the design
 *      handoff's "non-negotiable constraint: no scrolling" section: at the
 *      dock's 1366×1024 target size, no element's bottom edge may exceed the
 *      dock root's and nothing may carry more scrollable content than its box
 *      shows. Checked after visiting EVERY view, with the roster/content
 *      seeded richly enough (a caster's focus+slot pips, an accrued research
 *      topic with an unlocked tier AND a locked chip, three factions, a
 *      locked-in plan, an in-progress training track, a stowed item) that an
 *      empty-state stub couldn't accidentally pass it.
 *   3. One cheap read-then-write flow per view carrying real dock logic
 *      (Period, Training, Resources, Inventory) — Ledger has none of its own
 *      (read-only, segment-tap is an explicit #1857 deferral) so it only
 *      appears in the no-overflow sweep.
 *
 * Shared roster fixture (module scope, reseeded fresh per test via
 * `beforeEach`): three PCs cover every row shape the views render —
 * E2E-Aria (a plain martial carrying a stowed item, for Inventory's give
 * flow), E2E-Bram (a plain martial with a training track, for Training's
 * +8h flow), and E2E-Wren (`casterCharacter`, for Resources' focus/slot pips).
 * Character names are hyphenated ("E2E-Aria Frostwind") rather than the usual
 * two-bare-words fixture style so `InventoryView`'s `firstNameOf` (which
 * splits on the first space) lands on a readable "E2E-Aria" instead of
 * stopping at a bare "E2E" — a wrinkle unique to a component that surfaces a
 * first name in its own UI copy ("Give to {firstName}").
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { importDocs } from '../../helpers/content';
import { gotoDowntimeDock, showDowntimeView, assertNoOverflow } from '../../helpers/dock';
import { casterCharacter } from '../../helpers/spellcasting';

const ARIA_ID = 'e2e-dtv-aria';
const ARIA_NAME = 'E2E-Aria Frostwind';
const BRAM_ID = 'e2e-dtv-bram';
const BRAM_NAME = 'E2E-Bram Locke';
const WREN_ID = 'e2e-dtv-wren';
const WREN_NAME = 'E2E-Wren Ashcombe';

const DAGGER_UID = 'uid-dtv-dagger';
const DAGGER_ITEM = { id: 'e2e-dtv-dagger', name: 'E2E Dagger', weight: 1, price: 1 };

// `abilities.strength` is load-bearing beyond flavor: calculateBulkLimit
// (src/utils/CharacterUtils.js) returns a bulk limit of 0 for a character with
// no `abilities` object at all, which would refuse the Inventory give test's
// one-Bulk dagger as "overencumbered" before it ever reaches the move logic.
const ARIA = {
  id: ARIA_ID,
  name: ARIA_NAME,
  class: 'Fighter',
  level: 5,
  maxHp: 30,
  abilities: { strength: 12 },
  inventory: [{ ref: DAGGER_ITEM.id, quantity: 1, uid: DAGGER_UID }],
};
const BRAM = {
  id: BRAM_ID,
  name: BRAM_NAME,
  class: 'Rogue',
  level: 5,
  maxHp: 26,
  abilities: { strength: 10 },
};
const WREN = casterCharacter({
  id: WREN_ID,
  name: WREN_NAME,
  level: 5,
  charClass: 'Wizard',
  slots: { 1: 2, 2: 1 },
  focus: { max: 1, current: 1 },
  extra: { maxHp: 22 },
});

// A real gameDate-shaped stamp (not the bare-literal `PERIOD` from
// helpers/downtime.ts) — the Period view's header readout runs it through
// `periodDayNumber`, which needs an actual { day, month, year } to diff
// against the clock, unlike the GM-spine spec's write-only assertions.
const CLOCK = { day: 5, month: 2, year: 4725, hour: 8, minute: 0, second: 0 };
const BLOCK_STARTED_AT = { day: CLOCK.day, month: CLOCK.month, year: CLOCK.year };
const BLOCK = { active: true, days: 5, startedAt: BLOCK_STARTED_AT };
// Aria has locked in a plan (Ledger's "Locked in" row + a colored ribbon
// segment); Bram and Wren stay in "Planning" — Ledger renders both statuses.
const ARIA_PLAN = {
  periodStartedAt: BLOCK_STARTED_AT,
  plan: { Research: 2, 'Earn Income': 1 },
  status: 'ready',
};

const TRACK_ID = 'e2e-dtv-track';
// hours < benchmarkHours so the +8h flow test has somewhere to go; the bump
// lands exactly on the benchmark, which also exercises the "just turned
// ready" bloom/Confirm-completion-enables path for free.
const BRAM_TRACK = {
  id: TRACK_ID,
  vendorId: 'house-of-blue-stones',
  offeringId: 'tiger-stance',
  hours: 8,
  benchmarkHours: 16,
  status: 'in-progress',
  startedAt: 0,
};

// Two research topics: one open with RP already past its first tier (renders
// sources, a bar, an unlocked tier row) and one never marked available
// (renders only as the locked-chip row at the bottom of the list column) —
// between them they exercise every branch of ResearchView's list column.
const TOPIC_OPEN_ID = 'e2e-dtv-topic-open';
const TOPIC_OPEN = {
  id: TOPIC_OPEN_ID,
  title: 'E2E Whispering Cairns',
  level: 4,
  traits: ['occult'],
  description: 'Invented e2e research topic for downtime-dock view coverage — not book text.',
  sources: [
    { name: 'E2E Cairn Survey', note: 'Map the cairn field.', maxRp: 3, checks: [{ skill: 'survival', dc: 17 }] },
    { name: 'E2E Old Ledgers', note: 'Cross-reference old surveys.', maxRp: 3, checks: [{ skill: 'society', dc: 16 }] },
  ],
  unlocks: [
    { rp: 2, text: 'E2E: the cairns align to a buried structure.' },
    { rp: 5, text: 'E2E: the structure has a sealed door.' },
  ],
};
const TOPIC_LOCKED_ID = 'e2e-dtv-topic-locked';
const TOPIC_LOCKED = {
  id: TOPIC_LOCKED_ID,
  title: 'E2E Sunken Vaults',
  level: 6,
  traits: ['arcane'],
  description: 'Invented e2e research topic, not yet open to the party — not book text.',
  sources: [{ name: 'E2E Vault Rumors', note: 'Ask around.', maxRp: 2, checks: [{ skill: 'diplomacy', dc: 18 }] }],
  unlocks: [{ rp: 2, text: 'E2E: the vault has a second entrance.' }],
};
const RESEARCH_PROGRESS = {
  [TOPIC_OPEN_ID]: { available: true, rp: 2, perSourceRp: { 'E2E Cairn Survey': 2 } },
};

// Three factions spanning all three badge tones (positive/negative/neutral),
// each on the default GMG ladder (no authored `ranks`) — the redesign's one
// genuinely new visual primitive (ReputationLadder).
const FACTION_A = { id: 'e2e-dtv-faction-a', name: 'E2E Sunmarch Guild', reputation: 20 };
const FACTION_B = { id: 'e2e-dtv-faction-b', name: 'E2E Ashgate Cartel', reputation: -18 };
const FACTION_C = { id: 'e2e-dtv-faction-c', name: 'E2E Tidewatch Circle', reputation: 2 };

const RAIL_LABELS = ['Research', 'Reputation', 'Period', 'Ledger', 'Training', 'Inventory', 'Resources'];

const invCol = (page: Page, charId: string) => page.getByTestId(`dock-dt-inv-col-${charId}`);

test.describe('GM dock downtime pane — redesigned views (#1861)', () => {
  test.beforeEach(async ({ reset, request, seed }) => {
    await reset();
    await seed({ character: [ARIA, BRAM, WREN], item: [DAGGER_ITEM] });
    await importDocs(request, 'research', [TOPIC_OPEN, TOPIC_LOCKED]);
  });

  test('rail navigation: all seven views are reachable and aria-pressed tracks the active one', async ({ page }) => {
    await mockSession(page, { seed: { cnmh_playmode_global: 'downtime' } });
    await gotoDowntimeDock(page);

    const rail = page.getByRole('navigation', { name: 'Downtime views' });
    const railButton = (label: string) => rail.getByRole('button', { name: new RegExp(`^${label}`) });

    for (const label of RAIL_LABELS) {
      await expect(railButton(label)).toBeVisible();
    }
    // Research is the default view (DockDowntimePane's DEFAULT_VIEW).
    await expect(railButton('Research')).toHaveAttribute('aria-pressed', 'true');
    for (const label of RAIL_LABELS.slice(1)) {
      await expect(railButton(label)).toHaveAttribute('aria-pressed', 'false');
    }

    // Switching to each other view in turn: it gains aria-pressed AND every
    // sibling (starting with the previously-active one) releases it.
    for (const label of RAIL_LABELS.slice(1)) {
      await showDowntimeView(page, label);
      for (const other of RAIL_LABELS) {
        await expect(railButton(other)).toHaveAttribute('aria-pressed', other === label ? 'true' : 'false');
      }
    }
  });

  test('no view scrolls at the dock\'s 1366×1024 target size (#1861 acceptance clause)', async ({ page, seed }) => {
    await page.setViewportSize({ width: 1366, height: 1024 });
    await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_clock_global: CLOCK,
        cnmh_downtimeblock_global: BLOCK,
        cnmh_research_global: RESEARCH_PROGRESS,
        [`cnmh_downtime_${ARIA_ID}`]: ARIA_PLAN,
        [`cnmh_training_${BRAM_ID}`]: { tracks: [BRAM_TRACK] },
        [`cnmh_hp_${ARIA_ID}`]: { current: 15, max: 30, temp: 0, dying: 0, wounded: 0, doomed: 0 },
      },
    });
    await seed({ faction: [FACTION_A, FACTION_B, FACTION_C] });
    await gotoDowntimeDock(page);

    // Research is already on screen (the default view) — the second gate
    // (mirrors dock-downtime-research.spec.ts's topicCard) proves the
    // capture-only research content actually hydrated, not just the pane.
    await expect(page.getByTestId(`dock-dt-topic-${TOPIC_OPEN_ID}`)).toContainText(TOPIC_OPEN.title);
    await assertNoOverflow(page, 'Research');

    for (const label of RAIL_LABELS.slice(1)) {
      await showDowntimeView(page, label);
      await assertNoOverflow(page, label);
    }
  });

  test('Period: raising days granted and committing updates the header\'s Day x / y readout', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_clock_global: CLOCK,
        cnmh_downtimeblock_global: BLOCK,
      },
    });
    await gotoDowntimeDock(page);
    await showDowntimeView(page, 'Period');

    // Elapsed time is zero (the clock sits exactly on startedAt), so the
    // header opens on day 1 of the 5-day block, regardless of view.
    await expect(page.locator('.dock-dt-period-day')).toHaveText('Day 1 / 5');

    await page.getByRole('button', { name: 'Increase days granted' }).click();
    await page.getByRole('button', { name: 'Increase days granted' }).click();
    await expect(page.locator('.dock-dt-period-days-number')).toHaveText('7');

    await page.getByRole('button', { name: 'Update' }).click();
    await session.expectSent('cnmh_downtimeblock_global', (v) => v?.days === 7 && v?.active === true);

    // Same period (Update never re-stamps startedAt, #1624) — day count still
    // reads 1, just against the new, larger budget.
    await expect(page.locator('.dock-dt-period-day')).toHaveText('Day 1 / 7');
  });

  test('Training: banking +8h crosses the benchmark and the readout/confirm button react', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        [`cnmh_training_${BRAM_ID}`]: { tracks: [BRAM_TRACK] },
      },
    });
    await gotoDowntimeDock(page);
    await showDowntimeView(page, 'Training');

    const card = page.getByTestId(`dock-dt-train-${BRAM_ID}`);
    await expect(card).toContainText('8h / 16h');
    await expect(card.getByRole('button', { name: `Confirm completion for ${BRAM_NAME}` })).toHaveCount(0);
    await expect(card.getByRole('button', { name: `No track ready for ${BRAM_NAME}` })).toBeDisabled();

    await card.getByRole('button', { name: `Add 8 hours for ${BRAM_NAME}` }).click();
    await session.expectSent(
      'cnmh_training_' + BRAM_ID,
      (v) => v?.tracks?.[0]?.id === TRACK_ID && v.tracks[0].hours === 16,
    );

    await expect(card).toContainText('✓ ready');
    await expect(card).not.toContainText('8h / 16h');
    const confirm = card.getByRole('button', { name: `Confirm completion for ${BRAM_NAME}` });
    await expect(confirm).toBeEnabled();
    await expect(confirm).toHaveText('Confirm completion');
  });

  test('Resources: the HP stepper nudges the value and the bar', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        [`cnmh_hp_${ARIA_ID}`]: { current: 15, max: 30, temp: 0, dying: 0, wounded: 0, doomed: 0 },
      },
    });
    await gotoDowntimeDock(page);
    await showDowntimeView(page, 'Resources');

    const row = page.getByTestId(`dock-dt-res-${ARIA_ID}`);
    await expect(row.locator('.dock-dt-res-hp-value')).toHaveText('15 / 30');
    // Below the > 0.3 threshold's upper band and above its floor — the 50%
    // bar reads "gold", the tone class this seed is chosen to hit.
    await expect(row.locator('.dock-dt-res-bar')).toHaveClass(/dock-dt-res-bar--gold/);

    await row.getByRole('button', { name: `Restore 5 HP to ${ARIA_NAME}` }).click();
    await session.expectSent('cnmh_hp_' + ARIA_ID, (v) => v?.current === 20);

    await expect(row.locator('.dock-dt-res-hp-value')).toHaveText('20 / 30');
    // > 0.6 of max now — the bar's tone crosses into verdant.
    await expect(row.locator('.dock-dt-res-bar')).toHaveClass(/dock-dt-res-bar--verdant/);
  });

  test('Inventory: selecting an item activates a destination and giving it moves the item across columns', async ({ page }) => {
    await mockSession(page, { seed: { cnmh_playmode_global: 'downtime' } });
    await gotoDowntimeDock(page);
    await showDowntimeView(page, 'Inventory');

    const ariaCol = invCol(page, ARIA_ID);
    const bramCol = invCol(page, BRAM_ID);
    const dagger = ariaCol.getByTestId(`dock-dt-inv-item-${DAGGER_UID}`);
    const bramGive = bramCol.getByTestId(`dock-dt-inv-give-${BRAM_ID}`);

    await expect(dagger).toBeVisible();
    // Nothing held yet: every destination button is inert instructional copy.
    await expect(bramGive).toBeDisabled();
    await expect(bramGive).toHaveText('Tap an item to move it');
    await expect(page.locator('.dock-dt-inv-bar-item--none')).toHaveText('nothing selected');

    await dagger.click();
    await expect(page.locator('.dock-dt-inv-bar-item')).toHaveText(DAGGER_ITEM.name);
    await expect(dagger).toHaveClass(/dock-dt-inv-item--on/);
    // Aria's OWN column never offers itself as a destination for its own
    // selection — only Bram's and Wren's columns activate.
    await expect(ariaCol.getByTestId(`dock-dt-inv-give-${ARIA_ID}`)).toBeDisabled();
    await expect(bramGive).toBeEnabled();
    await expect(bramGive).toHaveText(`Give to ${BRAM_NAME.split(' ')[0]}`);

    await bramGive.click();

    // The move mints a fresh uid at the recipient (utils/inventoryTransfer's
    // `reuid`), so the two sides are asserted by NAME, scoped to each column —
    // the same pattern e2e/specs/player/transfers.spec.ts uses for the same
    // reason.
    await expect(ariaCol.locator('.dock-dt-inv-item-name', { hasText: DAGGER_ITEM.name })).toHaveCount(0);
    await expect(bramCol.locator('.dock-dt-inv-item-name', { hasText: DAGGER_ITEM.name })).toBeVisible();
    await expect(page.locator('.dock-dt-inv-bar-item--none')).toHaveText('nothing selected');
  });
});
