/**
 * Hunt Prey (#223) — an encounter-mode designation with no E2E before this file
 * (second item of the encounter-modals gap #1127, under epic #519). The acting
 * PC opens the Hunt Prey modal from the action grid, picks an enemy from the
 * current encounter order, and confirms; designation writes the synced
 * `cnmh_huntprey_<charId>` (one prey at a time — re-designating overwrites) and
 * logs the entry. Seeded via mockSession (#293) — the prey key is the assertion
 * surface.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { activeEncounter, pcEntry, enemyEntry, readyTurnState } from '../../helpers/encounter';

const CHAR_ID = 'e2e-ranger';
const CHAR_NAME = 'E2E Ranger';
const PREY_KEY = `cnmh_huntprey_${CHAR_ID}`;

// A "Hunt Prey" action tile routes (by exact name) to the Hunt Prey modal.
const huntPreyAction = { name: 'Hunt Prey', actions: '1', description: 'Designate your prey.' };

const openEncounterTab = (page: import('@playwright/test').Page) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Encounter', exact: true })
    .click();

const expectSheet = (page: import('@playwright/test').Page) =>
  expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });

// The prey list inside the modal (scoped so enemy chips don't collide with the
// turn-tracker order strip, which also lists enemy names).
const preyList = (page: import('@playwright/test').Page) =>
  page.getByRole('group', { name: 'Select prey' });

test.describe('Hunt Prey', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5, actions: [huntPreyAction] }],
    });
  });

  test('designating an enemy writes the synced prey key + logs, spending the action', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, {
          order: [pcEntry(CHAR_ID, CHAR_NAME, 20), enemyEntry('E2E Goblin', 15)],
        }),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);

    // Tile opens the modal; only the enemy in the order is offered as prey.
    await page.getByRole('button', { name: /Hunt Prey/ }).click();
    await expect(preyList(page).getByRole('button', { name: 'E2E Goblin' })).toBeVisible();

    await preyList(page).getByRole('button', { name: 'E2E Goblin' }).click();
    await page.getByRole('button', { name: 'Hunt Prey (1 act)', exact: true }).click();

    await session.expectSent(
      PREY_KEY,
      (v) => v?.targetName === 'E2E Goblin' && !!v?.targetKey,
    );
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log) && v.log.some((e: any) => String(e.text).includes('designated E2E Goblin as prey')),
    );
  });

  test('re-designating a different enemy overwrites the prey — one at a time', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, {
          order: [pcEntry(CHAR_ID, CHAR_NAME, 20), enemyEntry('E2E Goblin', 15), enemyEntry('E2E Orc', 12)],
        }),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);

    await page.getByRole('button', { name: /Hunt Prey/ }).click();
    await preyList(page).getByRole('button', { name: 'E2E Goblin' }).click();
    await page.getByRole('button', { name: 'Hunt Prey (1 act)', exact: true }).click();
    await session.expectSent(PREY_KEY, (v) => v?.targetName === 'E2E Goblin');

    // Reopen and pick the other enemy — the single designation moves.
    await page.getByRole('button', { name: /Hunt Prey/ }).click();
    await preyList(page).getByRole('button', { name: 'E2E Orc' }).click();
    await page.getByRole('button', { name: 'Hunt Prey (1 act)', exact: true }).click();
    await session.expectSent(PREY_KEY, (v) => v?.targetName === 'E2E Orc');
  });
});
