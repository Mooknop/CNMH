/**
 * Player character sheet coverage + GM→player live sync (#321, part of #295).
 * Covers the Stats read path (vitals, abilities, feats, skills), a key modal
 * (Daily Preparations), and the headline: a GM/bridge-driven synced change
 * reflecting on an already-open sheet with no reload (play mode + the navbar
 * clock), driven via mockSession (#293).
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';

const CHAR_ID = 'e2e-fighter';
const CHAR_NAME = 'E2E Fighter';

const expectSheet = (page: import('@playwright/test').Page) =>
  expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });

test.describe('Player character sheet', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('renders core blocks: vitals, abilities, feats, skills', async ({ page, seed }) => {
    await seed({
      character: [{
        id: CHAR_ID,
        name: CHAR_NAME,
        level: 5,
        maxHp: 50,
        ac: 22,
        abilities: { strength: 18, dexterity: 14, constitution: 16, intelligence: 10, wisdom: 12, charisma: 8 },
        feats: [{ name: 'E2E Power Attack', level: 1 }],
      }],
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);

    // Always-visible sheet header (cs-info column).
    const vitals = page.getByRole('region', { name: 'Character vitals' });
    await expect(vitals.getByLabel('Hit points')).toContainText('50');
    await expect(vitals.getByLabel('Armor class')).toContainText('22');
    await expect(page.getByRole('region', { name: 'Ability scores' })).toBeVisible();

    // Ability Dial: the core hosts character-wide proficiencies & feats.
    await page.getByRole('button', { name: 'Character proficiencies and feats' }).click();
    await page.getByRole('button', { name: 'Feats', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'E2E Power Attack' })).toBeVisible();

    // A node panel shows the skills its ability governs — Acrobatics is DEX.
    await page.getByRole('button', { name: /^Dexterity/ }).click();
    await expect(page.getByText('Acrobatics')).toBeVisible();
  });

  test('opens the Daily Preparations modal', async ({ page, seed }) => {
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);

    await page.getByRole('button', { name: /Daily Preparations/ }).click();
    await expect(page.locator('.dp-body')).toBeVisible();
  });

  test('GM→player live sync: play mode and clock update without a reload', async ({ page, seed }) => {
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_clock_global: { day: 5, month: 2, year: 4725, hour: 8, minute: 0, second: 0 },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);

    const rail = page.getByRole('navigation', { name: 'Character sheet sections' });
    await expect(rail.getByRole('button', { name: 'Exploration' })).toBeVisible();
    await expect(page.locator('.game-clock-time')).toHaveText('08:00');

    // GM switches the campaign to downtime → the mode-aware play tab relabels.
    await session.push('cnmh_playmode_global', 'downtime');
    await expect(rail.getByRole('button', { name: 'Downtime' })).toBeVisible();

    // GM advances the shared clock → the navbar updates live.
    await session.push('cnmh_clock_global', { day: 5, month: 2, year: 4725, hour: 14, minute: 30, second: 0 });
    await expect(page.locator('.game-clock-time')).toHaveText('14:30');
  });
});
