/**
 * GM dashboard live controls (#322, part of #295) — the GM side of the synced
 * state players receive in #318–321. Each control writes a synced key, so the
 * relay is mocked (mockSession #293) and the write asserted via expectSent.
 * Desktop-only (GM Tools has no responsive layout).
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';

const CHAR_ID = 'e2e-fighter';
const CHAR_NAME = 'E2E Fighter';

test.describe('GM dashboard controls', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
  });

  test('play mode toggle writes cnmh_playmode_global', async ({ page }) => {
    const session = await mockSession(page, { seed: { cnmh_playmode_global: 'exploration' } });
    await page.goto('/gm');

    await page.getByRole('group', { name: 'Play mode' }).getByRole('button', { name: 'Downtime' }).click();
    await session.expectSent('cnmh_playmode_global', (v) => v === 'downtime');
  });

  test('advance time writes cnmh_clock_global', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_clock_global: { day: 5, month: 2, year: 4725, hour: 8, minute: 0, second: 0 },
      },
    });
    await page.goto('/gm');

    await page.getByRole('button', { name: '+1 hr' }).click();
    await session.expectSent('cnmh_clock_global', (v) => v?.hour === 9);
  });

  test('Adjust HP writes the character HP', async ({ page }) => {
    const session = await mockSession(page, {
      seed: { 'cnmh_hp_e2e-fighter': { current: 50, max: 50, temp: 0, dying: 0, wounded: 0, doomed: 0 } },
    });
    await page.goto('/gm');

    await page.getByRole('button', { name: 'Adjust character HP' }).click();
    await page.getByLabel('select character').selectOption(CHAR_ID);
    await page.getByRole('button', { name: 'Damage', exact: true }).click();
    await page.getByLabel('hp amount').fill('10');
    await page.getByRole('button', { name: 'Apply damage' }).click();

    await session.expectSent('cnmh_hp_e2e-fighter', (v) => v?.current === 40);
  });

  test('Apply Effect pushes an effect to the character', async ({ page, seed }) => {
    await seed({ effect: [{ id: 'e2e-buff', name: 'E2E Buff', description: 'A test buff.', modifiers: [] }] });
    const session = await mockSession(page, { seed: {} });
    await page.goto('/gm');

    await page.getByRole('button', { name: 'Apply Effect to character' }).click();
    await page.getByLabel('effect-target').selectOption(CHAR_ID);
    await page.getByRole('button', { name: /E2E Buff/ }).click();

    await session.expectSent(
      'cnmh_effects_e2e-fighter',
      (v) => Array.isArray(v) && v.some((e: any) => e.effectId === 'e2e-buff'),
    );
  });
});
