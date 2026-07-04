/**
 * Encounter door interaction (#435) — the "Interact: open/close a door" section
 * in the action grid, untested before this file (part of the encounter-modals
 * gap #1127, under epic #519). The bridge supplies the in-reach doors on
 * `cnmh_dooropts_<charId>`; toggling one writes `cnmh_doorinteract_<charId>` and
 * spends a 1-action Interact. Seeded via mockSession (#293), which stands in for
 * the bridge peer.
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

test.describe('Encounter doors', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
  });

  test('a closed door in reach can be opened — writes the interact + spends the action', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
        // The bridge's reach-filtered door list (one closed door, state 0).
        [`cnmh_dooropts_${CHAR_ID}`]: { doors: [{ wallId: 'w1', state: 0, x: 0, y: 0 }], reqTs: 1 },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);

    const section = page.locator('[aria-label="Door interaction"]');
    await expect(section).toContainText('Closed Door');

    await section.getByRole('button', { name: 'Open door' }).click();

    await session.expectSent(
      `cnmh_doorinteract_${CHAR_ID}`,
      (v) => v?.wallId === 'w1' && v?.op === 'open',
    );
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log) && v.log.some((e: any) => String(e.text).includes('opened a door')),
    );
  });

  test('an open door in reach shows a Close control instead', async ({ page }) => {
    await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
        [`cnmh_dooropts_${CHAR_ID}`]: { doors: [{ wallId: 'w2', state: 1, x: 0, y: 0 }], reqTs: 1 },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);

    const section = page.locator('[aria-label="Door interaction"]');
    await expect(section).toContainText('Open Door');
    await expect(section.getByRole('button', { name: 'Close door' })).toBeVisible();
    await expect(section.getByRole('button', { name: 'Open door' })).toHaveCount(0);
  });
});
