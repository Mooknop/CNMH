/**
 * Encounter lifecycle & turn-tracker flow — the foundation slice of the
 * encounter E2E epic (#316 / #295). Drives a seeded encounter through its phases
 * from a single player's seat and asserts the sheet reflects each transition.
 *
 * The GM / Foundry bridge owns start, begin-round, enemy turns, and end — there
 * is no such peer in an E2E run, so mockSession (#293) plays it by pushing
 * cnmh_encounter_global. The player owns their own initiative and turn submit,
 * which exercise the real app (their writes notify local subscribers, so the UI
 * updates even though the relay is mocked).
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { pcEntry, enemyEntry, encounterState, idleEncounter } from '../../helpers/encounter';

const CHAR_ID = 'e2e-fighter';
const CHAR_NAME = 'E2E Fighter';

const openEncounterTab = (page: import('@playwright/test').Page) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Encounter', exact: true })
    .click();

test.describe('Encounter lifecycle & turn tracker', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
  });

  test('setup phase: shows initiative entry and emits the rolled initiative', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_encounter_global: encounterState({
          phase: 'setup',
          order: [pcEntry(CHAR_ID, CHAR_NAME), enemyEntry('E2E Goblin', 15)],
        }),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });
    await openEncounterTab(page);

    // Active encounter → the play tab is Encounter, and setup-phase UI shows.
    await expect(page.getByRole('region', { name: 'Initiative entry' })).toBeVisible();
    await expect(page.getByText('Waiting for all players to enter initiative')).toBeVisible();
    const order = page.getByRole('region', { name: 'Encounter tracker' }).getByLabel('Initiative order');
    await expect(order).toContainText(CHAR_NAME);
    await expect(order).toContainText('E2E Goblin');

    // The player rolls initiative → the app emits an updated encounter record.
    await page.getByLabel('initiative-input').fill('18');
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => v?.order?.find((e: any) => e.charId === CHAR_ID)?.initiative === 18,
    );
  });

  test('in-progress: highlights the current turn, advances on submit, ends to exploration', async ({ page }) => {
    const order = [pcEntry(CHAR_ID, CHAR_NAME, 18), enemyEntry('E2E Goblin', 15)];
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_encounter_global: encounterState({ phase: 'in-progress', round: 1, currentTurnIndex: 0, order }),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });
    await openEncounterTab(page);

    const tracker = page.getByRole('region', { name: 'Encounter tracker' });
    await expect(tracker).toContainText('Round 1');
    await expect(tracker).toContainText(`${CHAR_NAME}'s turn`);
    // The PC's entry is the current turn.
    await expect(tracker.locator('[aria-current="true"]')).toContainText(CHAR_NAME);

    const submit = page.getByRole('button', { name: 'Submit turn' });
    await expect(submit).toBeVisible();
    await submit.click();

    // App advances the shared turn index; UI moves to the enemy's turn.
    await session.expectSent('cnmh_encounter_global', (v) => v?.currentTurnIndex === 1);
    await expect(tracker).toContainText("Enemy: E2E Goblin's turn");
    await expect(submit).toBeHidden();

    // GM advances past the enemy into round 2 (player's turn again) → ≥1 full round.
    await session.push(
      'cnmh_encounter_global',
      encounterState({ phase: 'in-progress', round: 2, currentTurnIndex: 0, order }),
    );
    await expect(tracker).toContainText('Round 2');
    await expect(tracker).toContainText(`${CHAR_NAME}'s turn`);

    // GM ends the encounter → the play tab returns to Exploration and the tracker is gone.
    await session.push('cnmh_encounter_global', idleEncounter());
    await expect(
      page.getByRole('navigation', { name: 'Character sheet sections' }).getByRole('button', { name: 'Exploration' }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Encounter tracker' })).toBeHidden();
  });
});
