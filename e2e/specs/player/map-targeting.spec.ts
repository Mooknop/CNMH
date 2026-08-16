/**
 * Map targeting — tap-to-target on the live map (#1749 S6).
 *
 * S1-S5 (PRs #1753, #1755, #1756, #1758, #1760) are all merged on main: the
 * `hidden`/`width`/`height` fields on `cnmh_positions_global` (protocol
 * MAP_TARGET_PROTOCOL = 17, shared with #1751), `useMapTargetSection`'s
 * "Show the battlefield" surface inside `RollSheet`'s (or the classic
 * modal's) edit panel, `TokenMarkersOverlay`/`buildTokenMarkers`,
 * `markerHitTest`'s footprint-then-nearest-centre hit test, the
 * `cnmh_action_<charId>` debounced writer (`useActionTargetSync`), the
 * OQ-5 hidden-combatant sweep across every player-facing picker, and the
 * initiative strip's own hidden-combatant filter (`visibleOrder`). This file
 * drives all of it through the real player UI, extending the existing
 * `map-bridge.spec.ts` harness (snapshot upload trick, IDENTITY_CAPTURE
 * geometry) to the targeting surface.
 *
 * The test ability is deliberately built to resolve `rollProfile.mode` to
 * 'none' (traits: ['Attack'], type: 'ranged', but NO attackMod/roll config,
 * and the caster has no spellcasting entry): `useRollSheet` requires
 * `mode === 'actor-roll'`, so this ability NEVER switches the modal from its
 * classic (non-RollSheet) rendering — TargetPicker and the map section stay
 * inline in the modal body the whole test, with no RollSheet edit-panel
 * disclosure to open or reason about. `ability.type === 'ranged'` and
 * `ability.range` are still real (they drive `isRangedStrike` and the
 * framing radius, exactly as a genuine Strike would), so the targeting rail
 * under test sees production inputs; only the roll itself is elided, since
 * this spec is about WHO gets targeted, not how the attack resolves (that is
 * attack-rolls.spec.ts's job).
 */

import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';
import { expectSheet, openPlayTab, expectMyTurnLive } from '../../helpers/sheet';
import { bridgeHello, MAP_TARGET_PROTOCOL } from '../../helpers/bridge';

const CHAR_ID = 'e2e-map-target-caster';
const CHAR_NAME = 'E2E Map Target Caster';
const ABILITY_NAME = 'E2E Bolt';
const SCENE_ID = 'e2e-map-target-scene';

const character = () => ({
  id: CHAR_ID,
  name: CHAR_NAME,
  level: 5,
  // No attackMod/roll config and no spellcasting entry → resolveActionRoll
  // falls all the way through to mode:'none' (see file header). type:'ranged'
  // and range are still real inputs to isRangedStrike/targetFramingRadiusFeet.
  actions: [{
    name: ABILITY_NAME, actions: '1', traits: ['Attack'], type: 'ranged', range: '20 feet',
    description: 'A ranged test strike.',
  }],
});

// Combatants, with stable entryIds so the seeded positions line up by key.
const CASTER_ENTRY = { entryId: 'ent-map-target-caster', kind: 'pc', charId: CHAR_ID, name: CHAR_NAME, initiative: 20 };
const GOBLIN = { entryId: 'ent-goblin', kind: 'enemy' as const, name: 'Goblin', initiative: 15 };
const OGRE = { entryId: 'ent-ogre', kind: 'enemy' as const, name: 'Ogre', initiative: 12 };
const HIDDEN_ASSASSIN = {
  entryId: 'ent-hidden-assassin', kind: 'enemy' as const, name: 'Hidden Assassin', initiative: 18,
  // Defense-in-depth (#1749 OQ-5): the ORDER entry is hidden but the matching
  // `positions` entry below deliberately carries NO `hidden` field, simulating
  // a `positions` push that hasn't (yet) picked up the bridge-side filter or a
  // client that raced it — `buildTokenMarkers` must still drop the marker off
  // the joined order entry alone.
  hidden: true,
};
const ORDER = [CASTER_ENTRY, GOBLIN, OGRE, HIDDEN_ASSASSIN];

// All on row 2, gridSize 100 — matching map-bridge.spec.ts's IDENTITY_CAPTURE
// convention (world pixels == capture-space pixels) so tap math stays simple.
//   Goblin: 1x1 at (2,2) → world (200,200)-(300,300), center (250,250) → nx/ny 0.25
//   Ogre:   2x2 at (5,2) → world (500,200)-(700,400), center (600,300) → nx/ny 0.6/0.3
//   Caster: 1x1 at (0,2) → world (0,200)-(100,300)
//   Hidden: 1x1 at (8,2) — no `hidden` flag here on purpose (see ORDER above)
const POSITIONS = {
  gridSize: 100,
  positions: {
    [CASTER_ENTRY.entryId]: { col: 0, row: 2 },
    [GOBLIN.entryId]: { col: 2, row: 2, width: 1, height: 1 },
    [OGRE.entryId]: { col: 5, row: 2, width: 2, height: 2 },
    [HIDDEN_ASSASSIN.entryId]: { col: 8, row: 2 },
  },
};

const IDENTITY_CAPTURE = {
  a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 1000, screenH: 1000, sceneId: SCENE_ID,
};

// An 8x8 PNG (84 bytes) — the same fixture map-bridge.spec.ts uses.
const SNAPSHOT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAG0lEQVR4nGNY5RJq7BKKSTJgFV3l' +
    'EsowKHUAAMQfQeFax4r+AAAAAElFTkSuQmCC',
  'base64',
);

async function uploadSnapshotImage(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/gm/images', {
    multipart: {
      file: { name: 'e2e-map-target-snapshot.png', mimeType: 'image/png', buffer: SNAPSHOT_PNG },
      name: 'E2E map-target snapshot',
      folder: 'Scene Snapshots',
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  return `/api/images/${id}`;
}

const baseSeed = (protocol: number) => ({
  cnmh_bridgehello_global: bridgeHello(protocol, 'e2e-map-target-bridge'),
  cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, { order: ORDER }),
  [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
  cnmh_positions_global: POSITIONS,
});

/** Answer every `snapreq` with a fixed IDENTITY_CAPTURE ack pointing at the
 *  uploaded image. */
function answerCaptures(session: MockSession, imageUrl: string) {
  session.onSent('cnmh_snapreq_global', (req) => {
    session.push('cnmh_snapdone_global', {
      id: req.id,
      ok: true,
      url: imageUrl,
      capture: IDENTITY_CAPTURE,
      worldRect: { x1: 0, y1: 0, x2: 1000, y2: 1000 },
      gridSize: 100,
      ts: Date.now(),
    });
  });
}

const sentValues = (session: MockSession, stateType: string) =>
  session.sent.filter((m) => m.stateType === stateType).map((m) => m.value as any);

/** Sheet → Encounter tab → Actions segment, gated on hydration. */
async function openActionsSegment(page: Page) {
  await page.goto(`/character/${CHAR_ID}`);
  await expectSheet(page, CHAR_NAME);
  await openPlayTab(page, 'Encounter');
  await expectMyTurnLive(page);
  await page.getByRole('tab', { name: 'Actions' }).click();
}

/** Actions segment → the test ability's classic modal (no RollSheet — see the
 *  file header on why `rollProfile.mode` stays 'none' here). */
async function openAbility(page: Page) {
  await openActionsSegment(page);
  await page.getByRole('button', { name: new RegExp(ABILITY_NAME) }).first().click();
  await page.getByRole('button', { name: /^Confirm / }).click();
  await expect(page.getByRole('button', { name: 'confirm-cast' })).toBeVisible();
}

/** Wait for the battlefield snapshot to actually be decoded — a 0x0 image
 *  rect makes every tap silently drop (mirrors map-bridge.spec.ts). */
async function waitForMapImage(page: Page) {
  const img = page.getByRole('img', { name: 'Battlefield snapshot' });
  await img.scrollIntoViewIfNeeded();
  await expect
    .poll(
      () => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
      { message: 'the map snapshot never loaded — is the snapdone url servable?' },
    )
    .toBe(true);
  return img;
}

/**
 * Tap the rendered target-map snapshot at normalized (nx, ny).
 *
 * Unlike `map-bridge.spec.ts`'s `tapSnapshot`, `useMapTargetSection` never
 * passes `MapSnapshotViewer` a `marker` prop (there is no drop-pin affordance
 * here — the tap reads back via the target chip/marker state instead), so
 * this settles on the caller's own follow-up assertion rather than a pin
 * appearing (mirrors `live-map.spec.ts`'s `tapMoveMap`).
 */
async function tapTargetMap(page: Page, nx: number, ny: number) {
  const img = await waitForMapImage(page);
  const box = (await img.boundingBox())!;
  const frame = (await page.getByTestId('map-snapshot-frame').boundingBox())!;
  const x = box.x + nx * box.width;
  const y = box.y + ny * box.height;
  if (y < frame.y || y > frame.y + frame.height) {
    throw new Error(`tapTargetMap: ny=${ny} falls outside the clipped frame — pick a point nearer the top`);
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

const showBattlefield = (page: Page) =>
  page.getByRole('button', { name: 'Show the battlefield' }).click();

const targetChip = (page: Page, name: string) => page.getByRole('button', { name: `Target ${name}` });
const focusRow = (page: Page, name: string) => page.getByRole('button', { name: `Focus ${name}` });
const marker = (page: Page, entryId: string) => page.locator(`.tmo-marker[data-entry-id="${entryId}"]`);

test.describe('Map targeting — tap-to-target (#1749 S6)', () => {
  let imageUrl: string;

  test.beforeEach(async ({ reset, seed, request }) => {
    await reset();
    await seed({ character: [character()] });
    imageUrl = await uploadSnapshotImage(request);
  });

  // ── Scenario 1: attacker-centered snapreq ───────────────────────────────

  test('"Show the battlefield" fires a snapreq carrying {moverId, radiusFeet}', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(MAP_TARGET_PROTOCOL) });
    answerCaptures(session, imageUrl);

    await openAbility(page);
    await expect(page.getByTestId('map-target-section')).toBeVisible();
    await showBattlefield(page);

    // 20-ft range, a RANGED strike → targetFramingRadiusFeet doubles it to 40
    // ft (TARGET_FRAMING_INCREMENTS = 2), well inside the
    // [MELEE_FRAMING_RADIUS_FT, MAX_TARGET_FRAMING_RADIUS_FT] = [25, 60] clamp.
    const req = await session.expectSent(
      'cnmh_snapreq_global',
      (v) => v?.moverId === CHAR_ID && v?.radiusFeet === 40,
    );
    expect(req.id).toMatch(/^snap-/);
  });

  // ── Scenario 2: markers + tap-to-target ─────────────────────────────────

  test('markers render from positions (footprint-aware); tapping one toggles it as a target', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(MAP_TARGET_PROTOCOL) });
    answerCaptures(session, imageUrl);

    await openAbility(page);
    await showBattlefield(page);
    await waitForMapImage(page);

    await expect(marker(page, GOBLIN.entryId)).toHaveCount(1);
    await expect(marker(page, OGRE.entryId)).toHaveCount(1);

    // Chips start untargeted.
    await expect(targetChip(page, 'Ogre')).toHaveAttribute('aria-pressed', 'false');

    // Tap well OFF the ogre's centre (0.6, 0.3) but still inside its 2x2
    // footprint (world 500-700, 200-400 → nx 0.5-0.7) — proves the hit test
    // uses the token's actual footprint, not just a point at its centre.
    await tapTargetMap(page, 0.52, 0.21);

    await expect(targetChip(page, 'Ogre')).toHaveAttribute('aria-pressed', 'true');
  });

  // ── Scenario 3: the hidden-combatant sweep, end to end ──────────────────

  test('a hidden combatant is absent from the markers, the target chips, and the initiative strip', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(MAP_TARGET_PROTOCOL) });
    answerCaptures(session, imageUrl);

    await openAbility(page);
    await showBattlefield(page);
    await waitForMapImage(page);

    // Visible combatants ARE there, proving this isn't a marker-derivation
    // failure masking the absence below.
    await expect(marker(page, GOBLIN.entryId)).toHaveCount(1);

    await expect(marker(page, HIDDEN_ASSASSIN.entryId)).toHaveCount(0);
    await expect(targetChip(page, HIDDEN_ASSASSIN.name)).toHaveCount(0);
    await expect(focusRow(page, HIDDEN_ASSASSIN.name)).toHaveCount(0);
  });

  // ── Scenario 4: the debounced cnmh_action_<charId> write ────────────────

  test('target changes debounce into one cnmh_action_<charId> write with the right shape', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(MAP_TARGET_PROTOCOL) });
    answerCaptures(session, imageUrl);

    await openAbility(page);
    await showBattlefield(page);
    await waitForMapImage(page);

    // One target via the map, one via the chip — both funnel into the same
    // `useTargeting` set, so the write reports both regardless of source.
    await tapTargetMap(page, 0.25, 0.25); // Goblin's footprint centre
    await targetChip(page, 'Ogre').click();

    const action = await session.expectSent(
      `cnmh_action_${CHAR_ID}`,
      (v) => Array.isArray(v?.targets) && v.targets.length === 2,
    );
    expect(action.kind).toBe('strike'); // ability.type === 'ranged' → 'strike'
    expect(action.sourceUid).toBe(ABILITY_NAME); // no ability.id → falls back to the name
    expect(action.targets.sort()).toEqual([GOBLIN.entryId, OGRE.entryId].sort());
    expect(typeof action.ts).toBe('number');
  });

  // ── Scenario 5: fallbacks ────────────────────────────────────────────────

  test('below protocol 17: no map section renders, but the chip list still targets', async ({ page }) => {
    await mockSession(page, { seed: baseSeed(MAP_TARGET_PROTOCOL - 1) });

    await openAbility(page);
    await expect(page.getByTestId('map-target-section')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Show the battlefield' })).toHaveCount(0);

    await targetChip(page, 'Goblin').click();
    await expect(targetChip(page, 'Goblin')).toHaveAttribute('aria-pressed', 'true');
  });

  test('ok:false on the capture keeps the chip list working', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(MAP_TARGET_PROTOCOL) });
    session.onSent('cnmh_snapreq_global', (req) => {
      session.push('cnmh_snapdone_global', { id: req.id, ok: false, ts: Date.now() });
    });

    await openAbility(page);
    await showBattlefield(page);

    await expect(page.getByText('No map came back — pick your targets from the list.')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toHaveCount(0);

    await targetChip(page, 'Ogre').click();
    await expect(targetChip(page, 'Ogre')).toHaveAttribute('aria-pressed', 'true');
  });
});
