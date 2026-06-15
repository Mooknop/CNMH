/**
 * Spell consumption round-trip suite — player surfaces.
 *
 * Restored from Slice 4 history with the new expectOnSheet helper from
 * Slice 4.5 so a CharacterSheet redirect fails fast in ~2s with a useful
 * diagnostic instead of a 15s "h1 not found" timeout.
 *
 * Each test seeds a catalog spell + a consumer (wand, scroll, staff item, or
 * innate feat), navigates to the character sheet, and asserts the spell name
 * appears in the correct Magic sub-view. Final test verifies catalog edits
 * propagate to the character sheet on reload.
 *
 * Runs on both desktop (chromium) and mobile (mobile-chromium) viewports
 * because player character sheets are the primary phone surface.
 */

import { test, expect } from '../../fixtures/gm';
import { expectOnSheet } from '../../helpers/sheet';
import { mockSession } from '../../fixtures/session';
import { activeEncounter } from '../../helpers/encounter';

const CHAR_ID = 'e2e-spellcaster';

/** Wait for the character sheet h1 — fails fast via expectOnSheet first. */
async function waitForSheet(page: import('@playwright/test').Page, charId: string, charName: string) {
  await expectOnSheet(page, charId);
  await expect(page.getByRole('heading', { name: charName, level: 1 })).toBeVisible({ timeout: 15_000 });
}

// Spells are accessed via the MagicModal, opened from the "Cast a Spell"
// launcher in the Command Sheet action grid (ActionGrid) — which renders in the
// encounter surface. So switch to the play tab (Encounter, via the seeded active
// encounter) before opening it.
async function openMagic(page: import('@playwright/test').Page) {
  await page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Encounter', exact: true })
    .click();
  await page.getByRole('button', { name: 'Cast a Spell' }).click();
}

// MagicModal level 1 is a category grid (.magic-category-btn); selecting one
// opens the level-2 list where each spell renders an <h3 class="spell-name">.
async function openView(page: import('@playwright/test').Page, label: string) {
  await page.locator('.magic-category-btn', { hasText: label }).click();
}

async function expectSpellChip(page: import('@playwright/test').Page, spellName: string) {
  await expect(page.locator('.spell-name', { hasText: spellName })).toBeVisible({ timeout: 10_000 });
}

const BASE_CHAR = {
  id: CHAR_ID,
  name: 'E2E Spellcaster',
  level: 5,
  spellcasting: { tradition: 'arcane', ability: 'intelligence', proficiency: 2, spells: [] },
};

test.describe('Spell consumption on player character sheet', () => {
  test.beforeEach(async ({ page, reset }) => {
    await reset();
    // The Magic button lives in the encounter surface; seed an active encounter
    // through the mocked session so the play tab exposes it.
    await mockSession(page, {
      seed: { cnmh_encounter_global: activeEncounter(CHAR_ID, 'E2E Spellcaster') },
    });
  });

  test('scroll spellRef resolves spell name in Scrolls view', async ({ page, seed }) => {
    await seed({
      spell: [{ id: 'e2e-frostbolt', name: 'E2E Frostbolt', level: 2, range: '60 feet' }],
      item: [{ id: 'scroll-of-e2e-frostbolt', name: 'Scroll of E2E Frostbolt', weight: 0, price: 0, scroll: { spellRef: 'e2e-frostbolt' } }],
      character: [{ ...BASE_CHAR, inventory: [{ ref: 'scroll-of-e2e-frostbolt', quantity: 1, uid: 'uid-scroll-1' }] }],
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page, CHAR_ID, 'E2E Spellcaster');
    await openMagic(page);
    await openView(page, 'Scrolls');
    await expectSpellChip(page, 'E2E Frostbolt');
  });

  test('wand spellRef resolves spell name in Wands view', async ({ page, seed }) => {
    await seed({
      spell: [{ id: 'e2e-lightning', name: 'E2E Lightning Bolt', level: 3, range: '500 feet' }],
      item: [{ id: 'wand-of-e2e-lightning', name: 'Wand of E2E Lightning Bolt', weight: 1, price: 60, wand: { spellRef: 'e2e-lightning' } }],
      character: [{ ...BASE_CHAR, inventory: [{ ref: 'wand-of-e2e-lightning', quantity: 1, uid: 'uid-wand-1' }] }],
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page, CHAR_ID, 'E2E Spellcaster');
    await openMagic(page);
    await openView(page, 'Wands');
    await expectSpellChip(page, 'E2E Lightning Bolt');
  });

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
    await waitForSheet(page, CHAR_ID, 'E2E Spellcaster');
    await openMagic(page);
    // Staff button label = staff.name
    await openView(page, 'Staff of E2E Ember');
    await expectSpellChip(page, 'E2E Ember');
  });

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
    await waitForSheet(page, CHAR_ID, 'E2E Spellcaster');
    await openMagic(page);
    await openView(page, 'Innate');
    await expectSpellChip(page, 'E2E Dancing Lights');
    await expectSpellChip(page, 'E2E Ghost Sound');
  });

  test('catalog spell rename propagates to wand display after page reload', async ({ page, seed, request }) => {
    await seed({
      spell: [{ id: 'e2e-arc', name: 'E2E Arc v1', level: 2, range: '60 feet' }],
      item: [{ id: 'wand-of-e2e-arc', name: 'Wand of E2E Arc', weight: 1, price: 0, wand: { spellRef: 'e2e-arc' } }],
      character: [{ ...BASE_CHAR, inventory: [{ ref: 'wand-of-e2e-arc', quantity: 1, uid: 'uid-arc-1' }] }],
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page, CHAR_ID, 'E2E Spellcaster');
    await openMagic(page);
    await openView(page, 'Wands');
    await expectSpellChip(page, 'E2E Arc v1');

    // Rename catalog spell (same id, new name) — simulates GM edit
    const editRes = await request.post('/api/gm/seed', {
      data: {
        force: true,
        collections: {
          spell: [{ id: 'e2e-arc', name: 'E2E Arc v2', level: 2, range: '60 feet' }],
        },
      },
    });
    expect(editRes.ok()).toBe(true);

    // Reload → ContentContext re-resolves the wand against updated catalog
    await page.reload();
    await waitForSheet(page, CHAR_ID, 'E2E Spellcaster');
    await openMagic(page);
    await openView(page, 'Wands');
    await expectSpellChip(page, 'E2E Arc v2');
    await expect(page.locator('.spell-name', { hasText: 'E2E Arc v1' })).not.toBeVisible();
  });
});
