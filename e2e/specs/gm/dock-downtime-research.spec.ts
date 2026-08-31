/**
 * GM dock downtime pane — research topics (#1843, epic #206 S5, closing slice
 * of the dock-research train: #1839/#1840/#1841 → S1-S3, this file is its
 * first E2E coverage).
 *
 * `DockDowntimePane` (src/components/gm/DockDowntimePane.jsx) renders one card
 * per `research` collection doc (capture-only, live-DO-only — seeded here via
 * `importDocs`, never the `seed` fixture, same as `monster`/`room`/`event`)
 * over the single shared progress key `cnmh_research_global`
 * (src/utils/research.js). Fixture topic content below is entirely invented —
 * this repo is public and the research collection carries verbatim book prose
 * in real campaigns, so no Paizo text belongs in a checked-in spec.
 *
 * ANTI-METAGAMING (DockDowntimePane's own header ruling): a topic with no
 * progress entry defaults `available: false` and renders collapsed — title +
 * switch only, no sources, no bar, no tier text. Test 1 covers the GM opening
 * it from the dock itself (the switch), not a pre-seeded `available: true` —
 * that's what proves the closed state is real and not just untested.
 *
 * Two-gate shape (mirrors `gotoExplorationDock`): `gotoDowntimeDock`'s heading
 * proves the pane mounted; the topic's own card (`dock-dt-topic-<id>`) proves
 * the capture-only content actually hydrated before any interaction.
 *
 * The final test below covers Reputation (#1850). Since the #1853 redesign the
 * pane is a no-scroll shell whose left rail switches between seven views, so
 * that test needs a THIRD gate the research tests don't: Research is the
 * default view, and Reputation only exists in the DOM once its rail button has
 * been tapped (`showDowntimeView`, helpers/dock.ts). Unlike `research`,
 * `faction` is a normal seeded collection (score lives on the doc, not a synced
 * key), so it goes through the `seed` fixture like quest/lore/character. The
 * write path is optimistic + debounced (ReputationView's own header note): the
 * row updates immediately on tap, then a single commit lands ~600ms later — the
 * test asserts BOTH the immediate UI update and, via `waitForContent`, that the
 * debounced commit actually persisted to the faction doc.
 */

import { type Page } from '@playwright/test';
import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { importDocs, waitForContent } from '../../helpers/content';
import { gotoDowntimeDock, showDowntimeView } from '../../helpers/dock';
import { testId } from '../../helpers/ids';

const TOPIC_ID = testId('research');
const TOPIC_TITLE = 'E2E Echoes of the Sunken Choir';

const SOURCE_ARCHIVE = 'Sunken archive';
const SOURCE_ELDERS = 'Tidepool elders';

// Two sources with small, DIFFERENT caps — Archive maxes out first (test 3),
// Elders keeps room to spare. Tiers sit at low RP so the accrual test crosses
// one quickly and leaves a second, higher tier provably locked.
const TOPIC = {
  id: TOPIC_ID,
  title: TOPIC_TITLE,
  level: 3,
  traits: ['occult'],
  description: 'A synthetic e2e research topic — invented fantasy content, not book text.',
  sources: [
    {
      name: SOURCE_ARCHIVE,
      note: 'Pore over the archive\'s water-warped ledgers.',
      maxRp: 2,
      checks: [{ skill: 'occultism', dc: 18 }],
    },
    {
      name: SOURCE_ELDERS,
      note: 'Press the tidepool elders for half-remembered verses.',
      maxRp: 3,
      checks: [{ skill: 'diplomacy', dc: 16 }],
    },
  ],
  unlocks: [
    { rp: 2, text: 'The choir\'s first verse names a drowned shrine.' },
    { rp: 4, text: 'A second verse marks the shrine\'s hidden door.' },
  ],
};

const topicCard = (page: Page) =>
  page.getByTestId(`dock-dt-topic-${TOPIC_ID}`);

// Reputation rail (#1850, successor to this same S5 train). A faction doc is
// a normal seeded collection (unlike `research`, which is capture-only) —
// seeded here via the `seed` fixture, same as quest/lore/character. Invented
// fantasy content, same reasoning as TOPIC above (public repo).
const FACTION_ID = testId('faction');
const FACTION_NAME = 'E2E Scarnetti Consortium';
const FACTION = {
  id: FACTION_ID,
  name: FACTION_NAME,
  reputation: 9, // top edge of Neutral — one tap crosses into Friendly
  ranks: [
    { name: 'Disliked', min: -29, max: -10, effect: 'Prices rise at Consortium shops.' },
    { name: 'Neutral', min: -9, max: 9 },
    { name: 'Friendly', min: 10, max: 29, effect: 'Prices drop at Consortium shops.' },
  ],
};

const factionRow = (page: Page) => page.getByTestId(`dock-dt-faction-${FACTION_ID}`);

// `cnmh_research_global` seeded with the topic already open to the party —
// tests 2 and 3 care about accrual, not the availability toggle itself
// (that's test 1's whole point).
const openProgress = { [TOPIC_ID]: { available: true, rp: 0, perSourceRp: {} } };

test.describe('GM dock downtime pane — research (#1843, epic #206 S5)', () => {
  test.beforeEach(async ({ reset, request }) => {
    await reset();
    await importDocs(request, 'research', [TOPIC]);
  });

  test('a topic renders as a locked chip until the GM marks it available', async ({ page }) => {
    // Since the #1854 list/detail re-layout, a topic the GM hasn't opened
    // renders as a dashed chip at the bottom of the topic-list column (not a
    // detail-pane target) — the chip itself IS the availability switch, reused
    // untouched from the pre-#1854 toggle. `topicCard` (dock-dt-topic-<id>)
    // resolves to this chip before the tap and to the detail pane after — the
    // testid moves with whichever surface is the topic's current one.
    const session = await mockSession(page, {
      seed: { cnmh_playmode_global: 'downtime' },
    });
    await gotoDowntimeDock(page);

    const chip = topicCard(page);
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(TOPIC_TITLE);
    await expect(chip).toHaveAttribute('aria-checked', 'false');
    await expect(chip).toHaveAttribute('aria-label', `${TOPIC_TITLE} available to the party`);
    // Collapsed means collapsed: no sources, no progress bar, no tier text on
    // the chip — it carries the title and nothing else.
    await expect(chip).not.toContainText(SOURCE_ARCHIVE);
    await expect(chip).not.toContainText(SOURCE_ELDERS);
    await expect(chip).not.toContainText('research points');

    await chip.click();
    await session.expectSent('cnmh_research_global', (v) => v?.[TOPIC_ID]?.available === true);

    // Now the only open topic — it's auto-selected and the SAME testid now
    // resolves to its detail pane.
    const detail = topicCard(page);
    await expect(detail).toContainText(SOURCE_ARCHIVE);
    await expect(detail).toContainText(SOURCE_ELDERS);
    await expect(detail).toContainText('0 / 5 RP');
    const detailToggle = detail.getByRole('switch', {
      name: `${TOPIC_TITLE} available to the party`,
    });
    await expect(detailToggle).toHaveAttribute('aria-checked', 'true');
  });

  test('accruing RP from a source crosses a tier; a still-locked tier stays hidden', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_research_global: openProgress,
      },
    });
    await gotoDowntimeDock(page);
    const card = topicCard(page);
    await expect(card).toContainText('0 / 5 RP');

    const addArchive = card.getByRole('button', { name: `Add a research point to ${SOURCE_ARCHIVE}` });

    await addArchive.click();
    await session.expectSent(
      'cnmh_research_global',
      (v) => v?.[TOPIC_ID]?.perSourceRp?.[SOURCE_ARCHIVE] === 1 && v?.[TOPIC_ID]?.rp === 1,
    );
    await expect(card).toContainText('1 / 5 RP');
    // Below the first tier (2 RP) — no tier text yet.
    await expect(card).not.toContainText('drowned shrine');

    await addArchive.click();
    await session.expectSent(
      'cnmh_research_global',
      (v) => v?.[TOPIC_ID]?.perSourceRp?.[SOURCE_ARCHIVE] === 2 && v?.[TOPIC_ID]?.rp === 2,
    );
    await expect(card).toContainText('2 / 5 RP');
    // Crossed the 2 RP tier: its text appears...
    await expect(card).toContainText('The choir\'s first verse names a drowned shrine.');
    // ...but the 4 RP tier is still locked and contributes nothing but a tick.
    await expect(card).not.toContainText('hidden door');
  });

  test('a source stops accruing at its own cap while the other source keeps going', async ({ page }) => {
    await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_research_global: openProgress,
      },
    });
    await gotoDowntimeDock(page);
    const card = topicCard(page);

    const addArchive = card.getByRole('button', { name: `Add a research point to ${SOURCE_ARCHIVE}` });
    const addElders = card.getByRole('button', { name: `Add a research point to ${SOURCE_ELDERS}` });

    // Archive's maxRp is 2 — step it to its cap.
    await addArchive.click();
    await addArchive.click();
    await expect(card).toContainText(`${SOURCE_ARCHIVE}`);
    await expect(card.locator('.dock-dt-source', { hasText: SOURCE_ARCHIVE })).toContainText('2 / 2 RP');
    await expect(addArchive).toBeDisabled();

    // A further tap is a no-op (button disabled) — total RP holds at 2.
    await expect(card).toContainText('2 / 5 RP');

    // Elders is a DIFFERENT source with its own cap (3) — it still accrues.
    await addElders.click();
    await expect(card.locator('.dock-dt-source', { hasText: SOURCE_ELDERS })).toContainText('1 / 3 RP');
    await expect(card).toContainText('3 / 5 RP');
    await expect(addElders).toBeEnabled();
  });

  test('reputation: a stepper tap crosses a rank and persists to the faction doc (#1850)', async ({
    page,
    request,
    seed,
  }) => {
    await seed({ faction: [FACTION] });
    await mockSession(page, { seed: { cnmh_playmode_global: 'downtime' } });
    await gotoDowntimeDock(page);
    // Research is the default view — Reputation lives behind the rail (#1853).
    await showDowntimeView(page, 'Reputation');

    const row = factionRow(page);
    await expect(row).toBeVisible();
    await expect(row).toContainText(FACTION_NAME);
    await expect(row).toContainText('9');
    await expect(row).toContainText('Neutral');

    const raise = row.getByRole('button', { name: `Raise ${FACTION_NAME} reputation` });
    await raise.click();

    // Optimistic: the row updates immediately, before the debounced write lands.
    await expect(row).toContainText('10');
    await expect(row).toContainText('Friendly');

    // The debounced commit (~600ms after the tap) actually persisted the new
    // score to the faction doc — not just local optimism.
    await waitForContent(request, 'faction', FACTION_ID, (entry) => entry?.reputation === 10);
  });
});
