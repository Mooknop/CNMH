/**
 * Armed payloads and the rest of the elemental-storm automation vocabulary
 * (#987, PRs #1512–#1524; gap #1600). Everything that wave built is a *rail*
 * other content reuses, and none of it had E2E: `armedPayloads` was unreferenced
 * anywhere under `e2e/`.
 *
 * The through-line is "this does NOT resolve at cast". A spell whose damage only
 * lands when something else happens later — the next attack that hits a beaconed
 * creature, a creature ending its turn on the ice — cannot be authored as
 * cast-time `damageData` or it detonates at the wrong moment. So the cast parks
 * the payload on the encounter (`encounter.armedPayloads`) and the GM fires it
 * from the Armed Effects console when the authored trigger actually happens.
 * That split is what this spec drives:
 *
 *   ARM  (player surface) — the sheet's Spells segment → CastSpellModal →
 *        confirm, asserted on the synced `cnmh_encounter_global` write.
 *   FIRE (GM console)     — `/gm/dock`'s ArmedPayloads panel, which is the only
 *        surface that fires one. A payload is GM bookkeeping by design: there is
 *        no automatic per-turn prompt (#987's ledger explicitly leaves that as
 *        "the convenience of an automatic per-turn prompt"), so "fires on a turn
 *        boundary" is asserted as the GM firing it after the turn advances, not
 *        as an automation that does it unprompted.
 *
 * Alongside them, the two sibling rails from the same wave that DO resolve at
 * cast: `secondaryProfiles` (#1520 — Propagating Arc's splash zone gets its own
 * target picker and its own save request) and `variants` (#1519 — Crushing
 * Stampede's 1/2/3-action damage), plus the `saveConditions` ladder (#1518 —
 * Steal the Show), whose four degrees are pinned with hand-picked d20/save-mod
 * pairs rather than derived from a stat block.
 *
 * Every spell doc is the REAL bundled seed (`snapshotSpells`), because the whole
 * point of the wave is that the authored vocabulary works — a hand-written stub
 * would prove nothing about production content.
 *
 * Two product bugs found while writing this shipped as documented skips and were
 * fixed in #1617 / #1618; the boxes that pinned them are live below:
 *   • Targeting Beacon's explosion armed with `dc: null` — its spell has no
 *     cast-time `defense` at all — so Fire could never build a save request.
 *     The arming block now derives the payload's DC from the payload's OWN
 *     defense, and the fire path says why when it still cannot resolve one.
 *   • `severityFromSave` was dropped by the arming block's fixed field list, so
 *     Gruesome Marionettist's half/full/double picker never reached the panel
 *     from a live cast. The authored payload now travels whole.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import {
  activeEncounter,
  encounterState,
  enemyEntry,
  pcEntry,
  readyTurnState,
} from '../../helpers/encounter';
import {
  casterCharacter,
  castSpell,
  gotoSheet,
  openSpellsSegment,
  snapshotSpells,
} from '../../helpers/spellcasting';

const CHAR_ID = 'e2e-caster';
const CHAR_NAME = 'E2E Caster';

const SPELL_IDS = [
  'winters-grasp',      // armed save payload (basic Fortitude ice tick, repeatable)
  'autumns-howl',       // armed persistent payload (no save, repeatable)
  'targeting-beacon',   // armed one-shot payload (basic Reflex explosion)
  'gruesome-marionettist', // armed persistent payload with a severity picker
  'propagating-arc',    // secondaryProfiles — the splash zone (#1520)
  'crushing-stampede',  // variants — 1/2/3-action damage (#1519)
  'steal-the-show',     // saveConditions — the four-degree ladder (#1518)
];

// Level 12 + Cha 16 + expert (proficiency 2) → spell DC 10 + 3 + (12 + 4) = 29.
// Pinned as a constant so the payload's DC — captured at ARM time, either from
// the cast's own save or (#1617) derived from the payload's own defense when the
// cast called for no save — is asserted as an exact number.
const SPELL_DC = 29;

// Enemies carry bridge-imported defenses so save requests pick up real saveMods.
const TROLL = {
  ...enemyEntry('Frost Troll', 10),
  defenses: { ac: 24, saves: { fortitude: 14, reflex: 9, will: 11 } },
};
const OGRE = {
  ...enemyEntry('Cave Ogre', 8),
  defenses: { ac: 20, saves: { fortitude: 12, reflex: 6, will: 5 } },
};

// PC entry matching activeEncounter()'s own id, for the player-surface tests.
const CASTER_ENTRY = {
  entryId: `e2e-${CHAR_ID}`,
  kind: 'pc',
  charId: CHAR_ID,
  name: CHAR_NAME,
  initiative: 20,
};

// One caster holding every spell this spec casts, with slots at each native
// rank (2 / 4 / 5) so the cast picker's first enabled option is the spell's own
// rank and `directCastRank` is predictable.
const caster = () =>
  casterCharacter({
    id: CHAR_ID,
    name: CHAR_NAME,
    level: 12,
    slots: { '2': 3, '4': 3, '5': 3 },
    repertoire: SPELL_IDS,
  });

// ── Local helpers ────────────────────────────────────────────────────────────
// Deliberately local (#1600 ran alongside sibling player specs against the same
// e2e/helpers). `armedFrom` is the factor-out candidate: a cast-flow harness
// addition `armedPayload(spellId, { dc, rank })` would let any spec seed the
// encounter side of a deferred trigger without restating the mapping.

/** Find a log line on the synced encounter record matching every needle. */
const logHas =
  (...needles: string[]) =>
  (v: any) =>
    Array.isArray(v?.log) &&
    v.log.some((e: any) => needles.every((n) => String(e.text).includes(n)));

/** The save requests on a synced encounter record, newest last. */
const reqs = (v: any) => (Array.isArray(v?.saveRequests) ? v.saveRequests : []);

/**
 * An armed payload in the shape `UseAbilityModal`'s confirm block stores — the
 * authored payload doc, carried WHOLE, plus the cast-time context (DC, chosen
 * rank, caster). Mirrors that block exactly, including the spread that #1618
 * replaced the old fixed field list with: seeding a hand-picked subset here is
 * how `severityFromSave` went unnoticed in the first place.
 *
 * Seeded rather than cast because mockSession replays its ORIGINAL seed on every
 * connect: a payload armed on the sheet is gone by the time the page navigates
 * to /gm/dock. The "arm" tests above are what prove this mapping is faithful.
 */
const armedFrom = (spellId: string, { dc, rank }: { dc: number | null; rank: number }) => {
  const spell = snapshotSpells(spellId)[0] as any;
  const { id: payloadId, ...authored } = spell.armedPayloads[0];
  return {
    ...authored,
    id: `armed-e2e-${payloadId}`,
    ts: Date.now(),
    payloadId,
    note: authored.note ?? null,
    repeatable: !!authored.repeatable,
    dc,
    rank,
    spellLevel: spell.level,
    abilityName: spell.name,
    casterId: CHAR_ID,
    casterName: CHAR_NAME,
  };
};

/** Seed + navigate to the sheet's Spells segment with the caster's turn live. */
async function gotoCasterTurn(page: Page): Promise<MockSession> {
  const mock = await mockSession(page, {
    seed: {
      cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, {
        order: [CASTER_ENTRY, TROLL, OGRE],
      }),
      // '1:0' matches activeEncounter's round:index — without the token the
      // turn-begin sweep treats the mount as a fresh turn and resets turnstate.
      [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
    },
  });
  await gotoSheet(page, CHAR_ID, CHAR_NAME);
  await openSpellsSegment(page);
  return mock;
}

/** The GM dock, on the caster's turn, with whatever encounter extras are needed. */
async function gotoDock(page: Page, extra: Record<string, unknown> = {}): Promise<MockSession> {
  const mock = await mockSession(page, {
    seed: {
      cnmh_encounter_global: {
        ...encounterState({
          phase: 'in-progress',
          round: 2,
          currentTurnIndex: 0,
          order: [pcEntry(CHAR_ID, CHAR_NAME, 20), TROLL, OGRE],
        }),
        ...extra,
      },
      [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('2:0'),
    },
  });
  // `domcontentloaded` rather than the default `load`: the dock pulls the
  // background image and the icon font, and waiting on every subresource made
  // this navigation the spec's one flake source on a loaded machine. The
  // hydration gate below is the real barrier anyway.
  await page.goto('/gm/dock', { waitUntil: 'domcontentloaded' });
  // Encounter-hydration gate: "End turn" only exists once the dock has an
  // in-progress encounter with a PC up.
  await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible({ timeout: 15_000 });
  return mock;
}

const gmConsole = (page: Page) => page.getByRole('complementary', { name: 'GM console' });

test.describe('Armed payloads', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      spell: snapshotSpells(...SPELL_IDS),
      character: [caster()],
    });
  });

  // ── Arm ────────────────────────────────────────────────────────────────────

  test("casting Winter's Grasp arms the ice tick beside its own cast-time save", async ({ page }) => {
    const mock = await gotoCasterTurn(page);
    await castSpell(page, "Winter's Grasp");
    await page.getByRole('button', { name: 'Target Frost Troll' }).click();
    // A save request only carries a `damage` block when the caster entered a
    // rolled total (or a rider is on), so type one — the GM derives every
    // target's per-degree total from it.
    await page.getByLabel('rolled damage total').fill('14');
    await page.getByRole('button', { name: 'confirm-cast' }).click();

    // The payload lands on the encounter with the cast-time context it will need
    // when it fires much later: the caster's DC, the rank it was armed at, and
    // the spell's native rank (the baseline it heightens FROM).
    const enc = await mock.expectSent(
      'cnmh_encounter_global',
      (v: any) => (v?.armedPayloads || []).length > 0,
    );
    expect(enc.armedPayloads).toHaveLength(1);
    expect(enc.armedPayloads[0]).toMatchObject({
      payloadId: 'winters-grasp-ice-tick',
      label: 'Ending a turn on the ice',
      // Its OWN save — a basic Fortitude, deliberately different from the cast's
      // basic Reflex. That difference is why it needed a payload at all.
      defense: 'basic Fortitude',
      repeatable: true,
      dc: SPELL_DC,
      rank: 4,
      spellLevel: 4,
      abilityName: "Winter's Grasp",
      casterId: CHAR_ID,
      casterName: CHAR_NAME,
    });
    expect(enc.armedPayloads[0].damageData).toMatchObject({ base: '8', type: 'cold' });
    expect(enc.armedPayloads[0].trigger).toContain('ends its turn');

    // The trigger text is announced so the table knows something is pending.
    await mock.expectSent(
      'cnmh_encounter_global',
      logHas("Winter's Grasp: Ending a turn on the ice is armed", 'ends its turn standing on the ice'),
    );

    // The cast's own save is untouched — basic Reflex, 4d6 cold — and is the
    // ONLY save request produced. The ice tick resolves nothing yet.
    const cast = reqs(enc).find((r: any) => r.abilityName === "Winter's Grasp");
    expect(cast).toMatchObject({ save: 'reflex', basic: true, dc: SPELL_DC, rank: 4 });
    expect(cast.damage).toMatchObject({ expression: '4d6', typeLabel: 'cold', entered: 14 });
    expect(reqs(enc)).toHaveLength(1);
  });

  test('Targeting Beacon arms its explosion and detonates nothing at cast', async ({ page }) => {
    const mock = await gotoCasterTurn(page);
    await castSpell(page, 'Targeting Beacon');
    await page.getByRole('button', { name: 'Target Frost Troll' }).click();
    await page.getByRole('button', { name: 'confirm-cast' }).click();

    const enc = await mock.expectSent(
      'cnmh_encounter_global',
      (v: any) => (v?.armedPayloads || []).length > 0,
    );
    expect(enc.armedPayloads[0]).toMatchObject({
      payloadId: 'targeting-beacon-explosion',
      label: 'Beacon explosion',
      defense: 'basic Reflex',
      // One-shot: "when the beacon explodes, the spell ends".
      repeatable: false,
      abilityName: 'Targeting Beacon',
    });
    expect(enc.armedPayloads[0].damageData).toMatchObject({ base: '6d6', type: 'fire' });
    expect(enc.armedPayloads[0].trigger).toContain('HITS');

    // …and it still arms WITH a DC (#1617), even though Targeting Beacon has no
    // cast-time `defense` of its own: resolveActionRoll falls through to mode
    // 'none', so there is no cast DC to copy. The arming block derives one from
    // the payload's OWN defense instead — a spell DC belongs to the caster and
    // the rank, not to whether this cast happened to call for a save. Copying
    // the cast's null used to make the explosion unfireable forever.
    expect(enc.armedPayloads[0].dc).toBe(SPELL_DC);

    // The whole reason this spell was deferred: nothing resolves now. The armed
    // entry above is the anchor for the absence assertion — the confirm handler
    // has demonstrably run by the time it exists.
    expect(reqs(enc)).toHaveLength(0);
  });

  // ── Fire ───────────────────────────────────────────────────────────────────

  test("firing a save payload builds a normal save request at the payload's own defense", async ({ page }) => {
    // Armed at rank 6 (two over its native 4) so the panel has to show what it
    // will ACTUALLY deal: flat 8 cold +2 per rank → 12.
    const payload = armedFrom('winters-grasp', { dc: SPELL_DC, rank: 6 });
    const mock = await gotoDock(page, { armedPayloads: [payload] });

    const console_ = gmConsole(page);
    const card = console_.locator('.gm-save-req-card').filter({ hasText: 'Ending a turn on the ice' });
    await expect(console_.getByRole('heading', { name: 'Armed Effects' })).toBeVisible();
    // Pending GM work — 0 save requests + 1 payload — surfaces on the toggle.
    await expect(page.getByRole('button', { name: 'GM console (1)' })).toBeVisible();

    // The trigger is the GM's only cue for when to fire it, so it is always shown.
    await expect(card).toContainText('ends its turn standing on the ice');
    await expect(card).toContainText('(repeatable)');
    await expect(card).toContainText('12');
    await expect(card).toContainText('Fortitude');
    await expect(card).toContainText(String(SPELL_DC));

    // Nothing fires without a target.
    await expect(card.getByRole('button', { name: 'Fire' })).toBeDisabled();
    await card.getByLabel('Frost Troll').check();
    await card.getByLabel('Ending a turn on the ice damage').fill('12');
    await card.getByRole('button', { name: 'Fire' }).click();

    // A perfectly ordinary save request — same builder as any cast, so degrees,
    // riders and IWR all behave identically downstream.
    const enc = await mock.expectSent('cnmh_encounter_global', (v: any) =>
      reqs(v).some((r: any) => r.abilityName?.includes('Ending a turn on the ice')),
    );
    const req = reqs(enc).find((r: any) => r.abilityName?.includes('Ending a turn on the ice'));
    expect(req).toMatchObject({
      abilityName: "Winter's Grasp — Ending a turn on the ice",
      save: 'fortitude',
      basic: true,
      dc: SPELL_DC,
      rank: 6,
      casterName: CHAR_NAME,
    });
    expect(req.targets).toEqual([{ entryId: TROLL.entryId, name: 'Frost Troll', saveMod: 14 }]);
    expect(req.damage).toMatchObject({ entered: 12, typeLabel: 'cold' });

    await mock.expectSent(
      'cnmh_encounter_global',
      logHas("Winter's Grasp: Ending a turn on the ice fired at Frost Troll"),
    );
  });

  test('a repeatable boundary payload survives the turn boundary and fires again', async ({ page }) => {
    // Autumn's Howl's wind bleed has NO defense: the persistent piercing simply
    // applies when a creature ends its turn in the area. Armed at rank 4 (two
    // over its native 2) → the "+1 per rank" flat bump makes it 1d6+2.
    const payload = armedFrom('autumns-howl', { dc: SPELL_DC, rank: 4 });
    const mock = await gotoDock(page, { armedPayloads: [payload] });

    const card = gmConsole(page)
      .locator('.gm-save-req-card')
      .filter({ hasText: 'Ending a turn in the wind' });
    await expect(card).toContainText('1d6+2 persistent piercing');
    // No save on firing → no rolled-total input, and (severity never varies for
    // an area tick) no severity picker either.
    await expect(card.getByLabel('Ending a turn in the wind damage')).toHaveCount(0);

    await card.getByLabel('Frost Troll').check();
    await card.getByRole('button', { name: 'Fire' }).click();

    // Recorded straight onto the shared persistent-damage map, keyed by entryId.
    const first = await mock.expectSent(
      'cnmh_persistent_global',
      (v: any) => (v?.[TROLL.entryId] || []).length > 0,
    );
    expect(first[TROLL.entryId][0]).toMatchObject({ dice: '1d6+2', type: 'piercing' });
    expect(first[OGRE.entryId] ?? []).toHaveLength(0);
    await mock.expectSent(
      'cnmh_encounter_global',
      logHas("Autumn's Howl: Ending a turn in the wind", 'applied to Frost Troll'),
    );

    // Repeatable → it is NOT consumed. Ending the turn moves the round on and
    // the payload is still there for the next creature to end its turn inside.
    await page.getByRole('button', { name: 'End turn' }).click();
    await expect(page.getByRole('button', { name: 'End turn' })).toBeHidden();
    await expect(card).toBeVisible();

    await card.getByLabel('Cave Ogre').check();
    await card.getByRole('button', { name: 'Fire' }).click();

    const second = await mock.expectSent(
      'cnmh_persistent_global',
      (v: any) => (v?.[OGRE.entryId] || []).length > 0,
    );
    // Both ticks stand — the first creature's bleed was not replaced.
    expect(second[TROLL.entryId]).toHaveLength(1);
    expect(second[OGRE.entryId][0]).toMatchObject({ dice: '1d6+2', type: 'piercing' });
    await expect(card).toBeVisible();
  });

  test('Dismiss drops an armed payload without resolving anything', async ({ page }) => {
    const payload = armedFrom('winters-grasp', { dc: SPELL_DC, rank: 4 });
    const mock = await gotoDock(page, { armedPayloads: [payload] });

    const card = gmConsole(page)
      .locator('.gm-save-req-card')
      .filter({ hasText: 'Ending a turn on the ice' });
    await card.getByRole('button', { name: 'Dismiss' }).click();

    // The panel self-hides once nothing is armed — that is the anchor for
    // "and no save request was pushed".
    await expect(gmConsole(page).getByRole('heading', { name: 'Armed Effects' })).toBeHidden();
    const enc = await mock.expectSent(
      'cnmh_encounter_global',
      (v: any) => (v?.armedPayloads || []).length === 0,
    );
    expect(reqs(enc)).toHaveLength(0);
  });

  // ── Secondary damage profiles (#1520) ──────────────────────────────────────

  test("Propagating Arc's splash zone emits its own save request", async ({ page }) => {
    const mock = await gotoCasterTurn(page);
    await castSpell(page, 'Propagating Arc');
    await page.getByRole('button', { name: 'Target Frost Troll' }).click();
    // Fill the primary total while it is the only damage panel on screen — the
    // zone below grows an identically-labelled one as soon as it has a target.
    await page.getByLabel('rolled damage total').fill('13');

    // The zone owns its own target picker, independent of the primary's — the
    // splash hits creatures NEAR the struck target, not the target itself.
    const zone = page
      .locator('.ct-section')
      .filter({ hasText: 'Splash — creatures within 10 feet' });
    await zone.getByLabel('Cave Ogre').check();
    await zone.getByLabel('rolled damage total').fill('7');
    await page.getByRole('button', { name: 'confirm-cast' }).click();

    const enc = await mock.expectSent('cnmh_encounter_global', (v: any) => reqs(v).length >= 2);
    const primary = reqs(enc).find((r: any) => r.abilityName === 'Propagating Arc');
    const splash = reqs(enc).find((r: any) => r.abilityName?.includes('Splash'));

    // Two independent saves against two independent target sets.
    expect(primary).toMatchObject({ save: 'reflex', basic: true, dc: SPELL_DC });
    expect(primary.damage).toMatchObject({ expression: '2d12', typeLabel: 'electricity', entered: 13 });
    expect(primary.targets.map((t: any) => t.name)).toEqual(['Frost Troll']);

    expect(splash).toMatchObject({
      abilityName: 'Propagating Arc — Splash — creatures within 10 feet',
      save: 'reflex',
      basic: true,
      dc: SPELL_DC,
    });
    expect(splash.damage).toMatchObject({ expression: '2d6', typeLabel: 'electricity', entered: 7 });
    expect(splash.targets).toEqual([{ entryId: OGRE.entryId, name: 'Cave Ogre', saveMod: 6 }]);
  });

  // ── Action variants (#1519) ────────────────────────────────────────────────

  test("Crushing Stampede's action variants change the cost and the damage", async ({ page }) => {
    const mock = await gotoCasterTurn(page);
    await castSpell(page, 'Crushing Stampede');
    await page.getByRole('button', { name: 'Target Frost Troll' }).click();

    const actions = page.getByRole('radiogroup', { name: 'Number of actions' });
    // 1 action: a single creature for 5d6.
    await actions.getByRole('button', { name: '1', exact: true }).click();
    await expect(page.locator('.uam-variant-note')).toContainText('1 creature, 5d6 bludgeoning');
    await expect(page.locator('.dmg-expression')).toHaveText('5d6 bludgeoning');
    await expect(page.getByRole('button', { name: 'confirm-cast' })).toContainText('(1)');

    // 2 actions: the same spell becomes a 30-foot burst for 10d6.
    await actions.getByRole('button', { name: '2', exact: true }).click();
    await expect(page.locator('.uam-variant-note')).toContainText('30-foot burst, 10d6 bludgeoning');
    await expect(page.locator('.dmg-expression')).toHaveText('10d6 bludgeoning');
    await expect(page.getByRole('button', { name: 'confirm-cast' })).toContainText('(2)');

    await page.getByLabel('rolled damage total').fill('35');
    await page.getByRole('button', { name: 'confirm-cast' }).click();

    // The chosen variant is what actually spends the turn budget and what the
    // GM's save request carries.
    await mock.expectSent(`cnmh_turnstate_${CHAR_ID}`, (v: any) => v?.actionsSpent === 2);
    const enc = await mock.expectSent('cnmh_encounter_global', (v: any) => reqs(v).length > 0);
    expect(reqs(enc)[0].damage).toMatchObject({ expression: '10d6', entered: 35 });
    // The failure/crit-failure riders the same PR wired ride along with it.
    expect(reqs(enc)[0].conditions).toMatchObject({
      failure: [expect.objectContaining({ id: 'off-guard' })],
      criticalFailure: [expect.objectContaining({ id: 'prone' })],
    });
  });

  // ── Save-condition ladder (#1518) ──────────────────────────────────────────

  test('Steal the Show carries its four-degree condition ladder to the GM', async ({ page }) => {
    const mock = await gotoCasterTurn(page);
    await castSpell(page, 'Steal the Show');
    await page.getByRole('button', { name: 'Target Frost Troll' }).click();
    await page.getByRole('button', { name: 'Target Cave Ogre' }).click();
    await page.getByRole('button', { name: 'confirm-cast' }).click();

    const enc = await mock.expectSent('cnmh_encounter_global', (v: any) => reqs(v).length > 0);
    const req = reqs(enc)[0];
    expect(req).toMatchObject({ abilityName: 'Steal the Show', save: 'will', dc: SPELL_DC });
    // A damage-less ladder: the request's whole payload IS the conditions map,
    // and unlike the damageData rider ladder it reaches criticalSuccess.
    expect(req.conditions.criticalSuccess).toEqual([
      expect.objectContaining({ id: 'steal-the-show-spotlight' }),
    ]);
    expect(req.conditions.success).toEqual([expect.objectContaining({ id: 'off-guard' })]);
    expect(req.conditions.failure).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'stupefied', value: 2 })]),
    );
    expect(req.conditions.criticalFailure).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'stupefied', value: 4 })]),
    );
  });

  test('resolving the ladder applies the authored tier for each degree', async ({ page }) => {
    // The conditions map is the REAL authored ladder; only the request wrapper is
    // synthesized, so one resolution can exercise all four degrees at once.
    // Degrees are pinned by d20 + saveMod against a fixed DC 20 rather than
    // derived from a stat block:
    //   +25 / 10 → 35  ≥ DC+10  critical success
    //   +15 / 10 → 25  ≥ DC     success        (d20 10, so no nat-20 bump)
    //    +0 / 15 → 15  ≥ DC−10  failure
    //    +0 /  2 →  2  ≤ DC−10  critical failure
    const ladder = (snapshotSpells('steal-the-show')[0] as any).saveConditions;
    const targets = [
      { entryId: 'e2e-lad-crit-success', name: 'Ladder CritSuccess', saveMod: 25, d20: '10' },
      { entryId: 'e2e-lad-success', name: 'Ladder Success', saveMod: 15, d20: '10' },
      { entryId: 'e2e-lad-failure', name: 'Ladder Failure', saveMod: 0, d20: '15' },
      { entryId: 'e2e-lad-crit-failure', name: 'Ladder CritFailure', saveMod: 0, d20: '2' },
    ];
    const mock = await gotoDock(page, {
      saveRequests: [
        {
          id: 'savereq-e2e-ladder',
          ts: Date.now(),
          status: 'pending',
          casterId: CHAR_ID,
          casterName: CHAR_NAME,
          abilityName: 'Steal the Show',
          save: 'will',
          dc: 20,
          basic: false,
          rank: 4,
          targets: targets.map(({ entryId, name, saveMod }) => ({ entryId, name, saveMod })),
          conditions: ladder,
        },
      ],
    });

    const console_ = gmConsole(page);
    await expect(console_.getByRole('heading', { name: 'Requested Saves' })).toBeVisible();
    for (const t of targets) await console_.getByLabel(`${t.name} d20`).fill(t.d20);
    await console_.getByRole('button', { name: 'Log Results' }).click();

    const fx = await mock.expectSent(
      'cnmh_enemyfx_global',
      (v: any) => (v?.['e2e-lad-crit-failure']?.conditions || []).length >= 2,
    );
    const idsOn = (entryId: string) =>
      (fx[entryId]?.conditions || []).map((c: any) => `${c.id}${c.value != null ? ` ${c.value}` : ''}`).sort();

    // Each degree gets its own authored tier — including the crit-success
    // spotlight, which a damage rider ladder could never express.
    expect(idsOn('e2e-lad-crit-success')).toEqual(['steal-the-show-spotlight']);
    expect(idsOn('e2e-lad-success')).toEqual(['off-guard']);
    expect(idsOn('e2e-lad-failure')).toEqual(['off-guard', 'stupefied 2']);
    expect(idsOn('e2e-lad-crit-failure')).toEqual(['off-guard', 'stupefied 4']);
  });

  // ── Regressions: the two bugs this spec originally documented ──────────────
  // Both shipped as `test.skip` with the diagnosis in the comment; #1617 / #1618
  // fixed them and these are the boxes that keep them fixed.

  test("Targeting Beacon's explosion fires like any other save payload (#1617)", async ({ page }) => {
    // Before #1617 this was impossible. The beacon has no cast-time `defense` of
    // its own — everything it does happens later — so `resolveActionRoll` returns
    // mode 'none' with dc null, and the arming block copied that null onto the
    // payload. `ArmedPayloads.fire` then called buildTargetSaveRequest with
    // `rollProfile.dc === null`, which bails on its `dc != null` guard, and fire
    // early-returned BEFORE removeArmedPayload — so pressing Fire did nothing at
    // all, forever, on a card reading "Reflex DC null". Targeting Beacon's
    // explosion was the one authored payload whose whole point is a save, and it
    // was the one that could not produce one.
    //
    // The DC is now derived at arm time (asserted live in the arm test above), so
    // the seeded payload carries the real spell DC and this fires end to end.
    const payload = armedFrom('targeting-beacon', { dc: SPELL_DC, rank: 4 });
    const mock = await gotoDock(page, { armedPayloads: [payload] });

    const card = gmConsole(page).locator('.gm-save-req-card').filter({ hasText: 'Beacon explosion' });
    await expect(card).toContainText(`Reflex DC ${SPELL_DC}`);
    await card.getByLabel('Frost Troll').check();
    await card.getByLabel('Beacon explosion damage').fill('21');
    await card.getByRole('button', { name: 'Fire' }).click();

    const enc = await mock.expectSent('cnmh_encounter_global', (v: any) =>
      reqs(v).some((r: any) => r.abilityName?.includes('Beacon explosion')),
    );
    const req = reqs(enc).find((r: any) => r.abilityName?.includes('Beacon explosion'));
    expect(req).toMatchObject({ save: 'reflex', basic: true, dc: SPELL_DC, rank: 4 });
    expect(req.targets).toEqual([{ entryId: TROLL.entryId, name: 'Frost Troll', saveMod: 9 }]);
    expect(req.damage).toMatchObject({ entered: 21, typeLabel: 'fire' });
    // One-shot: firing consumes it.
    const cleared = await mock.expectSent(
      'cnmh_encounter_global',
      (v: any) => (v?.armedPayloads || []).length === 0,
    );
    expect(reqs(cleared)).toHaveLength(1);
  });

  test('a payload that cannot resolve says so instead of swallowing the press (#1617)', async ({ page }) => {
    // Payloads parked in a live encounter BEFORE the arm-time derivation still
    // carry `dc: null`, and buildTargetSaveRequest refuses those. The press used
    // to vanish silently and the card stayed forever. It must now explain itself
    // and — the trigger really happened — spend a one-shot payload anyway.
    const payload = armedFrom('targeting-beacon', { dc: null, rank: 4 });
    const mock = await gotoDock(page, { armedPayloads: [payload] });

    const card = gmConsole(page).locator('.gm-save-req-card').filter({ hasText: 'Beacon explosion' });
    // Never "Reflex DC null".
    await expect(card).not.toContainText('DC null');
    await expect(card).toContainText('Reflex DC not recorded');

    await card.getByLabel('Frost Troll').check();
    await card.getByRole('button', { name: 'Fire' }).click();

    await mock.expectSent(
      'cnmh_encounter_global',
      logHas('Targeting Beacon: Beacon explosion could not be fired', 'resolve it by hand'),
    );
    const enc = await mock.expectSent(
      'cnmh_encounter_global',
      (v: any) => (v?.armedPayloads || []).length === 0,
    );
    // Explained and cleared — but nothing was fabricated.
    expect(reqs(enc)).toHaveLength(0);
  });

  test('a live cast carries severityFromSave through to the picker (#1618)', async ({ page }) => {
    // Gruesome Marionettist authors `severityFromSave: true` (asserted in
    // src/data/armedPayloads.bundled.test.js) and ArmedPayloads gates its
    // half/full/double picker on `persistent && p.severityFromSave`. The arming
    // block used to copy a fixed field list that omitted it, so from a real cast
    // the flag was always undefined, the picker never rendered, and the bleed
    // always landed at FULL no matter what the cast's Fortitude save was.
    const mock = await gotoCasterTurn(page);
    await castSpell(page, 'Gruesome Marionettist');
    await page.getByRole('button', { name: 'Target Frost Troll' }).click();
    await page.getByRole('button', { name: 'confirm-cast' }).click();

    // The arm side: the authored flag survives the cast.
    const enc = await mock.expectSent(
      'cnmh_encounter_global',
      (v: any) => (v?.armedPayloads || []).length > 0,
    );
    expect(enc.armedPayloads[0]).toMatchObject({
      payloadId: 'gruesome-marionettist-bleed',
      severityFromSave: true,
      repeatable: true,
      dc: SPELL_DC,
      rank: 5,
      abilityName: 'Gruesome Marionettist',
    });
    // The cast's OWN Fortitude save is what sets the severity picked below.
    expect(reqs(enc).find((r: any) => r.abilityName === 'Gruesome Marionettist'))
      .toMatchObject({ save: 'fortitude', dc: SPELL_DC });

    // The fire side: that flag is what makes the panel offer the picker at all,
    // and picking "success — half" is what finally reaches the persistent map.
    // Re-seeded rather than carried over (see armedFrom).
    const dock = await gotoDock(page, {
      armedPayloads: [armedFrom('gruesome-marionettist', { dc: SPELL_DC, rank: 5 })],
    });
    const card = gmConsole(page)
      .locator('.gm-save-req-card')
      .filter({ hasText: 'Prohibited-action bleed' });
    const picker = card.getByLabel('Prohibited-action bleed severity');
    await expect(picker).toBeVisible();
    // No save on firing — the cast already rolled it.
    await expect(card.getByLabel('Prohibited-action bleed damage')).toHaveCount(0);

    await picker.selectOption('half');
    await card.getByLabel('Frost Troll').check();
    await card.getByRole('button', { name: 'Fire' }).click();

    const persistent = await dock.expectSent(
      'cnmh_persistent_global',
      (v: any) => (v?.[TROLL.entryId] || []).length > 0,
    );
    expect(persistent[TROLL.entryId][0]).toMatchObject({ dice: '5d10', type: 'bleed', half: true });
    await dock.expectSent(
      'cnmh_encounter_global',
      logHas('Gruesome Marionettist: Prohibited-action bleed (half) applied to Frost Troll'),
    );
  });
});
