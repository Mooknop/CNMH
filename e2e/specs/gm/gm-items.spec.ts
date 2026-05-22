/**
 * GM item catalog round-trip suite.
 *
 * Covers every item shape the GM can author:
 *  - Basic item (scalar fields, traits CSV, description)
 *  - Container (is-container toggle, capacity/ignored)
 *  - Single-object strike weapon (strikesWasObject=true — emits as plain object)
 *  - Scroll (auto-name, spell-ref from catalog, strikes editor hidden)
 *  - Wand (same scroll path, different kind)
 *  - Staff / Artifact round-tripped through the restJson raw-JSON box
 *
 * Every mutation is asserted via both the rendered DOM and /api/content.
 * Desktop-only: GM Tools has no responsive layout.
 */

import { test, expect } from '../../fixtures/gm';
import { fetchContent, findInCollection } from '../../helpers/content';

async function expectSaved(page: import('@playwright/test').Page) {
  await expect(page.getByRole('status')).toContainText('Changes are live', { timeout: 10_000 });
}

async function confirmTyped(page: import('@playwright/test').Page, typedValue: string, btnLabel: string) {
  await page.getByLabel('confirm-input').fill(typedValue);
  await page.getByRole('button', { name: btnLabel }).click();
}

test.describe('Item catalog editor', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  // ---------------------------------------------------------------------------
  // Basic item: scalar fields + edit + delete
  // ---------------------------------------------------------------------------

  test('create, edit price, and delete a basic item', async ({ page, request }) => {
    await page.goto('/gm/items');

    await page.getByRole('button', { name: '+ New item' }).click();
    const form = page.getByTestId('item-form-new');
    await form.getByLabel('name', { exact: true }).fill('E2E Sword');
    await form.getByLabel('price').fill('10');
    await form.getByLabel('weight').fill('1');
    await form.getByLabel('traits').fill('Martial, Sword');
    await form.getByLabel('description').fill('A sword for E2E testing.');
    await form.getByRole('button', { name: 'Create item' }).click();
    await expectSaved(page);

    await expect(page.getByTestId('item-form-new')).not.toBeVisible();
    await expect(page.getByTestId('item-form-e2e-sword')).toBeVisible();

    let payload = await fetchContent(request);
    let entry = findInCollection(payload, 'item', 'e2e-sword');
    expect(entry).toMatchObject({
      id: 'e2e-sword',
      name: 'E2E Sword',
      price: 10,
      weight: 1,
      traits: ['Martial', 'Sword'],
      description: 'A sword for E2E testing.',
    });

    // Edit price
    const savedForm = page.getByTestId('item-form-e2e-sword');
    await savedForm.getByLabel('price').fill('20');
    await savedForm.getByRole('button', { name: 'Save' }).click();
    await expectSaved(page);

    payload = await fetchContent(request);
    entry = findInCollection(payload, 'item', 'e2e-sword');
    expect(entry).toMatchObject({ price: 20 });

    // Delete
    await savedForm.getByRole('button', { name: 'Delete' }).click();
    await confirmTyped(page, 'E2E Sword', 'Delete forever');
    await expectSaved(page);

    await expect(page.getByTestId('item-form-e2e-sword')).not.toBeVisible();
    payload = await fetchContent(request);
    expect(findInCollection(payload, 'item', 'e2e-sword')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Container: is-container toggle reveals capacity/ignored
  // ---------------------------------------------------------------------------

  test('container item persists capacity and ignored bulk', async ({ page, request }) => {
    await page.goto('/gm/items');

    await page.getByRole('button', { name: '+ New item' }).click();
    const form = page.getByTestId('item-form-new');
    await form.getByLabel('name', { exact: true }).fill('E2E Backpack');
    await form.getByLabel('weight').fill('1');
    await form.getByLabel('is-container').check();
    await form.getByLabel('container-capacity').fill('3');
    await form.getByLabel('container-ignored').fill('2');
    await form.getByRole('button', { name: 'Create item' }).click();
    await expectSaved(page);

    await expect(page.getByTestId('item-form-e2e-backpack')).toBeVisible();

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'item', 'e2e-backpack');
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
    await seed({
      item: [{ id: 'e2e-pick', name: 'E2E Striking Pick', strikes: { damage: '1d6 P', type: 'melee' } }],
    });

    await page.goto('/gm/items');
    await expect(page.getByTestId('item-form-e2e-pick')).toBeVisible();

    // The strikes section should show one entry (the existing single-object strike)
    const savedForm = page.getByTestId('item-form-e2e-pick');
    await expect(savedForm.getByTestId('item-strike-0')).toBeVisible();

    // Edit the damage via the strike subform
    await savedForm.getByLabel('item-strike-0-damage').fill('2d6 P');
    await savedForm.getByRole('button', { name: 'Save' }).click();
    await expectSaved(page);

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'item', 'e2e-pick');
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
    await seed({
      spell: [{ id: 'fireball', name: 'Fireball', level: 3 }],
    });

    await page.goto('/gm/items');

    await page.getByRole('button', { name: '+ New item' }).click();
    const form = page.getByTestId('item-form-new');

    // Switch to scroll kind
    await form.getByLabel('spell-kind').selectOption('scroll');

    // Strikes section should be hidden for spell items
    await expect(form.getByTestId('item-strikes')).not.toBeVisible();

    // Pick Fireball from the spell-ref catalog select
    await form.locator('[data-testid="spell-subform"]').getByLabel('spell-ref').selectOption('fireball');

    // Preview text appears
    await expect(form.getByTestId('spell-ref-preview')).toContainText('→ Fireball');

    // Name input is disabled and auto-derived
    const nameInput = form.getByLabel('name', { exact: true });
    await expect(nameInput).toBeDisabled();
    await expect(nameInput).toHaveValue('Scroll of Fireball');

    await form.getByRole('button', { name: 'Create item' }).click();
    await expectSaved(page);

    const id = 'scroll-of-fireball';
    await expect(page.getByTestId(`item-form-${id}`)).toBeVisible();

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'item', id);
    expect(entry).toMatchObject({
      id,
      name: 'Scroll of Fireball',
      scroll: { spellRef: 'fireball' },
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
    await seed({
      spell: [{ id: 'fireball', name: 'Fireball', level: 3 }],
    });

    await page.goto('/gm/items');

    await page.getByRole('button', { name: '+ New item' }).click();
    const form = page.getByTestId('item-form-new');
    await form.getByLabel('spell-kind').selectOption('wand');
    await form.locator('[data-testid="spell-subform"]').getByLabel('spell-ref').selectOption('fireball');

    await expect(form.getByLabel('name', { exact: true })).toHaveValue('Wand of Fireball');
    await expect(form.getByTestId('item-strikes')).not.toBeVisible();

    await form.getByRole('button', { name: 'Create item' }).click();
    await expectSaved(page);

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'item', 'wand-of-fireball');
    expect(entry).toMatchObject({
      name: 'Wand of Fireball',
      wand: { spellRef: 'fireball' },
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
    await page.goto('/gm/items');

    await page.getByRole('button', { name: '+ New item' }).click();
    const form = page.getByTestId('item-form-new');
    await form.getByLabel('spell-kind').selectOption('scroll');

    // Expand inline details and fill spell name (no spellRef selected)
    await form.locator('[data-testid="spell-inline-details"]').click(); // open <details>
    const subform = form.locator('[data-testid="spell-subform"]');
    await subform.getByLabel('spell-name').fill('Custom Blast');
    await subform.getByLabel('spell-level').fill('2');

    // Auto-name derives from the inline spell name when no catalog ref
    await expect(form.getByLabel('name', { exact: true })).toHaveValue('Scroll of Custom Blast');

    await form.getByRole('button', { name: 'Create item' }).click();
    await expectSaved(page);

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'item', 'scroll-of-custom-blast');
    expect(entry).toMatchObject({
      name: 'Scroll of Custom Blast',
      scroll: { name: 'Custom Blast', level: 2 },
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
    await seed({
      spell: [{ id: 'fireball', name: 'Fireball', level: 3 }],
    });

    await page.goto('/gm/items');

    await page.getByRole('button', { name: '+ New item' }).click();
    const form = page.getByTestId('item-form-new');
    await form.getByLabel('name', { exact: true }).fill('E2E Staff');
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

    await expect(page.getByTestId('item-form-e2e-staff')).toBeVisible();

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'item', 'e2e-staff');
    expect(entry).toMatchObject({
      id: 'e2e-staff',
      name: 'E2E Staff',
      traits: ['Magical', 'Staff', 'Artifact'],
      staff: { spells: [{ ref: 'fireball', rank: 3 }] },
      artifact: { tiers: [{ level: 1, grants: ['staff'] }] },
    });
  });
});
