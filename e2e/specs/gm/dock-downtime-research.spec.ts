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
 */

import { type Page } from '@playwright/test';
import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { importDocs } from '../../helpers/content';
import { gotoDowntimeDock } from '../../helpers/dock';
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

// `cnmh_research_global` seeded with the topic already open to the party —
// tests 2 and 3 care about accrual, not the availability toggle itself
// (that's test 1's whole point).
const openProgress = { [TOPIC_ID]: { available: true, rp: 0, perSourceRp: {} } };

test.describe('GM dock downtime pane — research (#1843, epic #206 S5)', () => {
  test.beforeEach(async ({ reset, request }) => {
    await reset();
    await importDocs(request, 'research', [TOPIC]);
  });

  test('a topic renders collapsed until the GM marks it available', async ({ page }) => {
    const session = await mockSession(page, {
      seed: { cnmh_playmode_global: 'downtime' },
    });
    await gotoDowntimeDock(page);

    const card = topicCard(page);
    await expect(card).toBeVisible();
    await expect(card).toContainText(TOPIC_TITLE);
    await expect(card).toContainText('Not yet open to the party.');
    // Collapsed means collapsed: no sources, no progress bar, no tier text.
    await expect(card).not.toContainText(SOURCE_ARCHIVE);
    await expect(card).not.toContainText(SOURCE_ELDERS);
    await expect(card).not.toContainText('research points');

    const toggle = card.getByRole('switch', { name: `${TOPIC_TITLE} available to the party` });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    await toggle.click();
    await session.expectSent('cnmh_research_global', (v) => v?.[TOPIC_ID]?.available === true);

    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(card).not.toContainText('Not yet open to the party.');
    await expect(card).toContainText(SOURCE_ARCHIVE);
    await expect(card).toContainText(SOURCE_ELDERS);
    await expect(card).toContainText('0 / 5 RP');
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
});
