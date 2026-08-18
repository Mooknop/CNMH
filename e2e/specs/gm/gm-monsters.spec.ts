/**
 * GmMonsters catalog editor round-trip suite (#516, epic #336; editor #335).
 *
 * `/gm/catalog/monsters` mounts BestiaryEditor: a master/detail list built from
 * the union of encounter enemies with a stable `creatureKey` and persisted
 * `monster` docs. There is deliberately NO free-form "+ New" — creation means
 * persisting an entry for a creature the party has SEEN (the captured stat
 * block itself is owned by BestiaryCaptureSync, #332). So:
 *
 *  - CREATE: seed an encounter enemy via mockSession (the bridge's role); the
 *    GM-only capture rail (useBestiaryCapture) persists the sighting into the
 *    content DO on its own, and the editor's save then curates that doc.
 *  - EDIT/DELETE: importDocs a persisted doc (monster is capture-only — the
 *    seed fixture refuses it, #760) and round-trip name/descriptionOverride,
 *    asserting captured stats/provenance are PRESERVED by the save spread.
 *  - Per-field player-visibility toggles write the shared knowledge record
 *    (cnmh_knowledge_global) — on the real relay they survive a reload, which
 *    is the same persistence rail the player bestiary reads.
 *
 * Mutations are asserted via both the rendered DOM and /api/content, like the
 * sibling gm-* catalog specs. Reset-free: unique ids per test.
 *
 * Desktop-only: GM Tools has no responsive layout.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { importDocs, fetchContent, findInCollection, waitForContent } from '../../helpers/content';
import { testId } from '../../helpers/ids';

const capturedDoc = (id: string, name: string) => ({
  id,
  name,
  bestiary: {
    level: 0,
    rarity: 'common',
    traits: ['undead'],
    hp: { current: 30, max: 30 },
    perception: 5,
    speed: 25,
    description: 'Imported crypt lore.',
  },
  defenses: {
    ac: 19,
    saves: { fortitude: 8, reflex: 6, will: 4 },
    weaknesses: [{ type: 'cold', value: 5 }],
  },
  capturedAt: 1755000000000,
  lastSeenAt: 1755432000000,
  locations: { 'e2e-crypt': { name: 'E2E Crypt', lastSeenAt: 1755432000000 } },
});

const rowFor = (page: import('@playwright/test').Page, name: string) =>
  page.locator('.gm-ped-row', { hasText: name });

async function openEntry(page: import('@playwright/test').Page, name: string, key: string) {
  await expect(page.getByRole('list', { name: 'monster list' })).toBeVisible();
  await rowFor(page, name).getByRole('button').click();
  const form = page.getByTestId(`monster-form-${key}`);
  await expect(form).toBeVisible();
  return form;
}

test.describe('GM monster catalog editor', () => {
  test('a creature seen in the encounter can be persisted into the monster collection', async ({
    page,
    request,
  }) => {
    const key = testId('spawn');
    const seenName = 'E2E Vault Spawn';
    const savedName = 'E2E Vault Spawn (curated)';

    // The encounter is the "seen" source — mockSession plays the bridge that
    // captured it. The content write path stays REAL (/api/gm → content DO).
    await mockSession(page, {
      seed: {
        cnmh_encounter_global: {
          active: true,
          phase: 'in-progress',
          round: 1,
          currentTurnIndex: 0,
          order: [
            {
              entryId: `e2e-foe-${key}`,
              kind: 'enemy',
              name: seenName,
              initiative: 12,
              creatureKey: key,
              bestiary: {
                level: 2,
                rarity: 'common',
                traits: ['aberration'],
                hp: { current: 25, max: 25 },
                description: 'Imported flavor text.',
              },
              defenses: { ac: 17, saves: { fortitude: 9, reflex: 7, will: 5 } },
            },
          ],
          log: [],
          saveRequests: [],
        },
      },
    });
    await page.goto('/gm/catalog/monsters');

    // CREATE: the GM-only capture rail (useBestiaryCapture, #332) persists the
    // sighting into the content DO the moment the encounter lands — stat block
    // and all. That write is the creature's creation.
    await waitForContent(
      request,
      'monster',
      key,
      (e) => !!e && e.name === seenName && !!(e as { bestiary?: unknown }).bestiary,
    );
    // Wait for the persisted marker BEFORE opening the form: it proves the
    // content refresh delivered the doc, so the save below spreads the captured
    // stats instead of racing the capture write.
    await expect(rowFor(page, seenName).getByTitle('Persisted entry')).toBeVisible();

    const form = await openEntry(page, seenName, key);
    await expect(form).toContainText(`Creature key: ${key}`);
    // The captured-stats preview is the fully-revealed player view.
    await expect(form.locator('.be-preview')).toContainText(seenName);

    await form.getByLabel('display-name', { exact: true }).fill(savedName);
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('be-flash')).toContainText('Saved');

    // EDIT round-trips through the content DO, and the curation save's spread
    // keeps the freshly captured stat block intact.
    await waitForContent(request, 'monster', key, (e) => e?.name === savedName);
    const payload = await fetchContent(request);
    expect(findInCollection(payload, 'monster', key)).toMatchObject({
      id: key,
      name: savedName,
      bestiary: { level: 2, hp: { current: 25, max: 25 } },
      defenses: { ac: 17 },
    });
  });

  test('editing a persisted entry preserves captured stats; delete removes it', async ({
    page,
    request,
  }) => {
    const key = testId('ghoul');
    const name = 'E2E Catalog Ghoul';
    const renamed = 'E2E Catalog Ghast';
    await importDocs(request, 'monster', [capturedDoc(key, name)]);

    await page.goto('/gm/catalog/monsters');
    const form = await openEntry(page, name, key);

    // Provenance from the captured doc. (`be-imported-desc` is a CSS class,
    // not a testid — the provenance line is the only testid in that block.)
    await expect(form.getByTestId('be-provenance')).toContainText('Encountered at E2E Crypt');
    await expect(form.locator('.be-imported-desc')).toContainText('Imported crypt lore.');

    await form.getByLabel('display-name', { exact: true }).fill(renamed);
    await form.getByLabel('description-mode').selectOption('custom');
    await form.getByLabel('description-override').fill('What the players read.');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('be-flash')).toContainText('Saved');

    await waitForContent(request, 'monster', key, (e) => e?.name === renamed);
    const payload = await fetchContent(request);
    // The save spreads the existing doc: name/description own-fields change,
    // captured stats + provenance survive untouched (#332).
    expect(findInCollection(payload, 'monster', key)).toMatchObject({
      id: key,
      name: renamed,
      descriptionOverride: 'What the players read.',
      bestiary: { level: 0, hp: { current: 30, max: 30 } },
      defenses: { ac: 19 },
      capturedAt: 1755000000000,
      locations: { 'e2e-crypt': { name: 'E2E Crypt' } },
    });

    // Delete round-trip. Plain confirm dialog (no typed guard); `exact` keeps
    // the confirm button distinct from the form's own "Delete entry".
    await form.getByRole('button', { name: 'Delete entry' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByTestId('be-flash')).toContainText('Entry deleted');
    await expect(page.getByTestId(`monster-form-${key}`)).toHaveCount(0);
    await expect(rowFor(page, renamed)).toHaveCount(0);
    await waitForContent(request, 'monster', key, (e) => !e);
  });

  test('per-field visibility toggles write the live knowledge record and survive a reload', async ({
    page,
    request,
  }) => {
    const key = testId('wisp');
    const name = 'E2E Vault Wisp';
    await importDocs(request, 'monster', [capturedDoc(key, name)]);

    // REAL relay: the toggles merge into cnmh_knowledge_global on the session
    // DO — the same record the player bestiary gates on.
    await page.goto('/gm/catalog/monsters');
    const form = await openEntry(page, name, key);

    const ac = form.getByLabel('reveal-ac', { exact: true });
    await expect(ac).not.toBeChecked();

    // Reveal all → every field checked; Re-fog → back to nothing.
    await form.getByRole('button', { name: 'Reveal all' }).click();
    await expect(ac).toBeChecked();
    await expect(form.getByLabel('reveal-saves.fortitude', { exact: true })).toBeChecked();
    await expect(form.getByLabel('reveal-iwr.weaknesses', { exact: true })).toBeChecked();
    await form.getByRole('button', { name: 'Re-fog (reset)' }).click();
    await expect(ac).not.toBeChecked();
    await expect(form.getByLabel('reveal-identity', { exact: true })).not.toBeChecked();

    // A single curated reveal…
    await ac.check();
    await expect(ac).toBeChecked();

    // …comes back from the session DO after a reload (FULL_STATE is
    // authoritative, #1476): the GM's curation is durable table state.
    await page.reload();
    const reForm = await openEntry(page, name, key);
    await expect(reForm.getByLabel('reveal-ac', { exact: true })).toBeChecked();
    await expect(reForm.getByLabel('reveal-hp', { exact: true })).not.toBeChecked();
  });
});
