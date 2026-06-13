/**
 * Damage result surface (#319, part of #316/#295): the player-facing side of
 * combat damage — HP loss + dying/wounded, persistent-damage tracking, and the
 * Shield Block reaction. The GM/bridge deals damage; the sheet receives the
 * HP/condition state (pushed via mockSession #293) and the player runs their own
 * persistent-clear and shield-block controls.
 *
 * Shield-block / HP / degree math is unit-tested; these assert the player-facing
 * flow + synced result via written keys and deterministic log substrings.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { activeEncounter, encounterState, pcEntry, enemyEntry, readyTurnState } from '../../helpers/encounter';

const CHAR_ID = 'e2e-fighter';
const CHAR_NAME = 'E2E Fighter';
const ENTRY_ID = `e2e-${CHAR_ID}`; // matches activeEncounter()'s pc entryId

const openEncounterTab = (page: import('@playwright/test').Page) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Encounter', exact: true })
    .click();

const expectSheet = (page: import('@playwright/test').Page) =>
  expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });

test.describe('Damage result surface', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('HP loss and dying reflect on the sheet as the GM applies damage', async ({ page, seed }) => {
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5, maxHp: 50 }] });
    const session = await mockSession(page, {
      seed: { 'cnmh_hp_e2e-fighter': { current: 50, max: 50, temp: 0, dying: 0, wounded: 0, doomed: 0 } },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);

    // Stats tab is the default; HP is read-only here (applied by the GM/bridge).
    await expect(page.locator('.hp-current')).toHaveText('50');

    await session.push('cnmh_hp_e2e-fighter', { current: 8, max: 50, temp: 0, dying: 0, wounded: 0, doomed: 0 });
    await expect(page.locator('.hp-current')).toHaveText('8');

    await session.push('cnmh_hp_e2e-fighter', { current: 0, max: 50, temp: 0, dying: 1, wounded: 0, doomed: 0 });
    await expect(page.locator('.hp-current')).toHaveText('0');
    await expect(page.locator('.hp-dying')).toContainText('Dying 1');
  });

  test('persistent damage: the chip shows in the turn tracker and the player can clear it', async ({ page, seed }) => {
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        cnmh_persistent_global: { [ENTRY_ID]: [{ id: 'p1', dice: '1d6', type: 'fire' }] },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);

    const chip = page.getByRole('button', { name: `${CHAR_NAME}: 1d6 persistent fire` });
    await expect(chip).toBeVisible();
    await chip.click();

    const popover = page.getByRole('dialog', { name: `Persistent damage on ${CHAR_NAME}` });
    // The popover overlays the order strip (which wins the hit-test), so dispatch
    // the click straight to the button rather than fighting the z-order.
    await popover.getByRole('button', { name: 'Flat check passed' }).dispatchEvent('click');

    await session.expectSent('cnmh_persistent_global', (v) => !(v?.[ENTRY_ID]?.length));
    await expect(chip).toBeHidden();
  });

  test('shield block: a raised shield blocks incoming damage and records the result', async ({ page, seed }) => {
    await seed({
      item: [{ id: 'e2e-shield', name: 'E2E Shield', shield: { hp: 20, hardness: 5, bonus: 2, brokenThreshold: 10 } }],
      character: [{
        id: CHAR_ID,
        name: CHAR_NAME,
        level: 5,
        inventory: [{ ref: 'e2e-shield', quantity: 1, uid: 'uid-shield-1' }],
      }],
    });
    const session = await mockSession(page, {
      seed: {
        // Enemy's turn (not the PC's): a turn-start reset would lower a raised
        // shield, and Shield Block is a reaction used on another creature's turn.
        cnmh_encounter_global: encounterState({
          phase: 'in-progress',
          round: 1,
          currentTurnIndex: 1,
          order: [pcEntry(CHAR_ID, CHAR_NAME, 18), enemyEntry('E2E Goblin', 15)],
        }),
        'cnmh_loadout_e2e-fighter': { 'uid-shield-1': { state: 'held1' } },
        'cnmh_shieldraise_e2e-fighter': { raised: true, uid: 'uid-shield-1', ts: 1 },
        'cnmh_turnstate_e2e-fighter': readyTurnState(),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);

    await page.getByLabel('Shield Block damage').fill('10');
    await page.getByRole('button', { name: 'Shield Block', exact: true }).click();

    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log) && v.log.some((e: any) => String(e.text).includes('Shield Blocked')),
    );
    await session.expectSent('cnmh_shieldstate_e2e-fighter', (v) => v?.['uid-shield-1']?.hp !== undefined);
  });
});
