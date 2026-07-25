/**
 * Focus Dossier (#1502 S1–S5 + the sandbox fix #1508 and foe vitals #1511) —
 * the target-centric rebuild of the encounter tab, untested before this file
 * (gap #1594, under epic #1589).
 *
 * Tapping a combatant in the TARGET ▸ strip writes a per-viewer pointer to
 * `cnmh_focustarget_<charId>` (NOT `cnmh_focus_<charId>` — that's the
 * focus-POINTS pool) and the dossier under it renders that combatant: a foe as
 * a reveal-gated stat block, an ally as the support view, your own entry as the
 * personal readout.
 *
 * The game-integrity headline is the **reveal gate**: every foe stat is masked
 * as `??` until its own Recall Knowledge reveal lands on `cnmh_knowledge_global`
 * — a mask that leaks AC or a weakness hands the table information it hasn't
 * earned. So the gating boxes assert both directions: the masked cell fills in,
 * and *no other* cell moves.
 *
 * No Foundry bridge peer is needed — this is pure app + synced state, so
 * mockSession (#293) plays the GM: it seeds the encounter/knowledge/persistent
 * keys and records the app's writes. The offline-sandbox box needs a relay that
 * reports Foundry ABSENT, which the shared fixture can't do, so it uses a local
 * routeWebSocket mock (below).
 */

import { type Page } from '@playwright/test';
import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { encounterState, pcEntry, enemyEntry, readyTurnState } from '../../helpers/encounter';

const CHAR_ID = 'e2e-dossier-pc';
const CHAR_NAME = 'E2E Scout';
const ALLY_ID = 'e2e-dossier-ally';
const ALLY_NAME = 'E2E Medic';
const ALLY_ENTRY = pcEntry(ALLY_ID, ALLY_NAME).entryId;
const FOE_NAME = 'E2E Sinspawn';
// enemyEntry slugifies the name into a stable entryId; with no `creatureKey`
// on the entry that id is also the Recall Knowledge record key (rkKeyFor).
const FOE_ENTRY = enemyEntry(FOE_NAME).entryId;

// Every stat distinct, so "revealing AC revealed ONLY AC" is unambiguous:
// AC 21 · Perc DC 18 (10+8) · RK DC 20 (level 5 common) · Fort 19 · Ref 15 · Will 17.
const FOE_DEFENSES = {
  ac: 21,
  perception: 8,
  saves: { fortitude: 9, reflex: 5, will: 7 },
  weaknesses: [{ type: 'cold', value: 5 }],
  resistances: [{ type: 'fire', value: 10 }],
};

// `bestiary.hp` is the live vitals channel (#1511) — the bridge keeps it
// current on the order entry, and the dossier renders it behind the record's
// `hp` reveal gate.
const foeEntry = (hp: { current: number; max: number } = { current: 42, max: 60 }) => ({
  ...enemyEntry(FOE_NAME, 15),
  defenses: FOE_DEFENSES,
  bestiary: { level: 5, rarity: 'common', traits: ['sinspawn'], hp },
});

// A knowledge record is read field-by-field (isFieldRevealed / isSaveRevealed /
// isIwrRevealed all optional-chain), so a partial object *is* the record —
// which keeps each test's reveal set explicit instead of buried in defaults.
const knowledge = (rec: Record<string, unknown>) => ({ [FOE_ENTRY]: rec });

const encounterWith = (order: Array<Record<string, unknown>>) =>
  encounterState({ phase: 'in-progress', round: 1, currentTurnIndex: 0, order });

/**
 * Open the Encounter tab and wait out the hydration gate. The tab paints
 * before the synced encounter record lands, so asserting (or clicking) straight
 * after the click races the tree; the self-status bar (#1502 S3) renders ONLY
 * in encounter mode with an active encounter, so it's the honest barrier.
 */
const openEncounter = async (page: Page) => {
  await page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Encounter', exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Self status' })).toBeVisible();
  await expect(page.getByLabel('Initiative order')).toBeVisible();
};

const gotoSheet = async (page: Page) => {
  await page.goto(`/character/${CHAR_ID}`);
  await expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });
  await openEncounter(page);
};

const focusButton = (page: Page, name: string) => page.getByRole('button', { name: `Focus ${name}` });

// One cell of the foe stat grid, addressed by its label — the whole point of
// the gate is that cells move independently, so index-based lookups would hide
// exactly the bug this file guards.
const statCell = (page: Page, label: string) =>
  page.getByTestId('dossier-grid').locator('.dossier-cell').filter({ hasText: label });

// How many grid cells are still masked. `??` is the redaction glyph.
const maskedCells = (page: Page) => page.getByTestId('dossier-grid').getByText('??');

const seedChar = { id: CHAR_ID, name: CHAR_NAME, level: 5, maxHp: 50, ac: 22 };

test.describe('Focus Dossier', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [seedChar] });
  });

  test('focusing a foe writes the target pointer and the dossier renders it', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_encounter_global: encounterWith([pcEntry(CHAR_ID, CHAR_NAME, 20), foeEntry()]),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
        // Identity revealed, so the card can be asserted by the foe's real name.
        cnmh_knowledge_global: knowledge({ identity: true }),
      },
    });

    await gotoSheet(page);

    // Nothing focused yet → no dossier at all.
    await expect(page.getByRole('region', { name: /^Focused/ })).toHaveCount(0);

    await focusButton(page, FOE_NAME).click();

    // The pointer is per-viewer and lives on its OWN key (#1502 S2 unbraided it
    // from the focus-POINTS pool that used to squat on cnmh_focus_<id>).
    await session.expectSent(`cnmh_focustarget_${CHAR_ID}`, (v) => v === FOE_ENTRY);

    const card = page.getByRole('region', { name: `Focused: ${FOE_NAME}` });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Level 5');

    // Focus is a toggle — tapping the same entry clears it and the card goes.
    await focusButton(page, FOE_NAME).click();
    await session.expectSent(`cnmh_focustarget_${CHAR_ID}`, (v) => v === null);
    await expect(card).toBeHidden();
  });

  test('reveal gating: each stat stays masked until its own reveal lands', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_encounter_global: encounterWith([pcEntry(CHAR_ID, CHAR_NAME, 20), foeEntry()]),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
        [`cnmh_focustarget_${CHAR_ID}`]: FOE_ENTRY,
        // No knowledge key at all → the default record: nothing revealed.
      },
    });

    await gotoSheet(page);

    // Unidentified: the strip still shows the GM's label, the dossier withholds it.
    await expect(page.getByRole('region', { name: 'Focused: Unidentified creature' })).toBeVisible();
    await expect(page.getByRole('region', { name: `Focused: ${FOE_NAME}` })).toHaveCount(0);
    // All six stat cells redacted, and the live HP number with them — the bar
    // is suppressed too, since a fill fraction would leak the value.
    await expect(maskedCells(page)).toHaveCount(6);
    await expect(page.getByTestId('dossier-foe-hp')).toContainText('??');
    await expect(page.getByTestId('dossier-foe-hp')).not.toContainText('42');

    // A lone AC reveal fills AC and nothing else.
    await session.push('cnmh_knowledge_global', knowledge({ ac: true }));
    await expect(statCell(page, 'AC')).toContainText('21');
    await expect(maskedCells(page)).toHaveCount(5);
    await expect(statCell(page, 'Ref')).toContainText('??');
    await expect(statCell(page, 'Perc DC')).toContainText('??');
    // Identity is its own gate — knowing the AC doesn't name the creature.
    await expect(page.getByRole('region', { name: 'Focused: Unidentified creature' })).toBeVisible();
    await expect(page.getByTestId('dossier-rk')).toContainText('Defenses partial');

    // Saves are gated per save, not as a block: Reflex only.
    await session.push('cnmh_knowledge_global', knowledge({ ac: true, saves: { reflex: true } }));
    await expect(statCell(page, 'Ref')).toContainText('15');
    await expect(statCell(page, 'Fort')).toContainText('??');
    await expect(statCell(page, 'Will')).toContainText('??');
    await expect(maskedCells(page)).toHaveCount(4);

    // Identity unlocks the name, the trait/level line, and the RK DC cell.
    await session.push('cnmh_knowledge_global', knowledge({ identity: true, ac: true, saves: { reflex: true } }));
    await expect(page.getByRole('region', { name: `Focused: ${FOE_NAME}` })).toBeVisible();
    await expect(statCell(page, 'RK DC')).toContainText('20');
  });

  test('reveal gating: a per-type IWR reveal surfaces only the type it fired on', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_encounter_global: encounterWith([pcEntry(CHAR_ID, CHAR_NAME, 20), foeEntry()]),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
        [`cnmh_focustarget_${CHAR_ID}`]: FOE_ENTRY,
        cnmh_knowledge_global: knowledge({ identity: true }),
      },
    });

    await gotoSheet(page);

    const card = page.getByRole('region', { name: `Focused: ${FOE_NAME}` });
    await expect(card).toBeVisible();
    // Identity alone reveals no IWR: the cold weakness and fire resistance are
    // table-invisible until something actually uncovers them.
    await expect(page.getByTestId('dossier-weak')).toHaveCount(0);
    await expect(page.getByTestId('dossier-resist')).toHaveCount(0);
    await expect(page.getByTestId('dossier-rk')).toContainText('IWR ?');

    // Partial reveals are stored per damage type on `<field>Revealed` maps
    // (Exploit Vulnerability success #454, damage-triggered IWR #1014) — the
    // cold weakness lands, the fire resistance stays hidden.
    await session.push('cnmh_knowledge_global', knowledge({ identity: true, weaknessesRevealed: { cold: true } }));
    await expect(page.getByTestId('dossier-weak')).toContainText('cold 5');
    await expect(page.getByTestId('dossier-resist')).toHaveCount(0);
    await expect(page.getByTestId('dossier-rk')).toContainText('IWR partial');

    await session.push(
      'cnmh_knowledge_global',
      knowledge({ identity: true, weaknessesRevealed: { cold: true }, resistancesRevealed: { fire: true } }),
    );
    await expect(page.getByTestId('dossier-resist')).toContainText('fire 10');
  });

  test('foe vitals: live HP tracks the bridge and persistent damage shows its type', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_encounter_global: encounterWith([pcEntry(CHAR_ID, CHAR_NAME, 20), foeEntry()]),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
        [`cnmh_focustarget_${CHAR_ID}`]: FOE_ENTRY,
        // HP rides the same gate as the rest of the block; any RK success sets it.
        cnmh_knowledge_global: knowledge({ identity: true, hp: true }),
      },
    });

    await gotoSheet(page);

    const hp = page.getByTestId('dossier-foe-hp');
    await expect(hp).toContainText('42');
    await expect(hp).toContainText('/60');

    // The bridge re-publishes the order with the damaged entry → the dossier
    // follows without a reload (this is what "live" buys the table).
    await session.push(
      'cnmh_encounter_global',
      encounterWith([pcEntry(CHAR_ID, CHAR_NAME, 20), foeEntry({ current: 17, max: 60 })]),
    );
    await expect(hp).toContainText('17');

    // The ailment picture: persistent damage is keyed by entryId (#272) and
    // renders as an informational chip carrying dice + type.
    const card = page.getByRole('region', { name: `Focused: ${FOE_NAME}` });
    await session.push('cnmh_persistent_global', {
      [FOE_ENTRY]: [{ id: 'e2e-p1', dice: '2d6', type: 'fire' }],
    });
    await expect(card).toContainText('2d6 persistent fire');
  });

  test('focusing an ally shows the support view, not the foe stat block', async ({ page }) => {
    // Focus is SEEDED rather than clicked here: the first PC focus of a session
    // drops the ally's synced vitals (see the skipped regression box at the
    // bottom of this file). The click path itself is covered on a foe above and
    // on the self card below, both of which are unaffected.
    await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_encounter_global: encounterWith([
          pcEntry(CHAR_ID, CHAR_NAME, 20),
          pcEntry(ALLY_ID, ALLY_NAME, 12),
          foeEntry(),
        ]),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
        [`cnmh_focustarget_${CHAR_ID}`]: ALLY_ENTRY,
        [`cnmh_hp_${ALLY_ID}`]: 12,
        [`cnmh_conditions_${ALLY_ID}`]: [{ id: 'frightened', value: 1 }],
      },
    });

    await gotoSheet(page);

    const support = page.getByRole('region', { name: `Focused ally: ${ALLY_NAME}` });
    await expect(support).toBeVisible();
    await expect(page.getByTestId('dossier-ally-hp')).toContainText('12');
    await expect(support).toContainText('Frightened 1');
    // A support card, not a dossier of DCs — there is no reveal grid to leak.
    await expect(page.getByTestId('dossier-grid')).toHaveCount(0);
    await expect(page.getByTestId('dossier-discover')).toHaveCount(0);
  });

  test('focusing yourself shows the personal readout while the status bar keeps the turn budget', async ({ page }) => {
    await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_encounter_global: encounterWith([
          pcEntry(CHAR_ID, CHAR_NAME, 20),
          pcEntry(ALLY_ID, ALLY_NAME, 12),
          foeEntry(),
        ]),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
        // Start focused on the ally so tapping yourself is a real focus SWITCH
        // (the click path the dossier lives on) rather than the first PC focus.
        // The ally's HP is seeded too, so the switch is between two keys the
        // snapshot actually holds — see the skipped box at the bottom.
        [`cnmh_focustarget_${CHAR_ID}`]: ALLY_ENTRY,
        [`cnmh_hp_${ALLY_ID}`]: 12,
        [`cnmh_hp_${CHAR_ID}`]: 21,
      },
    });

    await gotoSheet(page);

    // The self-status bar (#1502 S3) leads the tab whether or not you're
    // focused: round, the three action pips, and End Turn on your own turn.
    const bar = page.getByRole('region', { name: 'Self status' });
    await expect(bar).toContainText('Round 1');
    await expect(bar.getByLabel('3 actions left')).toBeVisible();
    await expect(bar).toContainText('21/50 HP');
    await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible();

    await focusButton(page, CHAR_NAME).click();

    const self = page.getByRole('region', { name: `Focused: ${CHAR_NAME} (you)` });
    await expect(self).toBeVisible();
    await expect(self).toContainText('YOU');
    await expect(page.getByTestId('dossier-self-hp')).toContainText('21');
    await expect(page.getByTestId('dossier-self-hp')).toContainText('/50');
    // Own defenses read as the character's own numbers, not as foe DCs.
    await expect(page.getByTestId('dossier-self-defenses')).toContainText('Fort');
    await expect(page.getByTestId('dossier-self-meta')).toBeVisible();
    // Neither the ally card nor the reveal grid.
    await expect(page.getByRole('region', { name: /^Focused ally/ })).toHaveCount(0);
    await expect(page.getByTestId('dossier-grid')).toHaveCount(0);

    // The budget survives focusing yourself — the bar and the card are separate
    // surfaces, and the S3 bar is the one that owns the turn economy.
    await expect(bar.getByLabel('3 actions left')).toBeVisible();
  });

  test('discover CTAs offer Recall Knowledge on an unidentified foe and retire once identified', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_encounter_global: encounterWith([pcEntry(CHAR_ID, CHAR_NAME, 20), foeEntry()]),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
        [`cnmh_focustarget_${CHAR_ID}`]: FOE_ENTRY,
      },
    });

    await gotoSheet(page);

    const discover = page.getByTestId('dossier-discover');
    await expect(discover).toBeVisible();
    // Exploit Vulnerability is the thaumaturge's reveal path only — this PC has
    // no class feature, so Recall Knowledge is the whole offer.
    await expect(discover.getByRole('button', { name: /Exploit Vulnerability/ })).toHaveCount(0);

    await discover.getByRole('button', { name: /Recall Knowledge/ }).click();
    const bestiary = page.getByRole('dialog', { name: 'Bestiary' });
    await expect(bestiary).toBeVisible();
    await bestiary.getByRole('button', { name: 'Close' }).click();
    await expect(bestiary).toBeHidden();

    // Identity landed → the dossier stops being a discovery surface.
    await session.push('cnmh_knowledge_global', knowledge({ identity: true }));
    await expect(discover).toHaveCount(0);
  });

  test('offline sandbox: the focus target stays interactive with no Foundry peer', async ({ page }) => {
    // #1508 regression guard. The sandbox freeze (#553) blanks per-character
    // writes when the DO is up but Foundry is down; `focustarget` is a UI
    // pointer, not a resource burn, so it must be in SANDBOX_WRITABLE_TYPES —
    // otherwise tapping a TARGET entry silently no-ops and the whole encounter
    // tab is unbrowsable offline.
    const sent = await mockOfflineRelay(page, {
      cnmh_playmode_global: 'exploration',
      cnmh_encounter_global: encounterWith([pcEntry(CHAR_ID, CHAR_NAME, 20), foeEntry()]),
      [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
      cnmh_knowledge_global: knowledge({ identity: true }),
    });

    await gotoSheet(page);

    // The app really is in the sandbox, not merely disconnected.
    await expect(page.locator('[data-testid="sync-status"][data-state="sandbox"]')).toBeVisible();

    await focusButton(page, FOE_NAME).click();

    // Card renders locally AND the write reached the relay — the freeze let it by.
    await expect(page.getByRole('region', { name: `Focused: ${FOE_NAME}` })).toBeVisible();
    await expect
      .poll(() => sent.some((m) => m.stateType === 'focustarget' && m.characterId === CHAR_ID && m.value === FOE_ENTRY), {
        message: 'the focus target was frozen by the offline sandbox',
      })
      .toBe(true);

    // Still fully browsable offline: refocusing swaps the card.
    await focusButton(page, CHAR_NAME).click();
    await expect(page.getByRole('region', { name: `Focused: ${CHAR_NAME} (you)` })).toBeVisible();
  });

  // KNOWN BUG — skipped, not hopeful. The FIRST time a session focuses a PC,
  // the support/self card renders with no HP and no condition chips; tapping
  // away and back fills them in.
  //
  // Dossier reads the focused PC's vitals through
  // `useSyncedState(syncKey(RELAY.HP, pcId), null)`, with `pcId` defaulting to
  // the literal 'none' while no PC is focused. useSyncedState re-derives on a
  // key change (`prevKey` block) — but that re-derive only lands when the key
  // it is leaving HAD a snapshot value. Leaving a key the snapshot never held
  // (`cnmh_hp_none`, always absent) drops the new key's value, so the card
  // shows nothing until the next write to it.
  //
  // Verified against main at this branch point from both a no-focus and a
  // foe-focused start; a later focus of the SAME ally renders correctly, as
  // does any switch between two PC keys the snapshot holds, and a peer push of
  // `cnmh_hp_<ally>` repairs it. Fixing it means touching src/, which this
  // E2E-only PR deliberately doesn't — un-skip once the hook (or the 'none'
  // placeholder) is fixed.
  test.skip('first PC focus of a session renders the ally vitals', async ({ page }) => {
    await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_encounter_global: encounterWith([
          pcEntry(CHAR_ID, CHAR_NAME, 20),
          pcEntry(ALLY_ID, ALLY_NAME, 12),
          foeEntry(),
        ]),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
        [`cnmh_hp_${ALLY_ID}`]: 12,
      },
    });

    await gotoSheet(page);
    await focusButton(page, ALLY_NAME).click();

    await expect(page.getByRole('region', { name: `Focused ally: ${ALLY_NAME}` })).toBeVisible();
    await expect(page.getByTestId('dossier-ally-hp')).toContainText('12');
  });
});

type Relayed = { characterId: string; stateType: string; value: unknown };

/**
 * A relay mock that reports Foundry ABSENT — the one thing `fixtures/session.ts`
 * deliberately can't do (it hard-codes `PRESENCE foundry:true` so ordinary specs
 * aren't frozen by #553). Otherwise it mirrors the fixture: replay the seed as
 * FULL_STATE on connect, record client UPDATEs, never echo them back.
 *
 * Local to this spec on purpose — three sibling E2E specs are landing off the
 * same main, so the shared fixture stays untouched. A `foundry` option on
 * `mockSession` would be the natural home for it as a follow-up.
 */
async function mockOfflineRelay(page: Page, seed: Record<string, unknown>): Promise<Relayed[]> {
  const sent: Relayed[] = [];
  const payload: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(seed)) {
    const m = key.match(/^cnmh_([^_]+)_(.+)$/);
    if (!m) throw new Error(`mockOfflineRelay: "${key}" is not a synced cnmh_<type>_<id> key`);
    (payload[m[2]] ??= {})[m[1]] = value;
  }

  await page.routeWebSocket('**/session/osprey-covey', (ws) => {
    ws.send(JSON.stringify({ type: 'FULL_STATE', payload }));
    ws.send(JSON.stringify({ type: 'PRESENCE', foundry: false }));
    ws.onMessage((raw) => {
      let msg: { type?: string; characterId?: string; key?: string; value?: unknown };
      try {
        msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
      } catch {
        return;
      }
      if (msg?.type !== 'UPDATE' || !msg.characterId || !msg.key) return;
      sent.push({ characterId: msg.characterId, stateType: msg.key, value: msg.value });
    });
  });

  return sent;
}
