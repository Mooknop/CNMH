/**
 * Cones and lines — the trailing E2E for epic #1735 (CLOSED; this is its
 * follow-up S4). Everything under test is MERGED on main (PRs #1763/#1764/
 * #1765): protocol-18 `templateplace` growing `direction` (compass degrees,
 * multiples of 45) + `width` (line only), `coneCells`/`lineCells` self-origin
 * geometry (`src/utils/spellArea.js`), the rosette-first flow in
 * `useTemplatePlacementSection` gated at `DIRECTIONAL_AREA_PROTOCOL = 18`,
 * `SnapshotAreaOverlay`'s `templateCells` preview, hidden-occupant filtering
 * (all four shapes, retroactive to burst/emanation), and the sub-18 "GM calls
 * who is caught" fallback kept verbatim.
 *
 * This file extends `map-template.spec.ts` (#1751 S6)'s own harness — the
 * snapshot-upload trick, `answerCaptures`, `tapAreaMap`, the caster-centered
 * capture flow — rather than reinventing it; cone/line just never need a tap
 * for their own origin once the bridge is at DIRECTIONAL_AREA_PROTOCOL, so
 * most scenarios here skip `tapAreaMap` entirely.
 *
 * Real seeded spells drive the scenarios, exactly as the epic's own #1735 S1
 * doc comment (`spellArea.js`) verifies its cone/line math against:
 *   - Dizzying Colors (`dizzying-colors`) — 15-foot cone, Will save. The
 *     doc comment's own worked example ("a 15-ft cardinal cone from a 1x1
 *     caster is 7 squares, 1/3/3 by rank") is the cell count every cone
 *     scenario below asserts against.
 *   - Lightning Bolt (`lightning-bolt`) — 120-foot line, basic Reflex,
 *     electricity damage. Drives the width-default scenario.
 *   - Sleep (`sleep`) — 5-foot burst, Will save. The one non-directional
 *     shape here, needed only for the retroactive hidden-filtering
 *     assertion (the epic's own ruling: the fix applies to burst/emanation
 *     too, not just cone/line).
 * None of the three share a tradition with each other (Dizzying Colors is
 * arcane/occult, Lightning Bolt is arcane/primal, Sleep is arcane/occult),
 * but nothing in the cast flow gates a repertoire spell on the caster's own
 * `spellcasting.tradition` tag (verified by reading `useCastingResources.jsx`
 * and `SpellsRepertoire.jsx` — neither filters on it), so one caster with one
 * repertoire covers all three, same as map-template.spec's own three-spell
 * caster.
 */

import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';
import {
  snapshotSpells, casterCharacter, gotoSheet, openSpellsSegment, castSpell,
} from '../../helpers/spellcasting';
import { openPlayTab } from '../../helpers/sheet';
import { openEdit, commitSave } from '../../helpers/rollSheet';
import { bridgeHello, DIRECTIONAL_AREA_PROTOCOL, MAP_TARGET_PROTOCOL } from '../../helpers/bridge';

const CHAR_ID = 'e2e-cone-line-caster';
const CHAR_NAME = 'E2E Cone Line Caster';
const SCENE_ID = 'e2e-cone-line-scene';

const CONE_SPELL = { id: 'dizzying-colors', name: 'Dizzying Colors', feet: 15 };
const LINE_SPELL = { id: 'lightning-bolt', name: 'Lightning Bolt', feet: 120 };
const BURST_SPELL = { id: 'sleep', name: 'Sleep', feet: 5 };

const CASTER_ENTRY = { entryId: 'ent-cl-caster', kind: 'pc' as const, charId: CHAR_ID, name: CHAR_NAME, initiative: 20 };
// Sits one square east of the caster's own space — inside a 15-ft EAST cone
// (spellArea.js's own worked example: 7 squares, "1/3/3 by rank") AND inside
// a 120-ft EAST line. NOT inside a 15-ft NORTH cone (whose cells are all
// row <= 0 for a caster at row 1) — the "known excluded" reference point for
// scenario 1, and the direction that flips for scenario 2.
const EAST_ENTRY = { entryId: 'ent-cl-east', kind: 'enemy' as const, name: 'East Target', initiative: 10 };
// Inside the 15-ft NORTH cone, outside the EAST cone/line — scenario 2's
// "a cell unique to each direction" other half.
const NORTH_ENTRY = { entryId: 'ent-cl-north', kind: 'enemy' as const, name: 'North Target', initiative: 9 };
// Shares EAST_ENTRY's cone/line membership (both are in the east-facing cell
// set) but carries `hidden: true` — the epic's retroactive hidden-filtering
// ruling is what this spec proves keeps it off every player-facing occupant
// list and out of every save request, cone/line included.
const HIDDEN_ENTRY = { entryId: 'ent-cl-hidden', kind: 'enemy' as const, name: 'Hidden Lurker', initiative: 8, hidden: true };
const ORDER = [CASTER_ENTRY, EAST_ENTRY, NORTH_ENTRY, HIDDEN_ENTRY];

// gridSize 100, caster 1x1 at (1,1) — matching map-template.spec's
// IDENTITY_CAPTURE convention (world pixels == capture-space pixels), so tap
// math (only needed for the sub-floor fallback and the retroactive burst
// scenario) stays simple.
const POSITIONS = {
  gridSize: 100,
  positions: {
    [CASTER_ENTRY.entryId]: { col: 1, row: 1 },
    [EAST_ENTRY.entryId]: { col: 3, row: 1 },
    [NORTH_ENTRY.entryId]: { col: 1, row: -1 },
    [HIDDEN_ENTRY.entryId]: { col: 4, row: 1 },
  },
};

const IDENTITY_CAPTURE = {
  a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 1000, screenH: 1000, sceneId: SCENE_ID,
};

const caster = () =>
  casterCharacter({
    id: CHAR_ID,
    name: CHAR_NAME,
    level: 5,
    slots: { '1': 3, '3': 2 },
    repertoire: [CONE_SPELL.id, LINE_SPELL.id, BURST_SPELL.id],
  });

const baseSeed = (protocol: number) => ({
  cnmh_bridgehello_global: bridgeHello(protocol, 'e2e-cone-line-bridge'),
  cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, { order: ORDER }),
  [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
  cnmh_positions_global: POSITIONS,
});

// An 8x8 PNG (84 bytes) — the same fixture map-template.spec/map-bridge.spec use.
const SNAPSHOT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAG0lEQVR4nGNY5RJq7BKKSTJgFV3l' +
    'EsowKHUAAMQfQeFax4r+AAAAAElFTkSuQmCC',
  'base64',
);

async function uploadSnapshotImage(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/gm/images', {
    multipart: {
      file: { name: 'e2e-cone-line-snapshot.png', mimeType: 'image/png', buffer: SNAPSHOT_PNG },
      name: 'E2E cone/line snapshot',
      folder: 'Scene Snapshots',
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  return `/api/images/${id}`;
}

const ackFor = (id: string, url: string) => ({
  id, ok: true, url, capture: IDENTITY_CAPTURE,
  worldRect: { x1: 0, y1: 0, x2: 1000, y2: 1000 }, gridSize: 100, ts: Date.now(),
});

/** Play the bridge: answer every capture request with `ack(id)`. */
function answerCaptures(session: MockSession, imageUrl: string) {
  session.onSent('cnmh_snapreq_global', (req) => {
    session.push('cnmh_snapdone_global', ackFor(req.id, imageUrl));
  });
}

const sentValues = (session: MockSession, stateType: string) =>
  session.sent.filter((m) => m.stateType === stateType).map((m) => m.value as any);

/** Sheet → Encounter tab, gated on encounter hydration. */
async function openEncounterTab(page: Page) {
  await gotoSheet(page, CHAR_ID, CHAR_NAME);
  await openPlayTab(page, 'Encounter');
  await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible();
}

/** Encounter tab → deck's Spells segment → the named spell's cast modal. */
async function openAreaCast(page: Page, spellName: string) {
  await openEncounterTab(page);
  await openSpellsSegment(page);
  await castSpell(page, spellName);
  await expect(page.getByRole('button', { name: 'confirm-cast' })).toBeVisible();
}

/** Tap the rendered snapshot at normalized (nx, ny) — mirrors
 *  map-template.spec's `tapAreaMap` (only needed by the sub-floor fallback
 *  and the retroactive burst scenario; every directional-flow scenario below
 *  never taps at all). */
async function tapAreaMap(page: Page, nx: number, ny: number) {
  const img = page.getByRole('img', { name: 'Battlefield snapshot' });
  await img.scrollIntoViewIfNeeded();
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
    .toBe(true);
  const box = (await img.boundingBox())!;
  await page.mouse.move(box.x + nx * box.width, box.y + ny * box.height);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByTestId('map-snapshot-pin')).toBeVisible();
}

const placementSection = (page: Page) => page.getByTestId('area-placement-section');
const placeOnMapButton = (page: Page) => placementSection(page).getByRole('button', { name: 'Place on the map' });
const confirmCast = (page: Page) => page.getByRole('button', { name: 'confirm-cast' });
const occupants = (page: Page) => page.getByTestId('area-occupants');

/** DirectionRosette's group — same component, same `${shape} facing` label,
 *  whether it's the #1735 S3 rosette-first flow or the pre-#1735 post-tap
 *  fallback (DirectionRosette itself has no idea which caller it's in). */
const rosette = (page: Page, shape: string) => page.getByRole('group', { name: `${shape} facing` });
const pickDirection = (page: Page, shape: string, direction: string) =>
  rosette(page, shape).getByRole('button', { name: direction, exact: true }).click();

test.describe('Cone and line casting (#1735 S4)', () => {
  let imageUrl: string;

  test.beforeEach(async ({ reset, seed, request }) => {
    await reset();
    await seed({
      spell: snapshotSpells(CONE_SPELL.id, LINE_SPELL.id, BURST_SPELL.id),
      character: [caster()],
    });
    imageUrl = await uploadSnapshotImage(request);
  });

  // ── Scenario 1: rosette-first (no tap), live cell preview, directional payload ──

  test('a cone shows its rosette with no origin tap, previews real cells, and sends a directional templateplace', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(DIRECTIONAL_AREA_PROTOCOL) });
    answerCaptures(session, imageUrl);

    await openAreaCast(page, CONE_SPELL.name);
    await placeOnMapButton(page).click();

    // The rosette shows the instant the snapshot lands — no origin tap first,
    // unlike every placeable shape (burst) and unlike the pre-#1735 fallback.
    await expect(rosette(page, 'cone')).toBeVisible();
    await expect(page.getByTestId('map-snapshot-pin')).toHaveCount(0);

    await pickDirection(page, 'cone', 'east');

    // The overlay draws the REAL cell coverage, not a facing hint: a 15-ft
    // cardinal cone from a 1x1 caster is 7 squares (spellArea.js's own doc
    // comment, verified against the Player Core cone diagrams).
    await expect(page.locator('svg.sao--cone')).toHaveCount(1);
    await expect(page.locator('.sao-template-cell')).toHaveCount(7);
    // No burst/emanation-style outline, and no pre-#1735 facing-arrow hint —
    // the real cell set supersedes it.
    await expect(page.locator('.sao-outline')).toHaveCount(0);
    await expect(page.locator('.sao-direction-shaft')).toHaveCount(0);

    // A known cell present (East Target, inside the east cone) and a known
    // cell absent (North Target, outside it).
    const list = occupants(page);
    await expect(list).toContainText('East Target');
    await expect(list).not.toContainText('North Target');

    await confirmCast(page).click();

    const [template] = sentValues(session, 'templateplace');
    expect(template).toMatchObject({
      shape: 'cone', feet: CONE_SPELL.feet, direction: 90, sceneId: SCENE_ID, name: CONE_SPELL.name,
    });
    // The self-derived origin: the east face's midpoint of the caster's 1x1
    // rectangle at (1,1) is (2, 1.5) in grid squares (directionalOriginWorld /
    // selfOriginPoint, spellArea.js) — * gridSize 100.
    expect(template.x).toBe(200);
    expect(template.y).toBe(150);
    // A cone never carries `width` — only a line does.
    expect(template.width).toBeUndefined();
  });

  // ── Scenario 2: direction change re-renders the previewed cells ──────────

  test('picking a different rosette direction swaps the previewed cells', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(DIRECTIONAL_AREA_PROTOCOL) });
    answerCaptures(session, imageUrl);

    await openAreaCast(page, CONE_SPELL.name);
    await placeOnMapButton(page).click();
    await expect(rosette(page, 'cone')).toBeVisible();

    const list = occupants(page);

    await pickDirection(page, 'cone', 'east');
    await expect(list).toContainText('East Target');
    await expect(list).not.toContainText('North Target');
    await expect(page.locator('.sao-template-cell')).toHaveCount(7);

    // Same rosette, a different pick — the previewed cells (and therefore the
    // occupant list, which is derived from the same cell set) flip.
    await pickDirection(page, 'cone', 'north');
    await expect(list).toContainText('North Target');
    await expect(list).not.toContainText('East Target');
    // A 15-ft cardinal cone is 7 squares from ANY of the 4 cardinal facings
    // (symmetric about the caster) — same count, different cells, which is
    // exactly why the occupant-membership assertions above (not just this
    // count) are what proves the cell SET actually changed.
    await expect(page.locator('.sao-template-cell')).toHaveCount(7);
  });

  // ── Scenario 3: a line sends its default width ────────────────────────────

  test('a line sends width:5 (the PF2e default) alongside its direction', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(DIRECTIONAL_AREA_PROTOCOL) });
    answerCaptures(session, imageUrl);

    await openAreaCast(page, LINE_SPELL.name);
    await placeOnMapButton(page).click();
    await expect(rosette(page, 'line')).toBeVisible();
    await pickDirection(page, 'line', 'east');

    // 120 ft / 5 ft per square = 24 squares, 1 chain wide (the un-authored
    // "120-foot line" text carries no explicit width clause, so lineCells'
    // own PF2e default of 5 ft applies).
    await expect(page.locator('svg.sao--line')).toHaveCount(1);
    await expect(page.locator('.sao-template-cell')).toHaveCount(24);

    await confirmCast(page).click();

    // buildTemplatePlace (snapshotRelay.js) — width rides alongside direction
    // for a line, exactly as applyOnConfirm's `area.width || 5` sends it: this
    // content's area text carries no override, so it's the bare default, not
    // an omitted field.
    const [template] = sentValues(session, 'templateplace');
    expect(template).toMatchObject({
      shape: 'line', feet: LINE_SPELL.feet, direction: 90, width: 5, sceneId: SCENE_ID, name: LINE_SPELL.name,
    });
    expect(template.x).toBe(200);
    expect(template.y).toBe(150);
  });

  // ── Scenario 4: adopted occupants populate the save-request preview ──────

  test('occupants in the cone populate the save-request preview and the sent saveRequests', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(DIRECTIONAL_AREA_PROTOCOL) });
    answerCaptures(session, imageUrl);

    await openAreaCast(page, CONE_SPELL.name);
    await placeOnMapButton(page).click();
    await pickDirection(page, 'cone', 'east');

    await placementSection(page).getByRole('button', { name: 'Target these 1', exact: true }).click();

    // Adopting flips saveTargets non-empty, which flips the modal onto
    // RollSheet's save-mode layout (useSaveSheet) — its editPanel (where the
    // placement section AND the save-request preview both live) is
    // collapsed by default, so it needs an explicit Edit tap to re-inspect.
    await openEdit(page);
    const preview = page.locator('.ct-save-request-preview li');
    await expect(preview).toHaveCount(1);
    await expect(preview).toContainText('East Target');

    await commitSave(page);

    await session.expectSent('cnmh_encounter_global', (v) =>
      Array.isArray(v?.saveRequests)
      && v.saveRequests.some((r: any) => (r.targets || []).some((t: any) => t.name === 'East Target')));
    await expect.poll(() => sentValues(session, 'templateplace').length).toBeGreaterThan(0);
  });

  // ── Scenario 5: hidden filtering — cone occupants + save request ─────────

  test('a hidden combatant in the cone is absent from occupants and never gets a save request', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(DIRECTIONAL_AREA_PROTOCOL) });
    answerCaptures(session, imageUrl);

    await openAreaCast(page, CONE_SPELL.name);
    await placeOnMapButton(page).click();
    await pickDirection(page, 'cone', 'east');

    // Hidden Lurker sits in the SAME east-cone cell set as East Target (both
    // are real members of the 7-cell coverage) but never appears — the
    // epic's own hidden-filtering ruling, cone/line included.
    const list = occupants(page);
    await expect(list).toContainText('East Target');
    await expect(list).not.toContainText('Hidden Lurker');
    // Only East Target's cell is shaded as an occupant cell — Hidden
    // Lurker's is a real cone cell (counted in the 7 above) but never shaded,
    // because it was dropped before `occupantCells` was ever built.
    await expect(page.locator('.sao-cell')).toHaveCount(1);
    await expect(page.locator('.sao-template-cell')).toHaveCount(7);
    await expect(placementSection(page).getByRole('button', { name: 'Target these 1', exact: true })).toBeVisible();

    await placementSection(page).getByRole('button', { name: 'Target these 1', exact: true }).click();
    await openEdit(page);
    const preview = page.locator('.ct-save-request-preview li');
    await expect(preview).toHaveCount(1);
    await expect(preview).toContainText('East Target');

    await commitSave(page);

    await session.expectSent('cnmh_encounter_global', (v) =>
      Array.isArray(v?.saveRequests)
      && v.saveRequests.some((r: any) => (r.targets || []).some((t: any) => t.name === 'East Target')));

    // No sent encounter update ever put Hidden Lurker in a saveRequests
    // target list — not just "the last one doesn't", any of them.
    const leaked = sentValues(session, 'encounter').some((v) =>
      (v?.saveRequests || []).some((r: any) => (r.targets || []).some((t: any) => t.name === 'Hidden Lurker')));
    expect(leaked).toBe(false);
  });

  // ── Scenario 5b: the retroactive fix — a burst leaks the same latent way ─

  test('a hidden combatant in a burst is also absent from occupants (retroactive #1735 fix)', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(DIRECTIONAL_AREA_PROTOCOL) });
    answerCaptures(session, imageUrl);

    await openAreaCast(page, BURST_SPELL.name);
    await placeOnMapButton(page).click();
    // Tap (0.4, 0.1) -> world (400,100) -> the grid intersection (4,1), the
    // corner both East Target's cell (3,1) and Hidden Lurker's cell (4,1)
    // touch — both 0 ft from the burst's own origin, well within its 5-ft
    // reach.
    await tapAreaMap(page, 0.4, 0.1);

    const list = occupants(page);
    await expect(list).toContainText('East Target');
    await expect(list).not.toContainText('Hidden Lurker');
    await expect(placementSection(page).getByRole('button', { name: 'Target these 1', exact: true })).toBeVisible();
  });

  // ── Scenario 6: sub-DIRECTIONAL_AREA_PROTOCOL fallback ───────────────────

  test('below DIRECTIONAL_AREA_PROTOCOL a cone keeps the pre-#1735 tap+ping fallback verbatim', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(MAP_TARGET_PROTOCOL) });
    answerCaptures(session, imageUrl);

    await openAreaCast(page, CONE_SPELL.name);
    await placeOnMapButton(page).click();
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toBeVisible();

    // No rosette-first flow below the floor — the whole measured/rosette
    // preview is absent until a tap happens (and even then it is the OLD,
    // non-measuring rosette, not #1735's cell preview).
    await expect(rosette(page, 'cone')).toHaveCount(0);
    await expect(occupants(page)).toHaveCount(0);

    // Tap (0.3, 0.1) -> world (300,100), already grid-aligned (a clean
    // intersection, no snap rounding to reason about).
    await tapAreaMap(page, 0.3, 0.1);

    await expect(placementSection(page)).toContainText(
      "A cone needs a facing, so the GM calls who is caught — your mark pings the map on confirm. Cell occupancy for cones/lines needs #1735's geometry, not built here.",
    );
    await expect(rosette(page, 'cone')).toBeVisible();
    await pickDirection(page, 'cone', 'east');
    // Occupancy never computes below the floor, whatever facing gets picked —
    // this rosette is a cosmetic facing hint only on this path.
    await expect(occupants(page)).toHaveCount(0);

    await confirmCast(page).click();

    // A ping, not a templateplace — the v13/pre-#1735 aim-point fallback.
    const [ping] = sentValues(session, 'pingpoint');
    expect(ping).toMatchObject({ x: 300, y: 100, sceneId: SCENE_ID });
    expect(sentValues(session, 'templateplace')).toHaveLength(0);

    // The cast completed regardless — back on the encounter surface, modal gone.
    await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible();
  });
});
