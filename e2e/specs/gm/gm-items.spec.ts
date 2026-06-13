/**
 * GM item catalog round-trip suite.
 *
 * Covers every item shape the GM can author:
 *  - Basic item (scalar fields, traits CSV, description)
 *  - Container (is-container toggle, capacity/ignored)
 *  - Single-object strike weapon (strikesWasObject=true — emits as plain object)
 *  - Scroll (auto-name, spell-ref from catalog, strikes editor hidden)
 *  - Wand (same scroll path, different kind key)
 *  - Staff / Artifact round-tripped through the restJson raw-JSON box
 *
 * Every mutation is asserted via both the rendered DOM and /api/content.
 *
 * Reset-free: each test uses unique IDs so data never bleeds between tests.
 *
 * Desktop-only: GM Tools has no responsive layout.
 */

import { test, expect } from '../../fixtures/gm';
import { fetchContent, findInCollection } from '../../helpers/content';
import { testId, testTitle } from '../../helpers/ids';

async function expectSaved(page: import('@playwright/test').Page) {
  await expect(page.getByRole('status')).toContainText('Changes are live', { timeout: 20_000 });
}

async function confirmTyped(page: import('@playwright/test').Page, typedValue: string, btnLabel: string) {
  await page.getByLabel('confirm-input').fill(typedValue);
  await page.getByRole('button', { name: btnLabel }).click();
}

// Matches the editor's slug derivation: lowercase, non-alnum → '-', trim edges.
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

test.describe('Item catalog editor', () => {
  // ---------------------------------------------------------------------------
  // Basic item: scalar fields + edit + delete
  // ---------------------------------------------------------------------------

  test('create, edit price, and delete a basic item', async ({ page, request }) => {
    const id = testId('sword');
    const name = testTitle('sword', id);

    await page.goto('/gm/items');

    await page.getByRole('button', { name: '+ New item' }).click();
    const form = page.getByTestId('item-form-new');
    await form.getByLabel('name', { exact: true }).fill(name);
    await form.getByLabel('price').fill('10');
    await form.getByLabel('weight').fill('1');
    await form.getByLabel('traits').fill('Martial, Sword');
    await form.getByLabel('description').fill('A sword for E2E testing.');
    await form.getByRole('button', { name: 'Create item' }).click();
    await expectSaved(page);

    await expect(page.getByTestId('item-form-new')).not.toBeVisible();
    await expect(page.getByTestId(`item-form-${id}`)).toBeVisible();

    let payload = await fetchContent(request);
    let entry = findInCollection(payload, 'item', id);
    expect(entry).toMatchObject({
      id,
      name,
      price: 10,
      weight: 1,
      traits: ['Martial', 'Sword'],
      description: 'A sword for E2E testing.',
    });

    // Edit price
    const savedForm = page.getByTestId(`item-form-${id}`);
    await savedForm.getByLabel('price').fill('20');
    await savedForm.getByRole('button', { name: 'Save' }).click();
    await expectSaved(page);

    payload = await fetchContent(request);
    entry = findInCollection(payload, 'item', id);
    expect(entry).toMatchObject({ price: 20 });

    // Delete
    await savedForm.getByRole('button', { name: 'Delete' }).click();
    await confirmTyped(page, name, 'Delete forever');
    await expectSaved(page);

    await expect(page.getByTestId(`item-form-${id}`)).not.toBeVisible();
    payload = await fetchContent(request);
    expect(findInCollection(payload, 'item', id)).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Container: is-container toggle reveals capacity/ignored
  // ---------------------------------------------------------------------------

  test('container item persists capacity and ignored bulk', async ({ page, request }) => {
    const id = testId('backpack');
    const name = testTitle('backpack', id);

    await page.goto('/gm/items');

    await page.getByRole('button', { name: '+ New item' }).click();
    const form = page.getByTestId('item-form-new');
    await form.getByLabel('name', { exact: true }).fill(name);
    await form.getByLabel('weight').fill('1');
    await form.getByLabel('is-container').check();
    await form.getByLabel('container-capacity').fill('3');
    await form.getByLabel('container-ignored').fill('2');
    await form.getByRole('button', { name: 'Create item' }).click();
    await expectSaved(page);

    await expect(page.getByTestId(`item-form-${id}`)).toBeVisible();

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'item', id);
    expect(entry).toMatchObject({
      container: { capacity: 3, ignored: 2 },
    });
  });

  // ---------------------------------------------------------------------------
  // Single-object strike weapon (strikesWasObject path)
  //
  // When a catalog item has `strikes` as a plain object (not an array), it must
  // stay as an object after a round-trip through the editor — if it became an
  // array that would break every consumer that checks `item.strikes.damage` etc.
  // ---------------------------------------------------------------------------

  test('single-object strike re-emits as plain object, not array', async ({
    page,
    request,
    seed,
  }) => {
    const pickId = testId('pick');
    await seed({
      item: [{ id: pickId, name: 'E2E Striking Pick', strikes: { damage: '1d6 P', type: 'melee' } }],
    });

    await page.goto('/gm/items');
    // Master/detail shell: select the seeded item's list row to open its form.
    await page.getByRole('button', { name: 'E2E Striking Pick' }).click();
    await expect(page.getByTestId(`item-form-${pickId}`)).toBeVisible();

    // The strikes section should show one entry (the existing single-object strike)
    const savedForm = page.getByTestId(`item-form-${pickId}`);
    await expect(savedForm.getByTestId('item-strike-0')).toBeVisible();

    // Edit the damage via the strike subform
    await savedForm.getByLabel('item-strike-0-damage').fill('2d6 P');
    await savedForm.getByRole('button', { name: 'Save' }).click();
    await expectSaved(page);

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'item', pickId);
    // Must still be a plain object — not wrapped in an array
    expect(Array.isArray((entry as any).strikes)).toBe(false);
    expect((entry as any).strikes).toMatchObject({ damage: '2d6 P', type: 'melee' });
  });

  // ---------------------------------------------------------------------------
  // Scroll: auto-name from catalog spell-ref, strikes hidden
  // ---------------------------------------------------------------------------

  test('scroll derives name from spell-ref, hides strikes section', async ({
    page,
    request,
    seed,
  }) => {
    const spellSuffix = Math.random().toString(36).slice(2, 8);
    const spellId = `fireball-${spellSuffix}`;
    const spellName = `Fireball ${spellSuffix}`;
    await seed({ spell: [{ id: spellId, name: spellName, level: 3 }] });

    await page.goto('/gm/items');

    await page.getByRole('button', { name: '+ New item' }).click();
    const form = page.getByTestId('item-form-new');

    // Switch to scroll kind
    await form.getByLabel('spell-kind').selectOption('scroll');

    // Strikes section should be hidden for spell items
    await expect(form.getByTestId('item-strikes')).not.toBeVisible();

    // Pick the spell from the spell-ref catalog select
    await form.locator('[data-testid="spell-subform"]').getByLabel('spell-ref').selectOption(spellId);

    // Preview text appears
    await expect(form.getByTestId('spell-ref-preview')).toContainText(`→ ${spellName}`);

    // Name input is disabled and auto-derived
    const scrollName = `Scroll of ${spellName}`;
    const nameInput = form.getByLabel('name', { exact: true });
    await expect(nameInput).toBeDisabled();
    await expect(nameInput).toHaveValue(scrollName);

    await form.getByRole('button', { name: 'Create item' }).click();
    await expectSaved(page);

    const scrollId = slugify(scrollName);
    await expect(page.getByTestId(`item-form-${scrollId}`)).toBeVisible();

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'item', scrollId);
    expect(entry).toMatchObject({
      id: scrollId,
      name: scrollName,
      scroll: { spellRef: spellId },
    });
    // Scrolls never author strikes in the catalog
    expect(entry).not.toHaveProperty('strikes');
  });

  // ---------------------------------------------------------------------------
  // Wand: same auto-name path as scroll, different kind key
  // ---------------------------------------------------------------------------

  test('wand derives name from spell-ref and saves as wand block', async ({
    page,
    request,
    seed,
  }) => {
    const spellSuffix = Math.random().toString(36).slice(2, 8);
    const spellId = `fireball-${spellSuffix}`;
    const spellName = `Fireball ${spellSuffix}`;
    await seed({ spell: [{ id: spellId, name: spellName, level: 3 }] });

    await page.goto('/gm/items');

    await page.getByRole('button', { name: '+ New item' }).click();
    const form = page.getByTestId('item-form-new');
    await form.getByLabel('spell-kind').selectOption('wand');
    await form.locator('[data-testid="spell-subform"]').getByLabel('spell-ref').selectOption(spellId);

    const wandName = `Wand of ${spellName}`;
    await expect(form.getByLabel('name', { exact: true })).toHaveValue(wandName);
    await expect(form.getByTestId('item-strikes')).not.toBeVisible();

    await form.getByRole('button', { name: 'Create item' }).click();
    await expectSaved(page);

    const wandId = slugify(wandName);
    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'item', wandId);
    expect(entry).toMatchObject({
      name: wandName,
      wand: { spellRef: spellId },
    });
    expect(entry).not.toHaveProperty('scroll');
  });

  // ---------------------------------------------------------------------------
  // Inline scroll spell (no spellRef — authored manually inside the details)
  // ---------------------------------------------------------------------------

  test('inline scroll spell round-trips without a catalog ref', async ({
    page,
    request,
  }) => {
    const spellSuffix = Math.random().toString(36).slice(2, 8);
    const inlineSpellName = `Custom Blast ${spellSuffix}`;
    const scrollName = `Scroll of ${inlineSpellName}`;
    const scrollId = slugify(scrollName);

    await page.goto('/gm/items');

    await page.getByRole('button', { name: '+ New item' }).click();
    const form = page.getByTestId('item-form-new');
    await form.getByLabel('spell-kind').selectOption('scroll');

    // Expand inline details and fill spell name (no spellRef selected)
    await form.locator('[data-testid="spell-inline-details"]').click(); // open <details>
    const subform = form.locator('[data-testid="spell-subform"]');
    await subform.getByLabel('spell-name').fill(inlineSpellName);
    await subform.getByLabel('spell-level').fill('2');

    // Auto-name derives from the inline spell name when no catalog ref
    await expect(form.getByLabel('name', { exact: true })).toHaveValue(scrollName);

    await form.getByRole('button', { name: 'Create item' }).click();
    await expectSaved(page);

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'item', scrollId);
    expect(entry).toMatchObject({
      name: scrollName,
      scroll: { name: inlineSpellName, level: 2 },
    });
    expect(entry).not.toHaveProperty('spellRef');
  });

  // ---------------------------------------------------------------------------
  // Staff and Artifact: mechanical blocks via restJson raw-JSON textarea
  // ---------------------------------------------------------------------------

  test('staff spell list and artifact tiers round-trip through restJson', async ({
    page,
    request,
    seed,
  }) => {
    // Seed a stable fireball spell for the staff JSON reference
    await seed({ spell: [{ id: 'fireball', name: 'Fireball', level: 3 }] });

    const id = testId('staff');
    const name = testTitle('staff', id);

    await page.goto('/gm/items');

    await page.getByRole('button', { name: '+ New item' }).click();
    const form = page.getByTestId('item-form-new');
    await form.getByLabel('name', { exact: true }).fill(name);
    await form.getByLabel('traits').fill('Magical, Staff, Artifact');

    const staffJson = JSON.stringify(
      {
        staff: { spells: [{ ref: 'fireball', rank: 3 }] },
        artifact: { tiers: [{ level: 1, grants: ['staff'] }] },
      },
      null,
      2,
    );
    await form.getByLabel('rest-json').fill(staffJson);

    await form.getByRole('button', { name: 'Create item' }).click();
    await expectSaved(page);

    await expect(page.getByTestId(`item-form-${id}`)).toBeVisible();

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'item', id);
    expect(entry).toMatchObject({
      id,
      name,
      traits: ['Magical', 'Staff', 'Artifact'],
      staff: { spells: [{ ref: 'fireball', rank: 3 }] },
      artifact: { tiers: [{ level: 1, grants: ['staff'] }] },
    });
  });
});
