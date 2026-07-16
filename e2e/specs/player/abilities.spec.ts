/**
 * Spell/ability resolution, sustained spells, auras & conditions (#320, the
 * combat capstone of #316/#295). Player-driven encounter surfaces, seeded via
 * mockSession (#293) where synced state is involved.
 *
 * Cost/degree math is unit-tested; these assert the player-facing flow + the
 * synced result via deterministic log substrings / written keys.
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

test.describe('Abilities, sustains, auras & conditions', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('use an ability: confirm logs the use', async ({ page, seed }) => {
    await seed({
      character: [{
        id: CHAR_ID,
        name: CHAR_NAME,
        level: 5,
        actions: [{ name: 'E2E Battle Cry', actions: '1', description: 'A rallying shout.' }],
      }],
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        'cnmh_turnstate_e2e-fighter': readyTurnState(),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);

    // Character abilities live in the deck's Actions segment; tapping the tile
    // goes straight to the resolver (no description step).
    await page.getByRole('tab', { name: 'Actions' }).click();
    await page.getByRole('button', { name: /E2E Battle Cry/ }).click();
    await page.getByLabel('confirm-cast').click();

    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log) && v.log.some((e: any) => String(e.text).includes('E2E Battle Cry')),
    );
  });

  test('sustained spell: sustain keeps one, submitting lapses the rest', async ({ page, seed }) => {
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME), // round 1, PC current
        'cnmh_turnstate_e2e-fighter': readyTurnState(),
        'cnmh_sustains_e2e-fighter': [
          { id: 'keep', spellName: 'E2E Bless', lastSustainedRound: 0 },
          { id: 'forget', spellName: 'E2E Mirror Image', lastSustainedRound: 0 },
        ],
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);

    await page.getByRole('button', { name: 'Sustain E2E Bless' }).click();
    await session.expectSent(
      'cnmh_sustains_e2e-fighter',
      (v) => Array.isArray(v) && v.find((s: any) => s.id === 'keep')?.lastSustainedRound === 1,
    );

    await page.getByRole('button', { name: 'End turn' }).click();
    await session.expectSent(
      'cnmh_sustains_e2e-fighter',
      (v) => Array.isArray(v) && v.length === 1 && v[0].id === 'keep',
    );
  });

  test('kinetic aura: chip shows and Dismiss clears it', async ({ page, seed }) => {
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        'cnmh_turnstate_e2e-fighter': readyTurnState(),
        'cnmh_aura_e2e-fighter': { active: true, ts: 1 },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);

    const chip = page.getByLabel(`${CHAR_NAME}'s kinetic aura is active`);
    await expect(chip).toBeVisible();

    await page.getByRole('button', { name: 'Dismiss Aura' }).click();
    await session.expectSent('cnmh_aura_e2e-fighter', (v) => v?.active === false);
    await expect(chip).toBeHidden();
  });

  test('condition: add Frightened and remove it', async ({ page, seed }) => {
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
    // Conditions are local to the sheet (useLocalStorage) — assert the UI round-trip.
    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);

    // The tracker lives in the dial core's Conditions view; the browser
    // opens from its Add Condition chip.
    await page.getByRole('button', { name: 'Character feats and conditions' }).click();
    await page.getByRole('button', { name: /^Conditions/ }).click();
    await page.getByRole('button', { name: '+ Add Condition' }).click();
    // The shared Modal isn't role=dialog; the condition browser button is unique.
    await page.getByRole('button', { name: /Frightened/ }).click();

    const active = page.locator('.ct-active-list');
    await expect(active).toContainText('Frightened');

    await active.getByTitle('Remove condition').click();
    // Both the inline tracker and the still-open modal show the empty state.
    await expect(page.getByText('No active conditions.').first()).toBeVisible();
  });
});
