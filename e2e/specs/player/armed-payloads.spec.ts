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
 * Coverage limits found while writing this, both real and worth knowing:
 *   • Targeting Beacon's explosion arms with `dc: null` and therefore cannot be
 *     fired — see the skipped test at the bottom.
 *   • The severity picker (Gruesome Marionettist) never reaches the panel from a
 *     live cast — see the same block.
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
// Pinned as a constant so the payload's DC (which is snapshotted from the CAST,
// not re-derived when it fires) is asserted as an exact number.
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
 * authored payload doc plus the cast-time context (DC, chosen rank, caster).
 * Fields are copied one-for-one from that block, including the fact that
 * `severityFromSave` is NOT among them (see the skipped test at the bottom).
 *
 * Seeded rather than cast because mockSession replays its ORIGINAL seed on every
 * connect: a payload armed on the sheet is gone by the time the page navigates
 * to /gm/dock. The "arm" tests above are what prove this mapping is faithful.
 */
const armedFrom = (spellId: string, { dc, rank }: { dc: number | null; rank: number }) => {
  const spell = snapshotSpells(spellId)[0] as any;
  const p = spell.armedPayloads[0];
  return {
    id: `armed-e2e-${p.id}`,
    ts: Date.now(),
    payloadId: p.id,
    label: p.label,
    trigger: p.trigger,
    note: p.note ?? null,
    defense: p.defense,
    damageData: p.damageData,
    repeatable: !!p.repeatable,
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

    // …but it arms with NO DC, because Targeting Beacon has no cast-time
    // `defense` of its own: resolveActionRoll falls through to mode 'none', so
    // `saveDc` is null and the payload snapshots that null. See the skipped
    // test at the bottom — this is why the beacon can never actually be fired.
    expect(enc.armedPayloads[0].dc).toBeNull();

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

  // ── Known product gaps ─────────────────────────────────────────────────────
  // Both of these are written the way they should read once fixed; neither is a
  // limitation of the harness.

  test.skip("PRODUCT BUG: Targeting Beacon's explosion can never be fired (dc: null)", async ({ page }) => {
    // The beacon has no cast-time `defense` of its own — everything it does
    // happens later — so `resolveActionRoll` returns mode 'none' with dc null
    // and `saveDc` is null at confirm. UseAbilityModal snapshots that onto the
    // payload (asserted live in the arm test above), and ArmedPayloads.fire then
    // calls buildTargetSaveRequest with `rollProfile.dc === null`, which bails
    // on its `rollProfile.dc != null` guard and returns null. `fire` early-returns
    // on `if (!req) return`, BEFORE removeArmedPayload — so pressing Fire does
    // nothing at all, forever, and the panel shows "Reflex DC null".
    //
    // The fix belongs in src (the arming block should fall back to the caster's
    // spell DC when the spell itself calls for no save), so this stays skipped:
    // Targeting Beacon's explosion is the ONE authored payload whose whole point
    // is a save, and it is the one that cannot produce one.
    const payload = armedFrom('targeting-beacon', { dc: null, rank: 4 });
    const mock = await gotoDock(page, { armedPayloads: [payload] });

    const card = gmConsole(page).locator('.gm-save-req-card').filter({ hasText: 'Beacon explosion' });
    await card.getByLabel('Frost Troll').check();
    await card.getByLabel('Beacon explosion damage').fill('21');
    await card.getByRole('button', { name: 'Fire' }).click();

    const enc = await mock.expectSent('cnmh_encounter_global', (v: any) =>
      reqs(v).some((r: any) => r.abilityName?.includes('Beacon explosion')),
    );
    const req = reqs(enc).find((r: any) => r.abilityName?.includes('Beacon explosion'));
    expect(req).toMatchObject({ save: 'reflex', basic: true, dc: SPELL_DC });
    // One-shot: firing consumes it.
    expect(enc.armedPayloads).toHaveLength(0);
  });

  test.skip('PRODUCT BUG: a live cast never reaches the severity picker', async ({ page }) => {
    // Gruesome Marionettist authors `severityFromSave: true` (asserted in
    // src/data/armedPayloads.bundled.test.js) and ArmedPayloads gates its
    // half/full/double picker on `persistent && p.severityFromSave`. But
    // UseAbilityModal's arming block copies a fixed field list onto the payload
    // and `severityFromSave` is not in it — so from a real cast the flag is
    // always undefined, the picker never renders, and the bleed always lands in
    // full no matter what the cast's Fortitude save actually was.
    //
    // `armedFrom` below deliberately mirrors that same field list, so this test
    // fails exactly the way the product does. Adding one line to the arming
    // block fixes it.
    const payload = armedFrom('gruesome-marionettist', { dc: SPELL_DC, rank: 5 });
    await gotoDock(page, { armedPayloads: [payload] });

    const card = gmConsole(page)
      .locator('.gm-save-req-card')
      .filter({ hasText: 'Prohibited-action bleed' });
    await expect(card.getByLabel('Prohibited-action bleed severity')).toBeVisible();
  });
});
