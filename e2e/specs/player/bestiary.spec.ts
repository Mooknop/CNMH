/**
 * /bestiary browser + persistent Recall Knowledge reveals (#516, epic #336).
 *
 * The bestiary is the party's standing "Specimen Dex": every creature ever
 * captured by BestiaryCaptureSync as a `monster` doc, each entry reveal-gated
 * field-by-field on the shared `cnmh_knowledge_global` record (keyed by
 * rkKeyFor = creatureKey, which IS the persisted doc id).
 *
 * Seeding: `monster` is a CAPTURE-ONLY collection — the seed fixture refuses to
 * touch it (#760) — so docs go in through the same write path the app uses,
 * `importDocs` (POST /api/gm/import/monster). Each test starts from `reset()`
 * because the grid's catalogued/unknown counts are whole-collection assertions.
 *
 * GM probe: locally GM_DEV_BYPASS makes every request the GM, and the browser
 * passes `revealAll={isGm}` — with the probe answering, nothing is ever hidden
 * and the reveal gate under test would vanish. Every test therefore blocks
 * /api/gm/whoami so useGmAuth resolves to a plain player.
 *
 * Persistence: the last test uses the REAL relay (no mockSession) — the RK
 * write must land in the CampaignSession DO and come back in FULL_STATE after
 * a reload, which is authoritative over localStorage (#1476). The mocked tests
 * cover gating render logic only, where the mock's seed/push is exactly the
 * FULL_STATE/UPDATE wire shape.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { importDocs } from '../../helpers/content';
import { testId } from '../../helpers/ids';

// A captured monster doc as BestiaryCaptureSync persists it (utils/bestiary.js):
// the doc id IS the creatureKey; `bestiary` + `defenses` are the captured stat
// block the reveal gate slices up.
const monsterDoc = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  bestiary: {
    level: 0, // RK DC 14; −2 studied out of combat → 12, so a nat 20 is always a crit
    rarity: 'common',
    traits: ['undead'],
    hp: { current: 30, max: 30 },
    perception: 5,
    speed: 25,
    description: 'A shambling e2e horror.',
  },
  defenses: {
    ac: 19,
    saves: { fortitude: 8, reflex: 6, will: 4 },
    immunities: ['poison'],
    resistances: [{ type: 'fire', value: 10 }],
    weaknesses: [{ type: 'cold', value: 5 }],
  },
  capturedAt: 1755000000000,
  lastSeenAt: 1755000000000,
  ...over,
});

// Locally every request is the GM (GM_DEV_BYPASS) and the browser force-reveals
// for GMs — block the identity probe so the page renders the PLAYER view.
const asPlayer = (page: Page) =>
  page.route('**/api/gm/whoami', (route) => route.fulfill({ status: 401, contentType: 'text/plain', body: 'e2e: not the GM' }));

// One stat cell of the full dex readout, addressed by its label text.
const statCell = (page: Page, label: string) =>
  page.locator('.dex-cell').filter({ has: page.getByText(label, { exact: true }) });

test.describe('Bestiary browser', () => {
  test('grid lists identified creatures and masks unidentified ones', async ({ page, request, reset }) => {
    await reset();
    const idA = testId('ghoul');
    const nameA = 'E2E Crypt Ghoul';
    const idB = testId('imp');
    const nameB = 'E2E Spy Imp';
    await importDocs(request, 'monster', [
      monsterDoc(idA, nameA),
      monsterDoc(idB, nameB, {
        bestiary: { level: 1, rarity: 'common', traits: ['fiend'], hp: { current: 20, max: 20 } },
      }),
    ]);
    await asPlayer(page);
    // Identity learned for the ghoul only; the imp stays a silhouette.
    await mockSession(page, { seed: { cnmh_knowledge_global: { [idA]: { identity: true } } } });
    await page.goto('/bestiary');

    const grid = page.getByTestId('dex-grid');
    await expect(grid).toBeVisible();
    await expect(page.getByRole('heading', { name: /Bestiary/ })).toContainText('1 catalogued · 1 unknown');

    const known = grid.getByRole('button', { name: nameA, exact: true });
    await expect(known).toBeVisible();
    await expect(known).toContainText('Creature 0');
    const unknown = grid.getByRole('button', { name: 'Unidentified creature' });
    await expect(unknown).toBeVisible();
    await expect(unknown).toContainText('— unidentified —');
    await expect(unknown).toContainText('not yet recalled');
    await expect(unknown).not.toContainText(nameB);

    // Trait chips are built from identified creatures only — no spoilers.
    const chips = page.getByRole('group', { name: 'Filter by trait' });
    await expect(chips.getByRole('button', { name: 'undead' })).toBeVisible();
    await expect(chips.getByRole('button', { name: 'fiend' })).toHaveCount(0);

    // Search can only match what the party can actually see.
    const search = page.getByLabel('Search creatures by name');
    await search.fill('Imp');
    await expect(page.getByText('No creatures match your filters.')).toBeVisible();
    await search.fill('Ghoul');
    await expect(known).toBeVisible();
    await expect(grid.getByRole('button', { name: 'Unidentified creature' })).toHaveCount(0);
  });

  test('deep-linked entry gates every stat behind its own reveal', async ({ page, request, reset }) => {
    await reset();
    const id = testId('ghoul');
    const name = 'E2E Vault Ghoul';
    await importDocs(request, 'monster', [monsterDoc(id, name)]);
    await asPlayer(page);
    const session = await mockSession(page, {
      seed: { cnmh_knowledge_global: { [id]: { identity: true, ac: true } } },
    });
    await page.goto(`/bestiary/${id}`);

    const detail = page.getByTestId('bm-detail');
    await expect(detail).toBeVisible();

    // Revealed: identity (name/level/traits) + AC.
    await expect(detail).toContainText(name);
    await expect(detail).toContainText('Creature 0');
    await expect(statCell(page, 'AC')).toContainText('19');
    await expect(detail.getByTestId('bm-rk-dc')).toContainText('14');

    // Everything else is an inkblot, not a value.
    await expect(statCell(page, 'HP')).not.toContainText('30');
    await expect(statCell(page, 'Fort')).not.toContainText('+8');
    await expect(detail.locator('[aria-label="description redacted"]')).toBeVisible();
    await expect(detail).not.toContainText('A shambling e2e horror.');
    await expect(detail).not.toContainText('cold 5');
    await expect(detail).not.toContainText('fire 10');
    await expect(detail).not.toContainText('poison');

    // Partial single-weakness reveal rides `weaknessesRevealed` (per-type map —
    // Exploit Vulnerability success / damage-triggered #1014), NOT the full
    // iwr.weaknesses flag: cold shows, the fire resistance stays hidden.
    session.push('cnmh_knowledge_global', {
      [id]: { identity: true, ac: true, weaknessesRevealed: { cold: true } },
    });
    await expect(detail).toContainText('cold 5');
    await expect(detail).not.toContainText('fire 10');

    // Saves reveal per save; resistances via the full iwr category flag.
    session.push('cnmh_knowledge_global', {
      [id]: {
        identity: true,
        ac: true,
        weaknessesRevealed: { cold: true },
        saves: { fortitude: true },
        iwr: { resistances: true },
      },
    });
    await expect(statCell(page, 'Fort')).toContainText('+8');
    await expect(statCell(page, 'Resist')).toContainText('fire 10');
    await expect(statCell(page, 'Ref')).not.toContainText('+6');
  });

  test('an RK reveal persists through the session DO across a reload', async ({ page, request, reset }) => {
    await reset();
    const id = testId('shade');
    const name = 'E2E Barrow Shade';
    await importDocs(request, 'monster', [monsterDoc(id, name)]);
    await asPlayer(page);
    // REAL relay: the reveal must round-trip through the CampaignSession DO.
    await page.goto(`/bestiary/${id}`);

    const detail = page.getByTestId('bm-detail');
    await expect(detail).toBeVisible();
    // Nothing learned yet — the name renders as a redaction blot.
    await expect(detail.locator(`[aria-label="${name} name redacted"]`)).toBeVisible();

    // Out-of-combat Recall Knowledge (#396): nat 20 vs the studied DC (12) is a
    // guaranteed critical success for any real PC modifier → pick 2 facts.
    await page.getByRole('button', { name: 'Recall Knowledge' }).click();
    const resolver = page.getByTestId('rkr-resolver');
    await expect(resolver).toBeVisible();
    await resolver
      .getByRole('group', { name: 'raw d20' })
      .getByRole('button', { name: '20', exact: true })
      .click();
    const choices = resolver.getByRole('group', { name: 'Choose what to learn' });
    await expect(choices).toBeVisible();
    await choices.getByRole('checkbox', { name: 'Armor Class' }).check();
    await choices.getByRole('checkbox', { name: 'Weaknesses' }).check();
    await resolver.getByRole('button', { name: 'Apply' }).click();

    // Identity/description/HP auto-reveal + the two picks land live.
    await expect(detail).toContainText(name);
    await expect(statCell(page, 'AC')).toContainText('19');
    await expect(statCell(page, 'HP')).toContainText('30 / 30');
    await expect(detail).toContainText('cold 5');

    // Reload: FULL_STATE from the session DO is authoritative over localStorage
    // (#1476), so the reveal surviving proves the DO recorded it.
    await page.reload();
    await expect(page.getByTestId('bm-detail')).toBeVisible();
    await expect(detail).toContainText(name);
    await expect(statCell(page, 'AC')).toContainText('19');
    await expect(detail).toContainText('cold 5');
    // ...and what wasn't learned is still hidden after the round-trip.
    await expect(statCell(page, 'Ref')).not.toContainText('+6');
    await expect(statCell(page, 'Perception')).not.toContainText('+5');
  });
});
