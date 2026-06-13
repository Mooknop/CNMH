/**
 * Player content views + lore reveal visibility (#323, the final coverage slice
 * of #295). Seed content via the real DO and assert the player-facing read pages
 * render it; verify a GM-only lore entry stays hidden from players.
 * No mockSession — these read /api/content (+ CharacterContext) directly.
 */

import { test, expect } from '../../fixtures/gm';

test.describe('Player content views', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('quests page lists seeded quests', async ({ page, seed }) => {
    await seed({
      quest: [{
        id: 'e2e-quest', title: 'E2E Find the Orb', status: 'active', priority: 'high',
        location: 'Sandpoint', giver: 'Mayor Deverin', description: 'Recover the orb.',
      }],
    });

    await page.goto('/quests');
    await expect(page.getByRole('heading', { name: 'Quests', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'E2E Find the Orb' })).toBeVisible();
  });

  test('timeline shows revealed lore and hides GM-only lore', async ({ page, seed }) => {
    await seed({
      lore: [
        { id: 'e2e-rev', title: 'E2E Revealed Age', category: 'History', dateArStart: 4700,
          summary: 'A revealed event.', content: '', related: [], tags: [], visibility: 'revealed' },
        { id: 'e2e-hid', title: 'E2E Hidden Age', category: 'History', dateArStart: 4710,
          summary: 'A secret.', content: '', related: [], tags: [], visibility: 'gm' },
      ],
    });

    await page.goto('/timeline');
    await expect(page.getByRole('heading', { name: 'History Timeline' })).toBeVisible();
    await expect(page.getByText('E2E Revealed Age')).toBeVisible();
    await expect(page.getByText('E2E Hidden Age')).toBeHidden();
  });

  test('calendar page renders', async ({ page, seed }) => {
    await seed({ calendar: [{ id: 'e2e-event', title: 'E2E Festival', type: 'holiday' }] });
    await page.goto('/calendar');
    await expect(page.getByRole('heading', { name: 'Golarion Calendar' })).toBeVisible();
  });

  test('party wealth page lists party members', async ({ page, seed }) => {
    await seed({
      character: [{
        id: 'e2e-fighter', name: 'E2E Fighter', level: 5,
        abilities: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
      }],
    });
    await page.goto('/party-wealth');
    await expect(page.getByRole('heading', { name: 'Party Wealth & Inventory' })).toBeVisible();
    await expect(page.getByText('E2E Fighter')).toBeVisible();
  });

  test('party summary page aggregates party members', async ({ page, seed }) => {
    await seed({
      character: [{
        id: 'e2e-fighter', name: 'E2E Fighter', level: 5,
        abilities: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
      }],
    });
    await page.goto('/party-summary');
    await expect(page.getByRole('heading', { name: 'Party Members' })).toBeVisible();
    // The character appears in several sections; one is enough to prove it loaded.
    await expect(page.getByText('E2E Fighter').first()).toBeVisible();
  });
});
