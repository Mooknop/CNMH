/**
 * Combat stances (#224) — an encounter-mode surface with no E2E before this
 * file (part of the untested encounter-modals gap under epic #519). Entering a
 * Stance-trait action writes the synced `cnmh_stance_<charId>` and spends the
 * action; the EffectsPanel on the Stats tab is the voluntary-leave path; only
 * one stance is active at a time (entering overwrites). Seeded via mockSession
 * (#293) — the stance key is the assertion surface.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';

const CHAR_ID = 'e2e-fighter';
const CHAR_NAME = 'E2E Fighter';
const STANCE_KEY = `cnmh_stance_${CHAR_ID}`;

// A Stance-trait action renders as a tappable tile in the action grid; handleUse
// routes any Stance trait straight to enter (no modal/roll).
const stanceAction = (name: string) => ({
  name,
  actions: '1',
  traits: ['Stance'],
  description: `Enter ${name}.`,
});

const openEncounterTab = (page: import('@playwright/test').Page) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Encounter', exact: true })
    .click();

const openStatsTab = (page: import('@playwright/test').Page) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Stats', exact: true })
    .click();

const expectSheet = (page: import('@playwright/test').Page) =>
  expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });

test.describe('Combat stances', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('entering a stance writes the synced key + logs; leaving it clears', async ({ page, seed }) => {
    await seed({
      character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5, actions: [stanceAction('E2E Dragon Stance')] }],
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);

    // Stances are character actions → the deck's Actions segment.
    await page.getByRole('tab', { name: 'Actions' }).click();
    await page.getByRole('button', { name: /E2E Dragon Stance/ }).click();
    await page.getByRole('button', { name: /^Confirm / }).click();

    // The stance goes live on the synced key…
    await session.expectSent(
      STANCE_KEY,
      (v) => v?.active === true && v?.name === 'E2E Dragon Stance',
    );
    // …and the entry is logged on the encounter record.
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log) && v.log.some((e: any) => String(e.text).includes('entered E2E Dragon Stance')),
    );

    // The EffectsPanel (Stats tab) is the voluntary-leave path.
    await openStatsTab(page);
    await page.getByRole('button', { name: 'Leave E2E Dragon Stance' }).click();
    await session.expectSent(STANCE_KEY, (v) => v?.active === false);
  });

  test('entering a second stance overwrites the first — only one at a time', async ({ page, seed }) => {
    await seed({
      character: [{
        id: CHAR_ID,
        name: CHAR_NAME,
        level: 5,
        actions: [stanceAction('E2E Dragon Stance'), stanceAction('E2E Mountain Stance')],
      }],
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);

    // Stances are character actions → the deck's Actions segment.
    await page.getByRole('tab', { name: 'Actions' }).click();
    await page.getByRole('button', { name: /E2E Dragon Stance/ }).click();
    await page.getByRole('button', { name: /^Confirm / }).click();
    await session.expectSent(STANCE_KEY, (v) => v?.name === 'E2E Dragon Stance');

    await page.getByRole('button', { name: /E2E Mountain Stance/ }).click();
    await page.getByRole('button', { name: /^Confirm / }).click();
    await session.expectSent(STANCE_KEY, (v) => v?.active === true && v?.name === 'E2E Mountain Stance');
  });
});
