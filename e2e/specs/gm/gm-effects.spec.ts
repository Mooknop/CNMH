/**
 * GM Effects catalog editor (#322, part of #295). The last PageEditorShell
 * editor without coverage; mirrors gm-flat — create / edit / delete round-trips
 * through the DO and the /api/content snapshot. Desktop-only (GM Tools).
 *
 * Also covers conditional ('vs X') & negative effect modifiers (#515 / #338):
 * authoring both in the editor with a DO round-trip, and — the headline — an
 * applied effect changing the player-visible sheet numbers, not just a chip.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { fetchContent, findInCollection } from '../../helpers/content';
import { testId } from '../../helpers/ids';
import { expectOnSheet, expectSheet } from '../../helpers/sheet';

async function expectSaved(page: import('@playwright/test').Page) {
  await expect(page.getByRole('status')).toContainText('Changes are live', { timeout: 20_000 });
}

test.describe('Effect catalog editor', () => {
  test('create, edit, and delete an effect round-trips through the DO', async ({ page, request }) => {
    const id = testId('effect');
    const name = `E2E Effect ${id}`;

    await page.goto('/gm/catalog/effects');

    // --- Create ---
    await page.getByRole('button', { name: '+ New effect' }).click();
    const form = page.getByTestId('effect-form-new');
    await form.getByLabel('name').fill(name);
    await form.getByLabel('description').fill('An automated test effect.');
    await form.getByRole('button', { name: 'Create effect' }).click();
    await expectSaved(page);

    // The slug id derives from the name; reselect keeps the saved form open.
    const savedId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const savedForm = page.getByTestId(`effect-form-${savedId}`);
    await expect(savedForm).toBeVisible();

    let payload = await fetchContent(request);
    expect(findInCollection(payload, 'effect', savedId)).toMatchObject({ id: savedId, name });

    // --- Edit ---
    await savedForm.getByLabel('description').fill('Updated effect description.');
    await savedForm.getByRole('button', { name: 'Save', exact: true }).click();
    await expectSaved(page);
    payload = await fetchContent(request);
    expect(findInCollection(payload, 'effect', savedId)).toMatchObject({ description: 'Updated effect description.' });

    // --- Delete (typed confirm) ---
    await savedForm.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByLabel('confirm-input').fill(name);
    await page.getByRole('button', { name: 'Delete forever' }).click();
    await expectSaved(page);
    await expect(page.getByTestId(`effect-form-${savedId}`)).toBeHidden();

    payload = await fetchContent(request);
    expect(findInCollection(payload, 'effect', savedId)).toBeUndefined();
  });
});

// #515 — conditional & negative effect modifiers (#338, PRs #508/#509).
// The GM effect editor authors modifiers as { stat, kind, amount, vs? }:
// `amount` may be negative (penalties) and a non-empty `vs` scopes the
// modifier to a roll context, which the sheet surfaces as a hint instead of
// netting it into the always-on number (the app can't know what a roll is
// against — see computeEffectBonuses in src/utils/EffectUtils.js).
test.describe('Conditional & negative effect modifiers (#338)', () => {
  test('author a negative and a conditional modifier; both round-trip through the DO', async ({ page, request }) => {
    const id = testId('curse');
    const name = `E2E Curse ${id}`;

    await page.goto('/gm/catalog/effects');

    await page.getByRole('button', { name: '+ New effect' }).click();
    const form = page.getByTestId('effect-form-new');
    await form.getByLabel('name').fill(name);
    await form.getByLabel('description').fill('Status AC penalty plus a vs-poison Fortitude bonus.');

    // Modifier 0 — a NEGATIVE always-on penalty. Defaults are stat 'ac',
    // kind 'status'; only the amount needs authoring.
    await form.getByRole('button', { name: 'Add modifier' }).click();
    await form.getByLabel('modifier-0-amount').fill('-2');

    // Modifier 1 — a CONDITIONAL bonus: +2 Fortitude, scoped vs poison.
    await form.getByRole('button', { name: 'Add modifier' }).click();
    await form.getByLabel('modifier-1-stat').selectOption('fort');
    await form.getByLabel('modifier-1-amount').fill('2');
    await form.getByLabel('modifier-1-vs').fill('poison');

    await form.getByRole('button', { name: 'Create effect' }).click();
    await expectSaved(page);

    // The reselected saved form renders from the refreshed content payload,
    // so the UI itself round-trips the negative amount and the vs scope.
    const savedId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const savedForm = page.getByTestId(`effect-form-${savedId}`);
    await expect(savedForm).toBeVisible();
    await expect(savedForm.getByLabel('modifier-0-amount')).toHaveValue('-2');
    await expect(savedForm.getByLabel('modifier-1-vs')).toHaveValue('poison');

    // DO round-trip: both modifiers persisted verbatim; the blank vs on the
    // negative modifier is omitted, not stored as ''.
    const payload = await fetchContent(request);
    const saved = findInCollection(payload, 'effect', savedId);
    expect(saved).toMatchObject({
      id: savedId,
      name,
      modifiers: [
        { stat: 'ac', kind: 'status', amount: -2 },
        { stat: 'fort', kind: 'status', amount: 2, vs: 'poison' },
      ],
    });
    expect((saved!.modifiers as Record<string, unknown>[])[0]).not.toHaveProperty('vs');
  });

  test('applied effect changes the sheet numbers: negative AC nets in, conditional stays a vs-hint', async ({ page, seed }) => {
    const charId = 'e2e-defender';
    const charName = 'E2E Defender';

    await seed({
      character: [{
        id: charId,
        name: charName,
        level: 5,
        maxHp: 50,
        ac: 22,
        saves: { fortitude: 11, reflex: 8, will: 9 },
        abilities: { strength: 18, dexterity: 14, constitution: 16, intelligence: 10, wisdom: 12, charisma: 8 },
      }],
      effect: [{
        id: 'e2e-sapping-curse',
        name: 'E2E Sapping Curse',
        description: 'A test curse: -2 status AC, +2 Fortitude vs poison.',
        modifiers: [
          { stat: 'ac', kind: 'status', amount: -2 },
          { stat: 'fort', kind: 'status', amount: 2, vs: 'poison' },
        ],
      }],
    });
    const session = await mockSession(page);

    await page.goto(`/character/${charId}`);
    await expectOnSheet(page, charId);
    await expectSheet(page, charName);

    // Baseline: the Ability Dial core shows the unmodified synced AC.
    const acCore = page.getByRole('button', { name: 'Character feats and conditions' });
    await expect(acCore.locator('.core-value')).toHaveText('22');

    // Apply the effect — the same cnmh_effects_<id> write the GM dashboard's
    // Apply Effect control sends (covered in gm-dashboard.spec.ts).
    session.push(`cnmh_effects_${charId}`, [{ id: 'e2e-applied-1', effectId: 'e2e-sapping-curse' }]);

    // The -2 status penalty NETS into the displayed AC: 22 → 20, delta -2.
    await expect(acCore.locator('.pd-penalized')).toHaveText('20');
    await expect(acCore.locator('.pd-delta')).toHaveText('-2');

    // The conditional (+2 vs poison) does NOT net into the Fortitude number —
    // it surfaces as a roll-context hint under the save ring (#338).
    await page.getByRole('button', { name: 'Defense', exact: true }).click();
    const fortRing = page.getByLabel(/^Fortitude,/);
    await expect(fortRing.getByRole('note')).toContainText('+2 vs poison');
    await expect(fortRing.getByRole('note')).toContainText('E2E Sapping Curse');
    await expect(fortRing.locator('.ring')).toHaveText('+11');
  });
});
