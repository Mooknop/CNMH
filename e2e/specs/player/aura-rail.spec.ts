/**
 * Aura emanation rail (#1733 S4/E2E) — player-facing half. The GM-toggle
 * activation path, the protocol-gate matrix and the reconnect resync live in
 * `gm/aura-emanation.spec.ts`; this file covers:
 *
 *   - two more falling-edge writers of the app-only `cnmh_aura_<charId>` key
 *     (Dismiss Aura, the KO sweep) — `useAuraRegionSync` is a pure OBSERVER
 *     of that key (see its header comment), so every writer is expected to
 *     drive the SAME `cnmh_auraset_<charId>` mirror send, not just the GM
 *     toggle exercised in the sibling file;
 *   - the membership read-out (`cnmh_auramembers_<charId>`, #1733 S2):
 *     AuraChip's tooltip (InitiativeStrip) and Dossier's self row both filter
 *     to visible allies (friendly, non-hidden) and show today's plain,
 *     unenriched copy — never a lying zero — until a membership push actually
 *     lands.
 *
 * `mockSession` (#293) reports the runner as the GM (GM_DEV_BYPASS locally),
 * which is what `useAuraRegionSync`'s `isGm` gate needs — the same device
 * renders the player's own character sheet AND is the one mirror writer, so
 * no separate "GM device" page is needed here either.
 *
 * Hydration gate (#843/#1366): every test opens Encounter and waits for the
 * self-status bar's "End turn" button (`expectMyTurnLive`) before touching
 * the deck or the initiative strip.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';
import { expectSheet, openPlayTab, expectMyTurnLive } from '../../helpers/sheet';
import { bridgeHello, AURA_PROTOCOL } from '../../helpers/bridge';

const CHAR_ID = 'e2e-aura-kineticist';
const CHAR_NAME = 'E2E Aura Kineticist';

// Same aura-granting shape as the GM-side spec (see its header comment) —
// Aura + Kineticist traits plus an authored `areaShape` so the mirror has a
// radius to send (#1733 ruling 2 — no fallback radius).
const character = () => ({
  id: CHAR_ID,
  name: CHAR_NAME,
  level: 5,
  actions: [{
    name: 'Channel Elements',
    actions: '1',
    traits: ['Aura', 'Kineticist'],
    areaShape: { shape: 'emanation', feet: 10 },
  }],
});

const baseSeed = (extra: Record<string, unknown> = {}) => ({
  cnmh_bridgehello_global: bridgeHello(AURA_PROTOCOL),
  cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
  [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
  ...extra,
});

async function openEncounterTab(page: import('@playwright/test').Page) {
  await page.goto(`/character/${CHAR_ID}`);
  await expectSheet(page, CHAR_NAME);
  await openPlayTab(page, 'Encounter');
  await expectMyTurnLive(page);
}

test.describe('Aura emanation rail — player device (#1733 S4/E2E)', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [character()] });
  });

  // ── falling-edge writer 1: Dismiss Aura ─────────────────────────────────

  test('Dismiss Aura sends active:false through both the app-only key and the bridge mirror', async ({ page }) => {
    const session = await mockSession(page, {
      seed: baseSeed({ [`cnmh_aura_${CHAR_ID}`]: { active: true, ts: 1 } }),
    });
    await openEncounterTab(page);

    const chip = page.getByLabel(`${CHAR_NAME}'s kinetic aura is active`);
    await expect(chip).toBeVisible();

    await page.getByRole('button', { name: 'Dismiss Aura' }).click();

    await session.expectSent(`cnmh_aura_${CHAR_ID}`, (v) => v?.active === false);
    await session.expectSent(`cnmh_auraset_${CHAR_ID}`, (v) => v?.active === false);
    await expect(chip).toBeHidden();
  });

  // ── falling-edge writer 2: KO sweep ─────────────────────────────────────

  test('a KO (hp hits 0) deactivates the aura and the mirror follows it down', async ({ page }) => {
    const session = await mockSession(page, {
      seed: baseSeed({
        [`cnmh_aura_${CHAR_ID}`]: { active: true, ts: 1 },
        [`cnmh_hp_${CHAR_ID}`]: { current: 10, max: 10 },
      }),
    });
    await openEncounterTab(page);
    await expect(page.getByLabel(`${CHAR_NAME}'s kinetic aura is active`)).toBeVisible();

    session.push(`cnmh_hp_${CHAR_ID}`, { current: 0, max: 10 });

    await session.expectSent(`cnmh_aura_${CHAR_ID}`, (v) => v?.active === false);
    await session.expectSent(`cnmh_auraset_${CHAR_ID}`, (v) => v?.active === false);
  });

  // ── membership read-out (#1733 S2) ──────────────────────────────────────

  test('membership push filters to visible allies on both the AuraChip tooltip and the Dossier self row', async ({ page }) => {
    const session = await mockSession(page, {
      seed: baseSeed({ [`cnmh_aura_${CHAR_ID}`]: { active: true, ts: 1 } }),
    });
    await openEncounterTab(page);

    const chip = page.getByLabel(`${CHAR_NAME}'s kinetic aura is active`);
    await expect(chip).toBeVisible();
    // Absent membership — the plain, unenriched tooltip (no lying zero).
    await expect(chip).toHaveAttribute('title', 'Kinetic aura active');

    // Focus your own entry to bring up the self Dossier card.
    await page.getByRole('button', { name: `Focus ${CHAR_NAME}` }).click();
    await expect(page.getByTestId('dossier-aura')).toHaveCount(0);

    session.push(`cnmh_auramembers_${CHAR_ID}`, {
      inside: [
        { entryId: 'e-ally', tokenId: 't-ally', name: 'Ally One', disposition: 1, hidden: false },
        // A hidden ally and a hostile — neither counts toward the player-facing total.
        { entryId: 'e-hidden-ally', tokenId: 't-hidden', name: 'Hidden Ally', disposition: 1, hidden: true },
        { tokenId: 't-foe', name: 'Foe', disposition: -1, hidden: false },
      ],
      ts: Date.now(),
    });

    await expect(chip).toHaveAttribute('title', 'Kinetic aura active — 1 ally inside');
    await expect(page.getByTestId('dossier-aura')).toBeVisible();
    await expect(page.getByTestId('dossier-aura')).toContainText('1 ally inside');
  });
});
