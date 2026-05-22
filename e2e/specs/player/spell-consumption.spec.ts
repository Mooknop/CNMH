/**
 * Spell consumption round-trip suite — player surfaces.
 *
 * Verifies that every path from the spell catalog to a player-visible surface
 * resolves correctly. Each test seeds a catalog spell + a consumer (wand,
 * scroll, staff item, or innate feat), navigates to the character sheet,
 * and asserts the spell name appears in the correct Magic sub-view.
 *
 * Also covers catalog-edit propagation: after a GM edits a spell in
 * GmSpells, a page reload on the character sheet reflects the new data.
 *
 * Runs on both desktop (chromium) and mobile (mobile-chromium) viewports
 * because player character sheets are the primary phone surface.
 */

import { test, expect } from '../../fixtures/gm';

const CHAR_ID = 'e2e-spellcaster';

/** Wait for the character sheet h1 to appear (content loaded, no redirect). */
async function waitForSheet(page: import('@playwright/test').Page, charName: string) {
  await expect(page.getByRole('heading', { name: charName, level: 1 })).toBeVisible({ timeout: 15_000 });
}

/** Navigate to the Magic tab on the character sheet. */
async function openMagic(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Magic' }).click();
}

/** Click a view-mode sub-tab within the Magic panel. */
async function openView(page: import('@playwright/test').Page, label: string) {
  await page.locator('.view-mode-btn', { hasText: label }).click();
}

/** Assert a spell name chip is visible on the page. */
async function expectSpellChip(page: import('@playwright/test').Page, spellName: string) {
  await expect(page.locator('.chip-name', { hasText: spellName })).toBeVisible({ timeout: 10_000 });
}

// Base character: has an arcane spellcasting tradition so the Magic tab always appears.
const BASE_CHAR = {
  id: CHAR_ID,
  name: 'E2E Spellcaster',
  level: 5,
  spellcasting: { tradition: 'arcane', ability: 'intelligence', proficiency: 2, spells: [] },
};

test.describe('Spell consumption on player character sheet', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  // ---------------------------------------------------------------------------
  // 1. Scroll with catalog spellRef resolves on character sheet
  // ---------------------------------------------------------------------------

  test('scroll spellRef resolves spell name in Scrolls view', async ({ page, seed }) => {
    await seed({
      spell: [{ id: 'e2e-frostbolt', name: 'E2E Frostbolt', level: 2, range: '60 feet' }],
      item: [{ id: 'scroll-of-e2e-frostbolt', name: 'Scroll of E2E Frostbolt', weight: 0, price: 0, scroll: { spellRef: 'e2e-frostbolt' } }],
      character: [{ ...BASE_CHAR, inventory: [{ ref: 'scroll-of-e2e-frostbolt', quantity: 1, uid: 'uid-scroll-1' }] }],
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page, 'E2E Spellcaster');
    await openMagic(page);
    await openView(page, 'Scrolls');
    await expectSpellChip(page, 'E2E Frostbolt');
  });

  // ---------------------------------------------------------------------------
  // 2. Wand with catalog spellRef resolves on character sheet
  // ---------------------------------------------------------------------------

  test('wand spellRef resolves spell name in Wands view', async ({ page, seed }) => {
    await seed({
      spell: [{ id: 'e2e-lightning', name: 'E2E Lightning Bolt', level: 3, range: '500 feet' }],
      item: [{ id: 'wand-of-e2e-lightning', name: 'Wand of E2E Lightning Bolt', weight: 1, price: 60, wand: { spellRef: 'e2e-lightning' } }],
      character: [{ ...BASE_CHAR, inventory: [{ ref: 'wand-of-e2e-lightning', quantity: 1, uid: 'uid-wand-1' }] }],
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page, 'E2E Spellcaster');
    await openMagic(page);
    await openView(page, 'Wands');
    await expectSpellChip(page, 'E2E Lightning Bolt');
  });

  // ---------------------------------------------------------------------------
  // 3. Staff with catalog spell ref resolves on character sheet
  // ---------------------------------------------------------------------------

  test('staff spell ref resolves in Staff view', async ({ page, seed }) => {
    await seed({
      spell: [{ id: 'e2e-ember', name: 'E2E Ember', level: 1, range: '30 feet' }],
      item: [{
        id: 'staff-of-e2e-ember',
        name: 'Staff of E2E Ember',
        weight: 1,
        price: 0,
        staff: { name: 'Staff of E2E Ember', spells: [{ ref: 'e2e-ember', rank: 1 }] },
      }],
      character: [{ ...BASE_CHAR, inventory: [{ ref: 'staff-of-e2e-ember', quantity: 1, uid: 'uid-staff-1' }] }],
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page, 'E2E Spellcaster');
    await openMagic(page);
    // Staff button label = staff.name
    await openView(page, 'Staff of E2E Ember');
    await expectSpellChip(page, 'E2E Ember');
  });

  // ---------------------------------------------------------------------------
  // 4. Innate spells from a feat appear in Innate view
  // ---------------------------------------------------------------------------

  test('innate spells from feat appear in Innate view', async ({ page, seed }) => {
    await seed({
      character: [{
        ...BASE_CHAR,
        feats: [{
          name: 'Gnome Magic',
          level: 1,
          innate: [
            { name: 'E2E Dancing Lights', level: 0, range: '120 feet' },
            { name: 'E2E Ghost Sound', level: 0, range: '30 feet' },
          ],
        }],
      }],
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page, 'E2E Spellcaster');
    await openMagic(page);
    await openView(page, 'Innate');
    await expectSpellChip(page, 'E2E Dancing Lights');
    await expectSpellChip(page, 'E2E Ghost Sound');
  });

  // ---------------------------------------------------------------------------
  // 5. Catalog edit propagates to character sheet after page reload
  // ---------------------------------------------------------------------------

  test('catalog spell rename propagates to wand display after page reload', async ({ page, seed, request }) => {
    // Seed with original spell name — the wand references it by id, not by name
    await seed({
      spell: [{ id: 'e2e-arc', name: 'E2E Arc v1', level: 2, range: '60 feet' }],
      item: [{ id: 'wand-of-e2e-arc', name: 'Wand of E2E Arc', weight: 1, price: 0, wand: { spellRef: 'e2e-arc' } }],
      character: [{ ...BASE_CHAR, inventory: [{ ref: 'wand-of-e2e-arc', quantity: 1, uid: 'uid-arc-1' }] }],
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page, 'E2E Spellcaster');
    await openMagic(page);
    await openView(page, 'Wands');
    await expectSpellChip(page, 'E2E Arc v1');

    // Rename the catalog spell (same id, new name) — simulates a GM edit in GmSpells
    const editRes = await request.post('/api/gm/seed', {
      data: {
        force: true,
        collections: {
          spell: [{ id: 'e2e-arc', name: 'E2E Arc v2', level: 2, range: '60 feet' }],
        },
      },
    });
    expect(editRes.ok()).toBe(true);

    // Reload → ContentContext re-resolves the wand's spellRef against the updated catalog
    await page.reload();
    await waitForSheet(page, 'E2E Spellcaster');
    await openMagic(page);
    await openView(page, 'Wands');
    // Chip must now show the renamed spell, not the old name
    await expectSpellChip(page, 'E2E Arc v2');
    await expect(page.locator('.chip-name', { hasText: 'E2E Arc v1' })).not.toBeVisible();
  });
});
