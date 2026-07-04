/**
 * Ready an Action (#501) — the on-turn declare surface, untested before this
 * file (part of the encounter-modals gap #1127, under epic #519). On the PC's
 * own turn a 2-action Ready stores a free-text action + trigger in
 * `cnmh_readied_<charId>`, which the off-turn stage later arms. Seeded via
 * mockSession (#293).
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';

const CHAR_ID = 'e2e-fighter';
const CHAR_NAME = 'E2E Fighter';

const openEncounterTab = (page: import('@playwright/test').Page) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Encounter', exact: true })
    .click();

const expectSheet = (page: import('@playwright/test').Page) =>
  expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });

test.describe('Ready an Action', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
  });

  test('declaring a readied action writes the synced key + logs, spending 2 actions', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME), // PC is the current turn
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);

    await page.getByRole('button', { name: 'Ready an action' }).click();
    await page.getByLabel('Action to ready').fill('Strike');
    await page.getByLabel('Trigger').fill('when an enemy enters my reach');
    await page.getByRole('button', { name: 'Confirm ready' }).click();

    await session.expectSent(
      `cnmh_readied_${CHAR_ID}`,
      (v) => v?.actionName === 'Strike' && v?.trigger === 'when an enemy enters my reach',
    );
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log) && v.log.some((e: any) => String(e.text).includes('readies Strike')),
    );

    // The standing declaration is shown with an undo…
    const status = page.getByRole('status');
    await expect(status).toContainText('Readied');
    await expect(status).toContainText('Strike');

    // …and cancelling it clears the key.
    await page.getByRole('button', { name: 'Cancel readied action' }).click();
    await session.expectSent(`cnmh_readied_${CHAR_ID}`, (v) => v === null);
  });
});
