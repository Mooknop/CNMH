/**
 * Harrow Cast suit grid (#1674, part of epic #1589) — the per-suit mechanics of
 * Harrow Casting and omen-match doubling. harrow-omens.spec.ts (#1667) covered
 * the omen LIFECYCLE and deliberately drew Books every time; this file covers
 * the other five suits, asserting the APPLIED CONSEQUENCE (synced writes) over
 * the rendered hint, because a hint-only test would pass against a
 * disconnected applier:
 *
 *   - Keys    → `harrow-key-ward` (+1 AC/saves) lands on the CASTER's effects
 *               with the caster-turn-start expiry; on match `harrow-key-ward-2`
 *               (+2). The bonus is observable on the Stats dial's AC readout.
 *   - Shields → player-rolled `2d6+rank` heal on the CASTER (match: `4d6+rank*2`),
 *               written to cnmh_hp_ and logged with the suit name.
 *   - Stars   → the heal goes to the PICKED ALLY, never the caster; on match the
 *               ally also gains `harrow-star-saves`.
 *   - Hammers → note-only today (chained-spell damage step is #281): the logged
 *               rider carries `+rank` force, doubled on a match. No state write.
 *   - Crowns  → log-only guidance; explicitly NO effect and NO heal.
 *
 * Match detection itself is pinned by the Keys non-match/match pair: same suit
 * drawn both times, only the active omen differs, so the +1 → +2 doubling is
 * attributable to `drawnSuit === omenSuit` and nothing else.
 *
 * The contract under test is `harrowCastEffect` (src/utils/harrow.js) applied by
 * `applyChainSpellResults` (src/utils/chainResultsAppliers.js). All casts here
 * chain a rank-1 spell from a rank-1 slot, so spellRank = 1 everywhere:
 * dice are 2d6+1 / 4d6+2, Hammers is +1 / +2 force.
 *
 * `HARROW_CAST_DC = 11` and the flat-check d20 is bonus-less (#1692), so a
 * tapped face of 11+ is an unambiguous pass — every test passes the check
 * (the failure path is harrow-omens.spec.ts's pendingLoss box).
 *
 * Runs on chromium + mobile-chromium (player surface).
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { activeEncounter, deckBody, readyTurnState } from '../../helpers/encounter';
import { casterCharacter, gotoSheet, harrowerFeats } from '../../helpers/spellcasting';
import { expectMyTurnLive, openPlayTab } from '../../helpers/sheet';

const CHAR_ID = 'e2e-harrower';
const CHAR_NAME = 'E2E Harrower';
const ALLY_ID = 'e2e-harrow-ally';
const ALLY_NAME = 'E2E Harrow Ally';

const OMEN_KEY = `cnmh_omen_${CHAR_ID}`;
const EFFECTS_KEY = `cnmh_effects_${CHAR_ID}`;
const ALLY_EFFECTS_KEY = `cnmh_effects_${ALLY_ID}`;
const HP_KEY = `cnmh_hp_${CHAR_ID}`;
const ALLY_HP_KEY = `cnmh_hp_${ALLY_ID}`;

// Matches activeEncounter()'s entryId scheme — the ward's caster-turn-start
// expiry is anchored to this entry.
const CASTER_ENTRY_ID = `e2e-${CHAR_ID}`;

// A plain rank-1 spell for Harrow Casting to chain into: no attack roll, no
// save, one action — the suit mechanics are under test, not the spell.
const CHAIN_SPELL = {
  id: 'e2e-suit-bolt',
  name: 'E2E Suit Bolt',
  level: 1,
  actions: '1',
  range: '60 feet',
  description: 'A test rank-1 spell for the Harrow Cast suit grid.',
};

// The caster needs a scalar `ac` (no armor proficiency → StatsBlock renders it
// as the base the ward's status bonus visibly layers onto) and a dented HP pool
// so Shields' heal is observable in both the write and the vitals label.
const harrower = () =>
  casterCharacter({
    id: CHAR_ID,
    name: CHAR_NAME,
    level: 8,
    slots: { '1': 3 },
    repertoire: [CHAIN_SPELL.id],
    extra: { feats: harrowerFeats(), ac: 20, maxHp: 30 },
  });

// Stars' willing target — a second PC in the content set AND the encounter
// order, so the TargetPicker offers them and the applier can resolve the heal.
const ally = () => ({ id: ALLY_ID, name: ALLY_NAME, level: 8, maxHp: 25, ac: 18 });

const hp = (current: number, max: number) =>
  ({ current, max, temp: 0, dying: 0, wounded: 0, doomed: 0 });

const casterOrderEntry = {
  entryId: CASTER_ENTRY_ID, kind: 'pc', charId: CHAR_ID, name: CHAR_NAME, initiative: 20,
};
const allyOrderEntry = {
  entryId: `e2e-${ALLY_ID}`, kind: 'pc', charId: ALLY_ID, name: ALLY_NAME, initiative: 15,
};

/** Seed an active encounter on the harrower's turn with a required active omen. */
async function startTurn(page: Page, omenSuit: string): Promise<MockSession> {
  const mock = await mockSession(page, {
    seed: {
      cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, {
        order: [casterOrderEntry, allyOrderEntry],
      }),
      // '1:0' matches activeEncounter's position, so the turn-begin sweep
      // doesn't rewrite turnstate mid-test.
      [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
      [OMEN_KEY]: { suit: omenSuit, ts: 1 },
      [HP_KEY]: hp(10, 30),
      [ALLY_HP_KEY]: hp(5, 25),
    },
  });
  await gotoSheet(page, CHAR_ID, CHAR_NAME);
  await openPlayTab(page, 'Encounter');
  await expectMyTurnLive(page);
  return mock;
}

/** Deck → confirm sheet → UseAbilityModal on Harrow Casting; returns the dialog. */
async function openHarrowCasting(page: Page) {
  await page.getByRole('tab', { name: 'Actions', exact: true }).click();
  await deckBody(page).getByRole('button', { name: 'Harrow Casting', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Harrow Casting', exact: true }).click();
  const modal = page.getByRole('dialog', { name: /: Harrow Casting$/ });
  await expect(modal).toBeVisible();
  return modal;
}

/** The Harrow Cast group: draw a suit, then pass the DC 11 flat check on `face`. */
async function drawAndPass(page: Page, suit: string, face = 15) {
  const group = page.getByRole('group', { name: 'Harrow Cast' });
  await group.getByLabel(`drawn-${suit}`).check();
  // RollEntry's tap pad face IS the raw d20 (bonus-less, #1692) — 11+ passes
  // DC 11 with no modifier in the loop.
  await group.getByRole('group', { name: 'raw d20' })
    .getByRole('button', { name: String(face), exact: true }).click();
  await expect(group).toContainText('passed');
  return group;
}

/** Find a log line on the synced encounter record matching every needle. */
const logHas = (...needles: string[]) => (v: any) =>
  Array.isArray(v?.log) && v.log.some((e: any) => needles.every((n) => String(e.text).includes(n)));

test.describe('Harrow Cast suit grid', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ spell: [CHAIN_SPELL], character: [harrower(), ally()] });
  });

  // ── Keys — the self-effect kind, and the match-detection pin ───────────────

  test('Keys applies harrow-key-ward (+1) to the caster until the start of their next turn', async ({ page }) => {
    const mock = await startTurn(page, 'Books'); // active omen ≠ Keys → no match
    const modal = await openHarrowCasting(page);
    await drawAndPass(page, 'Keys');
    await expect(modal).toContainText('+1 status bonus to AC and all saves');
    await modal.getByRole('button', { name: 'confirm-cast' }).click();

    // The applied consequence: a real effects entry on the CASTER, catalog id
    // harrow-key-ward, expiring at the start of the caster's next turn
    // (resolveExpireAt('caster-turn-start') → round+1 / turn-start / caster entry).
    const entries = await mock.expectSent(EFFECTS_KEY, (v) => Array.isArray(v) && v.length === 1);
    expect(entries[0]).toMatchObject({
      effectId: 'harrow-key-ward',
      appliedBy: CHAR_ID,
      source: 'Harrow Casting — Keys',
      expireAt: { boundary: 'turn-start', round: 2, entryId: CASTER_ENTRY_ID },
    });
    const enc = await mock.expectSent(
      'cnmh_encounter_global',
      logHas('E2E Harrower draws Keys', 'flat check DC 11: 15 (passed)'),
    );
    // Match detection, negative half: same suit as the match test below, but
    // the active omen differs — no "omen match" and the +1 ward.
    const drawLine = enc.log.find((e: any) => String(e.text).includes('draws Keys'));
    expect(String(drawLine.text)).not.toContain('omen match');

    // The bonus is observable: the Stats dial's AC readout layers the status
    // bonus onto the scalar base (20 → 21, delta +1).
    await openPlayTab(page, 'Stats');
    const dial = page.getByRole('button', { name: 'Character feats and conditions' });
    await expect(dial).toContainText('21');
    await expect(dial).toContainText('+1');
  });

  test('Keys on an omen match upgrades to harrow-key-ward-2 (+2)', async ({ page }) => {
    const mock = await startTurn(page, 'Keys'); // active omen == drawn suit → match
    const modal = await openHarrowCasting(page);
    await expect(modal.getByRole('group', { name: 'Harrow Cast' })).toContainText('Active omen: Keys');
    await drawAndPass(page, 'Keys');
    await expect(modal).toContainText('+2 status bonus to AC and all saves');
    await modal.getByRole('button', { name: 'confirm-cast' }).click();

    const entries = await mock.expectSent(EFFECTS_KEY, (v) => Array.isArray(v) && v.length === 1);
    expect(entries[0]).toMatchObject({
      effectId: 'harrow-key-ward-2',
      appliedBy: CHAR_ID,
      expireAt: { boundary: 'turn-start', round: 2, entryId: CASTER_ENTRY_ID },
    });
    // Match detection, positive half: drawing the suit that equals the active
    // omen is what flips the ward from +1 to +2 — and the log says so.
    await mock.expectSent('cnmh_encounter_global', logHas('E2E Harrower draws Keys — omen match!'));

    await openPlayTab(page, 'Stats');
    const dial = page.getByRole('button', { name: 'Character feats and conditions' });
    await expect(dial).toContainText('22');
    await expect(dial).toContainText('+2');
  });

  // ── Shields — the self-heal kind ───────────────────────────────────────────

  test('Shields heals the caster with the player-rolled 2d6+rank', async ({ page }) => {
    const mock = await startTurn(page, 'Books');
    const modal = await openHarrowCasting(page);
    const group = await drawAndPass(page, 'Shields');
    // spellRank 1 → the offered dice expression is 2d6+1.
    await expect(group).toContainText('2d6+1');
    await group.getByLabel('rolled damage total').fill('9');
    await modal.getByRole('button', { name: 'confirm-cast' }).click();

    // The applied consequence: the CASTER's hp record gains the entered roll
    // (10 → 19), and the log line names the suit.
    await mock.expectSent(HP_KEY, (v) => v?.current === 19 && v?.max === 30);
    await mock.expectSent(
      'cnmh_encounter_global',
      logHas('E2E Harrower healed 9 HP (Harrow Casting — Shields)'),
    );
    // …observable on the self-status bar's vitals label too.
    await expect(page.getByLabel(`${CHAR_NAME} vitals`)).toContainText('19/30 HP');
  });

  test('Shields on an omen match doubles the dice to 4d6+rank*2', async ({ page }) => {
    const mock = await startTurn(page, 'Shields');
    const modal = await openHarrowCasting(page);
    const group = await drawAndPass(page, 'Shields');
    // The doubled expression IS the contract here: 4d6+2 at spellRank 1.
    await expect(group).toContainText('4d6+2');
    await expect(modal).toContainText('Heal yourself 4d6+2');
    await group.getByLabel('rolled damage total').fill('14');
    await modal.getByRole('button', { name: 'confirm-cast' }).click();

    await mock.expectSent(HP_KEY, (v) => v?.current === 24 && v?.max === 30);
    await mock.expectSent(
      'cnmh_encounter_global',
      logHas('E2E Harrower healed 14 HP (Harrow Casting — Shields)'),
    );
  });

  // ── Stars — the target-heal kind ───────────────────────────────────────────

  test('Stars heals the picked ally, not the caster', async ({ page }) => {
    const mock = await startTurn(page, 'Books');
    const modal = await openHarrowCasting(page);
    // Pick the ALLY as the willing target.
    await modal.getByRole('group', { name: 'Select targets' })
      .getByRole('button', { name: `Target ${ALLY_NAME}` }).click();
    const group = await drawAndPass(page, 'Stars');
    await expect(group).toContainText('2d6+1');
    await group.getByLabel('rolled damage total').fill('7');
    await modal.getByRole('button', { name: 'confirm-cast' }).click();

    // The applied consequence: the ALLY's hp record gains the roll (5 → 12)…
    await mock.expectSent(ALLY_HP_KEY, (v) => v?.current === 12 && v?.max === 25);
    await mock.expectSent(
      'cnmh_encounter_global',
      logHas('E2E Harrow Ally healed 7 HP (Harrow Casting — Stars)'),
    );
    // …and the caster's does NOT (anchored on the ally write above having
    // landed, which is downstream of the whole confirm sequence). Without a
    // match there is no save-bonus effect either — for anyone.
    expect(mock.sent.filter((m) => m.stateType === 'hp' && m.characterId === CHAR_ID)).toHaveLength(0);
    expect(mock.sent.filter((m) => m.stateType === 'effects')).toHaveLength(0);
  });

  test('Stars on an omen match also grants the ally harrow-star-saves', async ({ page }) => {
    const mock = await startTurn(page, 'Stars');
    const modal = await openHarrowCasting(page);
    await modal.getByRole('group', { name: 'Select targets' })
      .getByRole('button', { name: `Target ${ALLY_NAME}` }).click();
    const group = await drawAndPass(page, 'Stars');
    await group.getByLabel('rolled damage total').fill('7');
    await modal.getByRole('button', { name: 'confirm-cast' }).click();

    await mock.expectSent(ALLY_HP_KEY, (v) => v?.current === 12);
    // The match rider lands on the ALLY's effect store (applyTo: 'ally'), with
    // the same caster-turn-start expiry as the Keys ward.
    const entries = await mock.expectSent(ALLY_EFFECTS_KEY, (v) => Array.isArray(v) && v.length === 1);
    expect(entries[0]).toMatchObject({
      effectId: 'harrow-star-saves',
      appliedBy: CHAR_ID,
      expireAt: { boundary: 'turn-start', round: 2, entryId: CASTER_ENTRY_ID },
    });
    await mock.expectSent('cnmh_encounter_global', logHas('E2E Harrower draws Stars — omen match!'));
    await mock.expectSent(
      'cnmh_encounter_global',
      logHas('E2E Harrower grants Harrow Casting — Stars on E2E Harrow Ally'),
    );
    // The caster gains nothing — heal and effect both target the ally.
    expect(mock.sent.filter((m) => m.stateType === 'hp' && m.characterId === CHAR_ID)).toHaveLength(0);
    expect(mock.sent.filter((m) => m.stateType === 'effects' && m.characterId === CHAR_ID)).toHaveLength(0);
  });

  // ── Hammers — note-only until chained-spell damage (#281) ──────────────────

  test('Hammers logs the +rank force rider note (note-only until #281)', async ({ page }) => {
    const mock = await startTurn(page, 'Books');
    const modal = await openHarrowCasting(page);
    await drawAndPass(page, 'Hammers');
    await expect(modal).toContainText('+1 force damage on a hit or failed save');
    await modal.getByRole('button', { name: 'confirm-cast' }).click();

    // What exists today: the applier logs the manual rider (kind 'damage-note'
    // has no state write — the chained-spell damage step is #281).
    await mock.expectSent(
      'cnmh_encounter_global',
      logHas('E2E Harrower — Hammers: +1 force damage on a hit or failed save (single-target offensive spells only)'),
    );
    expect(mock.sent.filter((m) => m.stateType === 'effects')).toHaveLength(0);
    expect(mock.sent.filter((m) => m.stateType === 'hp')).toHaveLength(0);
  });

  test('Hammers on an omen match doubles the rider to +rank*2 force', async ({ page }) => {
    const mock = await startTurn(page, 'Hammers');
    const modal = await openHarrowCasting(page);
    await drawAndPass(page, 'Hammers');
    await expect(modal).toContainText('+2 force damage');
    await expect(modal).toContainText('doubled — omen match');
    await modal.getByRole('button', { name: 'confirm-cast' }).click();

    await mock.expectSent('cnmh_encounter_global', logHas('E2E Harrower draws Hammers — omen match!'));
    await mock.expectSent(
      'cnmh_encounter_global',
      logHas('E2E Harrower — Hammers: +2 force damage', 'doubled — omen match'),
    );
  });

  // ── Crowns — log-only ──────────────────────────────────────────────────────

  test('Crowns is log-only guidance: no effect, no heal', async ({ page }) => {
    const mock = await startTurn(page, 'Books');
    const modal = await openHarrowCasting(page);
    // Face 11 pins the DC 11 boundary itself: the bonus-less d20 at exactly 11
    // passes.
    await drawAndPass(page, 'Crowns', 11);
    await expect(modal).toContainText('Subtle cast');
    await modal.getByRole('button', { name: 'confirm-cast' }).click();

    await mock.expectSent(
      'cnmh_encounter_global',
      logHas('E2E Harrower draws Crowns', 'flat check DC 11: 11 (passed)'),
    );
    await mock.expectSent(
      'cnmh_encounter_global',
      logHas('E2E Harrower — Crowns: Subtle cast: Fortune-Telling Lore'),
    );
    // Anchored absence: both log writes above are downstream of the whole
    // applier sequence, and nothing wrote an effect or an HP change.
    expect(mock.sent.filter((m) => m.stateType === 'effects')).toHaveLength(0);
    expect(mock.sent.filter((m) => m.stateType === 'hp')).toHaveLength(0);
    expect(mock.sent.filter((m) => m.stateType === 'omen')).toHaveLength(0);
  });
});
