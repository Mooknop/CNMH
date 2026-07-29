/**
 * Harrow omens (#1667, part of epic #1589) — the active omen (#227) reaches
 * across the whole encounter surface (`useOmen` is the sole writer of
 * `cnmh_omen_<charId>`; eight non-test consumers read it) and had no E2E at all.
 *
 * The four surfaces this file drives, end to end through the real UI:
 *   - Harrowing panel (`components/spells/Harrowing.jsx`) — the physical deck
 *     stays at the table, so DRAWING is "pick the suit you drew". Sole write path.
 *   - `OmenChip` in the initiative strip — the table-visible badge.
 *   - `useOmenGate` (`hooks/useOmenGate.jsx`) — the gate on `ability.requiresOmen`
 *     (block + GM override), and the spend on `ability.clearsOmen`.
 *   - `useEndTurn` (`components/encounter/commandsheet/useEndTurn.js`) — the turn
 *     boundary, which is a CONDITIONAL clear, not an expiry (see below).
 *
 * Two behaviours the issue text got wrong, asserted here as the code actually
 * behaves:
 *   1. "A failed Harrow Cast flat check CLEARS the omen" — it does not. The
 *      failure sets `pendingLoss: true` and KEEPS the suit
 *      (`useOmen.flagPendingLoss`, via `utils/chainResultsAppliers.js`); the omen
 *      survives until `useEndTurn` sees the flag on turn submit. The player-facing
 *      copy says so too: "failed — omen lost at end of turn".
 *   2. "End of turn — does it persist or lapse?" — it PERSISTS. `useEndTurn`
 *      clears the omen only when `pendingLoss && suit`; an unflagged omen rides
 *      through the turn boundary untouched. An omen is not a per-turn resource.
 *
 * The harrower's feats are lifted verbatim out of the bundled seed
 * (`harrowerFeats()` below) rather than hand-stubbed, so the authored
 * `requiresOmen` / `clearsOmen` / `chain.harrow` blocks that drive every gate are
 * exactly what production ships. That reader is a factor-out candidate for
 * `helpers/spellcasting.ts` (a `snapshotCharacterFeats` sibling to
 * `snapshotSpells`/`snapshotItems`) — kept local here because sibling agents are
 * editing the helpers in parallel.
 *
 * Runs on chromium + mobile-chromium (player surface).
 */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import {
  activeEncounter,
  deckBody,
  expectOffTurnLive,
  readyTurnState,
} from '../../helpers/encounter';
import { casterCharacter, gotoSheet, openMagic, openMagicCategory } from '../../helpers/spellcasting';
import { expectMyTurnLive, openPlayTab } from '../../helpers/sheet';

const CHAR_ID = 'e2e-harrower';
const CHAR_NAME = 'E2E Harrower';
const OMEN_KEY = `cnmh_omen_${CHAR_ID}`;

// A plain rank-1 spell for Harrow Casting to chain into: no attack roll, no
// save, one action — the spec is about the omen, not the spell's resolution.
const CHAIN_SPELL = {
  id: 'e2e-omen-bolt',
  name: 'E2E Omen Bolt',
  level: 1,
  actions: '1',
  range: '60 feet',
  description: 'A test rank-1 spell for the Harrow Casting chain.',
};

// ── Authored harrower content ────────────────────────────────────────────────

const SNAPSHOT_CHARACTERS = path.resolve(__dirname, '../../../src/data/snapshot/character.json');

/**
 * Jade Inferno's two omen-bearing feats out of the bundled seed:
 *   - "Harrower Dedication" — carries the Avoid Dire Fate reaction
 *     (requiresOmen + clearsOmen). Its NAME is also what `useCharacter` keys
 *     `hasHarrowing` off, which is what surfaces the Harrowing panel at all.
 *   - "Harrow Casting" — the metamagic action (requiresOmen + chain.harrow).
 * The length assertion makes content drift loud here instead of surfacing as a
 * mystery "tile never rendered" three tests later.
 */
function harrowerFeats(): Array<Record<string, unknown>> {
  const all = JSON.parse(fs.readFileSync(SNAPSHOT_CHARACTERS, 'utf8')) as Array<
    Record<string, unknown> & { id: string; feats?: Array<Record<string, unknown>> }
  >;
  const jade = all.find((c) => c.id === 'JadeInferno');
  if (!jade) throw new Error('harrowerFeats: JadeInferno not found in src/data/snapshot/character.json');
  const feats = (jade.feats || []).filter((f) => JSON.stringify(f).includes('requiresOmen'));
  const names = feats.map((f) => f.name);
  if (feats.length !== 2 || !names.includes('Harrower Dedication') || !names.includes('Harrow Casting')) {
    throw new Error(`harrowerFeats: expected the two authored harrower feats, got ${JSON.stringify(names)}`);
  }
  return feats;
}

const harrower = () =>
  casterCharacter({
    id: CHAR_ID,
    name: CHAR_NAME,
    level: 8,
    slots: { '1': 3 },
    repertoire: [CHAIN_SPELL.id],
    extra: { feats: harrowerFeats() },
  });

// ── Encounter shape ──────────────────────────────────────────────────────────

// PC entry matching activeEncounter()'s default position ('1:0'), plus a foe so
// End turn actually advances OFF this PC (a solo order wraps straight back).
const pcOrderEntry = { entryId: `e2e-${CHAR_ID}`, kind: 'pc', charId: CHAR_ID, name: CHAR_NAME, initiative: 20 };
const foeEntry = { entryId: 'e2e-enemy-omen-foe', kind: 'enemy' as const, name: 'Omen Foe', initiative: 10 };

// ── Reading the omen surface ─────────────────────────────────────────────────

/** The table-visible badge: OmenChip inside the initiative strip (InitiativeStrip.jsx). */
const omenChip = (page: Page) => page.locator('.cmd-init .ttp-omen-chip');

/** The Harrowing panel's live status line + suit picker (Harrowing.jsx). */
const omenPanel = (page: Page) => page.getByRole('group', { name: 'Active Harrow Omen' });
const suitPicker = (page: Page) => page.getByRole('radiogroup', { name: 'Drawn suit' });

/** Sheet → Encounter tab, gated on "End turn" (the deck has hydrated AND it's our turn). */
async function gotoDeck(page: Page) {
  await gotoSheet(page, CHAR_ID, CHAR_NAME);
  await openPlayTab(page, 'Encounter');
  await expectMyTurnLive(page);
}

/** Seed an active encounter (optionally with a starting omen) and land on the deck. */
async function startTurn(page: Page, omen?: { suit: string | null; ts: number }): Promise<MockSession> {
  const mock = await mockSession(page, {
    seed: {
      cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, { order: [pcOrderEntry, foeEntry] }),
      // '1:0' matches activeEncounter's position — a bare token makes the
      // turn-begin sweep rewrite turnstate mid-test, which the end-of-turn
      // boxes below are directly sensitive to.
      [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
      ...(omen ? { [OMEN_KEY]: omen } : {}),
    },
  });
  await gotoDeck(page);
  return mock;
}

/** Deck tile → confirm sheet → UseAbilityModal, open on `${verb}: ${name}`. */
async function openAbility(page: Page, segment: string, name: string) {
  await page.getByRole('tab', { name: segment, exact: true }).click();
  await deckBody(page).getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: `Confirm ${name}`, exact: true }).click();
  await expect(page.getByRole('dialog', { name: new RegExp(`: ${name}$`) })).toBeVisible();
}

/** Find a log line on the synced encounter record matching every needle. */
const logHas = (...needles: string[]) => (v: any) =>
  Array.isArray(v?.log) && v.log.some((e: any) => needles.every((n) => String(e.text).includes(n)));

test.describe('Harrow omens', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ spell: [CHAIN_SPELL], character: [harrower()] });
  });

  test('drawing a suit in the Harrowing panel writes the omen and badges the strip', async ({ page }) => {
    const mock = await startTurn(page);

    // Nothing drawn yet: no badge, and the panel says so.
    await expect(omenChip(page)).toHaveCount(0);

    // The physical deck stays at the table — "drawing" is picking the suit you
    // drew, in the Magic modal's Harrowing category.
    await openMagic(page);
    await openMagicCategory(page, 'Harrowing');
    await expect(omenPanel(page)).toContainText('none — draw from your deck, then pick the suit');
    await suitPicker(page).getByRole('button', { name: 'Keys', exact: true }).click();

    // The sole write path: cnmh_omen_<charId> = { suit, ts }.
    const written = await mock.expectSent(OMEN_KEY, (v) => v?.suit === 'Keys');
    expect(typeof written.ts).toBe('number');

    // The panel goes live: suit + the check type the omen keys off (harrow.js).
    await expect(omenPanel(page)).toContainText('Keys');
    await expect(omenPanel(page)).toContainText('Reflex Saves');
    await expect(suitPicker(page).getByRole('button', { name: 'Keys', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // …and the table sees it on the initiative strip.
    await page.getByRole('dialog', { name: 'Harrowing' }).getByRole('button', { name: 'Close' }).click();
    await page.getByRole('dialog', { name: 'Magic' }).getByRole('button', { name: 'Close' }).click();
    await expect(omenChip(page)).toHaveText(/Keys/);
  });

  test('drawing again replaces the omen; the panel Clear drops it', async ({ page }) => {
    const mock = await startTurn(page, { suit: 'Keys', ts: 1 });

    await expect(omenChip(page)).toHaveText(/Keys/);
    await openMagic(page);
    await openMagicCategory(page, 'Harrowing');
    await expect(omenPanel(page)).toContainText('Keys');

    // Draw again: the new suit REPLACES rather than stacking.
    await suitPicker(page).getByRole('button', { name: 'Stars', exact: true }).click();
    await mock.expectSent(OMEN_KEY, (v) => v?.suit === 'Stars');
    await expect(omenPanel(page)).toContainText('Stars');
    await expect(omenPanel(page)).toContainText('Will Saves');
    // Exactly one suit is pressed, and it isn't the old one.
    await expect(suitPicker(page).getByRole('button', { name: 'Keys', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(suitPicker(page).locator('button[aria-pressed="true"]')).toHaveCount(1);
    // The synced value is a single { suit, ts } record, never a collection.
    const last = mock.sent.filter((m) => m.stateType === 'omen').at(-1)!.value as any;
    expect(last.suit).toBe('Stars');
    expect(Array.isArray(last)).toBe(false);

    // The panel's own Clear drops the omen outright.
    await omenPanel(page).getByRole('button', { name: 'Clear omen' }).click();
    await mock.expectSent(OMEN_KEY, (v) => v?.suit === null);
    await expect(omenPanel(page)).toContainText('none — draw from your deck, then pick the suit');
  });

  test('Avoid Dire Fate spends the active omen', async ({ page }) => {
    const mock = await startTurn(page, { suit: 'Hammers', ts: 1 });
    await expect(omenChip(page)).toHaveText(/Hammers/);

    // The reaction is authored requiresOmen + clearsOmen, so with an omen up the
    // gate passes and the summary announces the spend before you commit.
    await openAbility(page, 'React', 'Avoid Dire Fate');
    const modal = page.getByRole('dialog', { name: /: Avoid Dire Fate$/ });
    await expect(modal).toContainText('Active harrow omen: Hammers — spent on use');
    await expect(modal).not.toContainText('No active harrow omen');

    await modal.getByRole('button', { name: 'confirm-cast' }).click();

    // useOmenGate.applyOnConfirm: log the spend, then clear.
    await mock.expectSent(
      'cnmh_encounter_global',
      logHas("E2E Harrower's harrow omen (Hammers) is spent (Avoid Dire Fate)"),
    );
    await mock.expectSent(OMEN_KEY, (v) => v?.suit === null);
    await expect(omenChip(page)).toHaveCount(0);
  });

  test('useOmenGate blocks an omen-bound ability with no omen, and the GM override unlocks it', async ({ page }) => {
    // No omen seeded — the absent key is authoritative once hydrated.
    const mock = await startTurn(page);
    await expect(omenChip(page)).toHaveCount(0);

    await openAbility(page, 'React', 'Avoid Dire Fate');
    const modal = page.getByRole('dialog', { name: /: Avoid Dire Fate$/ });

    // What useOmenGate actually gates: `ability.requiresOmen === true && !suit`
    // → a blocked section plus a hard-disabled confirm.
    const gate = modal.getByRole('heading', { name: 'Harrow Omen' });
    await expect(gate).toBeVisible();
    await expect(modal).toContainText('No active harrow omen — draw an omen from your deck first.');
    await expect(modal.getByRole('button', { name: 'confirm-cast' })).toBeDisabled();

    // The escape hatch is a GM ruling, not a silent bypass: it re-enables the
    // confirm and stamps the log line so the table can see it was overridden.
    await modal.getByRole('checkbox', { name: /Override \(GM ruling\)/ }).check();
    await expect(modal.getByRole('button', { name: 'confirm-cast' })).toBeEnabled();
    await modal.getByRole('button', { name: 'confirm-cast' }).click();

    await mock.expectSent(
      'cnmh_encounter_global',
      logHas('Avoid Dire Fate', '(override — no active omen)'),
    );
    // Anchored absence: the encounter log write above is downstream of
    // applyOnConfirm, and there was no omen to spend — so no omen write at all.
    expect(mock.sent.filter((m) => m.stateType === 'omen')).toHaveLength(0);
  });

  test('a failed Harrow Cast flat check defers the loss to the end of the turn', async ({ page }) => {
    const mock = await startTurn(page, { suit: 'Keys', ts: 1 });

    // Harrow Casting is the authored chain-into-spell metamagic (requiresOmen).
    await openAbility(page, 'Actions', 'Harrow Casting');
    const modal = page.getByRole('dialog', { name: /: Harrow Casting$/ });
    await expect(modal).toContainText('Active harrow omen: Keys');
    await expect(modal.getByLabel('spell picker')).toHaveValue(CHAIN_SPELL.id);

    const harrowGroup = modal.getByRole('group', { name: 'Harrow Cast' });
    await expect(harrowGroup).toContainText('Active omen: Keys');
    // Draw a non-matching suit whose effect is log-only (Books' free Recall
    // Knowledge) — the flat check is what's under test, not the suit mechanics.
    await harrowGroup.getByLabel('drawn-Books').check();

    // Pin the DC 11 flat check deterministically: RollEntry's tap pad face IS
    // the raw d20 (bonus-less, #1692), so tapping 1 is an unambiguous failure
    // with no seeded modifier in the loop. Scoped to this group — the flat
    // check's own pad, distinct from any other RollEntry on the sheet.
    await harrowGroup.getByRole('group', { name: 'raw d20' })
      .getByRole('button', { name: '1', exact: true }).click();
    await expect(harrowGroup).toContainText('failed — omen lost at end of turn');

    await modal.getByRole('button', { name: 'confirm-cast' }).click();

    // The real behaviour (NOT the immediate clear the issue describes): the suit
    // is KEPT and merely flagged, and the log says when it will go.
    const flagged = await mock.expectSent(OMEN_KEY, (v) => v?.pendingLoss === true);
    expect(flagged.suit).toBe('Keys');
    await mock.expectSent(
      'cnmh_encounter_global',
      logHas('harrow omen (Keys) will be lost at the end of their turn', 'failed Harrow Cast flat check'),
    );
    // Still live for the rest of the turn — the badge does not blink out.
    await expect(omenChip(page)).toHaveText(/Keys/);

    // useEndTurn is where the flag is finally honoured.
    await page.getByRole('button', { name: 'End turn' }).click();
    await mock.expectSent(
      'cnmh_encounter_global',
      logHas("E2E Harrower's harrow omen (Keys) is lost (failed Harrow Cast flat check)"),
    );
    await mock.expectSent(OMEN_KEY, (v) => v?.suit === null);
    await expectOffTurnLive(page);
    await expect(omenChip(page)).toHaveCount(0);
  });

  test('an unflagged omen survives the turn boundary', async ({ page }) => {
    const mock = await startTurn(page, { suit: 'Crowns', ts: 1 });
    await expect(omenChip(page)).toHaveText(/Crowns/);

    await page.getByRole('button', { name: 'End turn' }).click();

    // Anchor the absence on the submission itself, then on the turn having
    // actually moved to the foe.
    await mock.expectSent('cnmh_encounter_global', logHas('E2E Harrower submitted their turn'));
    await expectOffTurnLive(page);

    // useEndTurn clears ONLY on `pendingLoss && suit`. Unflagged, the omen is not
    // a per-turn resource: it rides through untouched, with no write at all.
    expect(mock.sent.filter((m) => m.stateType === 'omen')).toHaveLength(0);
    await expect(omenChip(page)).toHaveText(/Crowns/);
  });
});
