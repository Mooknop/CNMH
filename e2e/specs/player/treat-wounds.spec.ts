/**
 * Battle Medicine / Treat Wounds (#224/#429) — the medic resolver, untested
 * before this file (part of the encounter-modals gap #1127, under epic #519).
 * Battle Medicine picks a target, a DC, a Medicine check (deterministic d20),
 * and a healed amount, then writes the target's HP via `cnmh_hp_<targetId>` and
 * spends the action. Seeded via mockSession (#293).
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';

const CHAR_ID = 'e2e-medic';
const CHAR_NAME = 'E2E Medic';

const openEncounterTab = (page: import('@playwright/test').Page) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Encounter', exact: true })
    .click();

const expectSheet = (page: import('@playwright/test').Page) =>
  expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });

test.describe('Battle Medicine', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      character: [{
        id: CHAR_ID,
        name: CHAR_NAME,
        level: 5,
        maxHp: 50,
        // Trained Medicine (proficiency ≥ 1) so the modal offers DCs.
        skills: { medicine: { proficiency: 1 } },
        actions: [{ name: 'Battle Medicine', actions: '1', description: 'Patch someone up mid-fight.' }],
      }],
    });
  });

  test('healing a target on a successful check writes the new HP + spends the action', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
        // The medic is hurt (10/50); healing themself is the simplest one-actor path.
        [`cnmh_hp_${CHAR_ID}`]: { current: 10, max: 50, temp: 0, dying: 0, wounded: 0, doomed: 0 },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);

    // Battle Medicine is a character action → the deck's Actions segment.
    await page.getByRole('tab', { name: 'Actions' }).click();
    await page.getByRole('button', { name: /Battle Medicine/ }).first().click();

    // Target self, lowest DC, a natural 20 (with trained Medicine at level 5 this
    // clears any offered DC → success or better), then a fixed healed amount.
    await page.getByRole('group', { name: 'Select target' }).getByRole('button', { name: CHAR_NAME }).click();
    await page.getByRole('group', { name: 'Select DC' }).getByRole('button').first().click();
    await page.getByLabel('raw d20').fill('20');
    await page.getByLabel('hp healed').fill('15');

    await page.locator('.tw-footer').getByRole('button', { name: /Battle Medicine/ }).click();

    // 10 + 15 = 25 (well under the 50 cap).
    await session.expectSent(`cnmh_hp_${CHAR_ID}`, (v) => v?.current === 25);
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log) && v.log.some((e: any) => String(e.text).includes('Battle Medicine')),
    );
  });
});
