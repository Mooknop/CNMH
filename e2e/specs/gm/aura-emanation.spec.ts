/**
 * Aura emanation rail (#1733 S4/E2E) — the GM-device half of the `auraset`
 * mirror (`src/hooks/useAuraRegionSync.jsx`). `AuraRegionSync` mounts once at
 * the app root (`src/App.jsx`) and watches every kineticist's app-only
 * `cnmh_aura_<charId>` key regardless of which page is open, so these specs
 * drive the mirror from GM Tools surfaces even though the write itself can
 * come from anywhere — see `player/aura-rail.spec.ts` for the player-facing
 * writers (Dismiss, KO) and the membership read-out (AuraChip / Dossier).
 *
 * `mockSession` (#293) reports the runner as the GM (GM_DEV_BYPASS locally),
 * exactly what `useAuraRegionSync`'s `isGm` gate needs — no separate "GM
 * device" fixture exists or is required.
 *
 * The GM toggle path (`CharacterStateModal`'s "Aura" row, `liveStateRegistry`
 * `type: 'aura', editor: 'toggle'`) is the simplest way to flip the app-only
 * key from either side without authoring a full impulse-cast flow through
 * `UseAbilityModal` — the mirror is an OBSERVER of that key (see the header
 * comment on `useAuraRegionSync.jsx`), so it fires identically no matter which
 * UI wrote it. The toggle row only renders once the key has a recorded value
 * (`partitionLiveState` skips absent types), so every test seeds
 * `cnmh_aura_<charId>` up front.
 *
 * "Clear combat state" doubles as the regression spec for the hygiene fix in
 * `CharacterStateModal.jsx` (`pushState('aura', …)` → `pushState(APP.AURA, …)`)
 * — a wrong literal there would silently write a key nothing reads, and this
 * is the only place that could ever catch that.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { bridgeHello, AURA_PROTOCOL } from '../../helpers/bridge';

const CHAR_ID = 'e2e-aura-kineticist';
const CHAR_NAME = 'E2E Aura Kineticist';

// A minimal aura-granting ability — Aura + Kineticist traits (what
// `activatesAura`/`characterHasKineticAura` key off, utils/kineticAura.js)
// plus an authored `areaShape` (what `auraProfile` reads for the mirror's
// `feet`; #1733 ruling 2 — no fallback radius, so this MUST be present for
// `auraset` to ever send). Top-level `actions`, not a feat — mirrors how
// `characterHasKineticAura` reads a bare character doc, same shape
// `useAuraRegionSync.test.jsx`'s fixtures use.
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

/** Open Character State and select the seeded kineticist. */
async function openCharacterState(page: import('@playwright/test').Page) {
  await page.goto('/gm');
  await page.getByRole('button', { name: 'Inspect character state' }).click();
  await page.getByLabel('select character').selectOption(CHAR_ID);
}

test.describe('Aura emanation rail — GM device (#1733 S4/E2E)', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [character()] });
  });

  test('GM toggles Aura on: auraset carries active:true with the authored radius', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_bridgehello_global: bridgeHello(AURA_PROTOCOL),
        [`cnmh_aura_${CHAR_ID}`]: { active: false, ts: 0 },
      },
    });
    await openCharacterState(page);

    const auraRow = page.getByTestId('cs-row-aura');
    await expect(auraRow.getByRole('button', { name: 'toggle Aura' })).toHaveText('Off');
    await auraRow.getByRole('button', { name: 'toggle Aura' }).click();

    await session.expectSent(`cnmh_aura_${CHAR_ID}`, (v) => v?.active === true);
    await session.expectSent(
      `cnmh_auraset_${CHAR_ID}`,
      (v) => v?.active === true && v.feet === 10 && v.label === 'Channel Elements',
    );
  });

  test('GM "Clear combat state" deactivates the aura and the mirror follows it down', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_bridgehello_global: bridgeHello(AURA_PROTOCOL),
        [`cnmh_aura_${CHAR_ID}`]: { active: true, ts: 1 },
      },
    });
    await openCharacterState(page);

    await page.getByRole('button', { name: 'Clear combat state' }).click();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();

    await session.expectSent(`cnmh_aura_${CHAR_ID}`, (v) => v?.active === false);
    await session.expectSent(`cnmh_auraset_${CHAR_ID}`, (v) => v?.active === false);
    // No `feet` on a deactivation (buildAuraSet omits it entirely, not null).
    const sent = session.sent.filter((m) => m.stateType === 'auraset').at(-1);
    expect('feet' in (sent!.value as object)).toBe(false);
  });

  test('a protocol-18 bridge never receives auraset even as the app-only key keeps flipping', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_bridgehello_global: bridgeHello(AURA_PROTOCOL - 1),
        [`cnmh_aura_${CHAR_ID}`]: { active: false, ts: 0 },
      },
    });
    await openCharacterState(page);

    await page.getByTestId('cs-row-aura').getByRole('button', { name: 'toggle Aura' }).click();
    await session.expectSent(`cnmh_aura_${CHAR_ID}`, (v) => v?.active === true);

    expect(session.sent.some((m) => m.stateType === 'auraset')).toBe(false);
  });

  test('a bridge hello arriving while the aura is already active re-syncs auraset', async ({ page }) => {
    const session = await mockSession(page, {
      // No hello at connect time — the gate starts shut.
      seed: { [`cnmh_aura_${CHAR_ID}`]: { active: true, ts: 1 } },
    });
    await openCharacterState(page);

    // The dashboard has hydrated (the modal + row rendered above), and the
    // gate has been closed the whole time — nothing to mirror yet.
    expect(session.sent.some((m) => m.stateType === 'auraset')).toBe(false);

    session.push('cnmh_bridgehello_global', bridgeHello(AURA_PROTOCOL));

    await session.expectSent(
      `cnmh_auraset_${CHAR_ID}`,
      (v) => v?.active === true && v.feet === 10,
    );
  });
});
