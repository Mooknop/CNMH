/**
 * Ability economy (#1645, part of epic #1589) — the three synced ledgers that
 * say what an ability may still do: actions handed to you mid-combat
 * (`cnmh_grantedactions_*`), how often an ability may be used
 * (`cnmh_freq_*`), and one-shot resources burned on a resolve
 * (`cnmh_consumed_*`). None of the three had any E2E coverage.
 *
 * Deliberately disjoint from `abilities.spec.ts`, which owns *using* an ability,
 * sustaining, auras and conditions. Nothing here re-treads that ground.
 *
 * ── Two pools that are easy to conflate ─────────────────────────────────────
 * `cnmh_grantedactions_<charId>` is a list of ONE-SHOT actions someone gave this
 * PC (applyAbility's `grants[]`), rendered by ActionsList as the "Granted
 * Actions" rows. It is NOT the minion action pool: a familiar's/companion's
 * budget is `turnState.actionsGranted` inside `cnmh_turnstate_<owner>-familiar`
 * (see familiar-maneuvers.spec.ts), a counter filled by Command an Animal and
 * zeroed by the turn-begin sweep. Different key, different shape, different
 * lifecycle — do not merge these specs.
 *
 * ── Turn-begin sweep ────────────────────────────────────────────────────────
 * Every own-turn box seeds `readyTurnState('1:0')` to match `activeEncounter`'s
 * round/index. A bare `readyTurnState()` makes TurnTrackerPanel treat the mount
 * as a fresh turn and reset the turnstate out from under the assertions (see the
 * `turnToken` comment in helpers/encounter.ts). Granted actions themselves are
 * NOT touched by that sweep — they expire on the encounter-advance sweep in
 * utils/turnEffects.js — but the action budget the grant is spent from is.
 *
 * ── Where the issue text and the code disagree ──────────────────────────────
 * #1645 says "spending a granted action draws from the granted pool, not the
 * base turn budget". ActionsList.handleUseGranted does the opposite: it calls
 * `spendActions(cost)` — the ordinary 3-action budget — and then removes the
 * grant from the list. The grant is permission to take an extra action, not a
 * free one, so that is what the "spent from the granted pool" test asserts.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { expectOnSheet } from '../../helpers/sheet';
import { activeEncounter, budget, deckBody, readyTurnState } from '../../helpers/encounter';

const CHAR_ID = 'e2e-econ';
const CHAR_NAME = 'E2E Econ';

// activeEncounter() builds this entryId for the PC; the granted-action expiry
// descriptors below have to name it or the boundary sweep never matches.
const PC_ENTRY_ID = `e2e-${CHAR_ID}`;

const PIN_UID = 'uid-econ-pin';

// ── Catalog content ──────────────────────────────────────────────────────────

// An ability whose structured `grants[]` hands the caster a one-shot action
// lasting until the end of their own turn (the applyAbility → expiry rail).
const HERALD_ACTION = {
  name: 'E2E Herald Call',
  actions: '1',
  traits: ['Concentrate'],
  description: 'Call out an opening.',
  grants: [
    {
      applyTo: 'self',
      duration: { until: 'caster-turn-end' },
      action: { name: 'E2E Opening Swing', cost: 1, description: 'Swing through the opening.' },
    },
  ],
};

// The same rail with NO duration → resolveExpireAt returns null → 'manual',
// which no boundary can expire. The control in the sweep box.
const STANDING_ACTION = {
  name: 'E2E Standing Oath',
  actions: '1',
  traits: ['Concentrate'],
  description: 'Swear an open-ended oath.',
  grants: [
    {
      applyTo: 'self',
      action: { name: 'E2E Oathbound Strike', cost: 1, description: 'Strike on the oath.' },
    },
  ],
};

// Free-text `frequency` — parseFrequency's third precedence branch. freqKeyFor
// falls back to a name slug for actions with no id, so this records under
// 'e2e-daily-boon'.
const DAILY_ACTION = {
  name: 'E2E Daily Boon',
  actions: '1',
  traits: ['Concentrate'],
  frequency: 'once per day',
  description: 'A boon you can call on once a day.',
};
const DAILY_FREQ_KEY = 'e2e-daily-boon';

// A save-bonus talisman: SavePrompt offers it on a matching save and
// deactivateTalisman burns it onto cnmh_consumed_<charId> when it was used.
const PIN_ITEM = {
  id: 'e2e-econ-pin',
  name: 'E2E Sanitizing Pin',
  weight: 0,
  price: 1,
  traits: ['Consumable', 'Talisman'],
  talisman: {
    affixTo: 'armor',
    activation: {
      cost: 'reaction',
      trigger: 'You attempt a Fortitude save against a disease or poison.',
      effect: { kind: 'save-bonus', save: 'fortitude', bonus: 2, value: 'status' },
    },
  },
};

const character = (extra: Record<string, unknown> = {}) => ({
  id: CHAR_ID,
  name: CHAR_NAME,
  level: 5,
  class: 'Fighter',
  ancestry: 'Human',
  background: 'Soldier',
  maxHp: 50,
  ac: 18,
  abilities: { strength: 18, constitution: 14 },
  saves: { fortitude: 10, reflex: 8, will: 8 },
  ...extra,
});

// ── Navigation ───────────────────────────────────────────────────────────────

const openTab = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name, exact: true })
    .click();

const gotoSheet = async (page: Page) => {
  await page.goto(`/character/${CHAR_ID}`);
  await expectOnSheet(page, CHAR_ID);
  await expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });
};

/** Sheet → Encounter tab → own-turn surface hydrated (`End turn` is the gate). */
const gotoEncounter = async (page: Page) => {
  await gotoSheet(page);
  await openTab(page, 'Encounter');
  await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible({ timeout: 15_000 });
};

/**
 * Tap a deck tile and confirm the sheet in front of it, landing in
 * UseAbilityModal. Scoped to `.deck-body` because the pinned "Right Now"
 * shortlist ranks the same tile above the segmented control (see `deckBody`).
 */
const openAbility = async (page: Page, name: string) => {
  await page.getByRole('tab', { name: 'Actions', exact: true }).click();
  await deckBody(page).getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: `Confirm ${name}`, exact: true }).click();
  await expect(page.getByLabel('confirm-cast')).toBeVisible();
};

/** The "Granted Actions" block ActionsList renders above the deck. */
const grantedSection = (page: Page) => page.getByLabel('Granted actions');

const grantEntry = (name: string, cost: number, extra: Record<string, unknown> = {}) => ({
  id: `grant-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  action: { name, cost, description: `${name} description.` },
  source: 'E2E Herald Call',
  grantedBy: CHAR_ID,
  ts: 1,
  ...extra,
});

test.describe('Ability economy — granted actions, frequency, consumed uses', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  // ── Granted actions ────────────────────────────────────────────────────────

  test('an ability with grants[] writes cnmh_grantedactions and the granted action becomes usable', async ({
    page,
    seed,
  }) => {
    await seed({ character: [character({ actions: [HERALD_ACTION] })] });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
      },
    });

    await gotoEncounter(page);

    // Nothing granted yet — the section only renders with a non-empty pool.
    await expect(grantedSection(page)).toHaveCount(0);

    await openAbility(page, HERALD_ACTION.name);
    await page.getByLabel('confirm-cast').click();

    // The grant lands on the synced ledger, stamped with a caster-turn-end
    // expiry resolved against the live encounter round + the caster's entryId.
    await session.expectSent(
      `cnmh_grantedactions_${CHAR_ID}`,
      (v) =>
        Array.isArray(v)
        && v.length === 1
        && v[0].action?.name === 'E2E Opening Swing'
        && v[0].source === HERALD_ACTION.name
        && v[0].expireAt?.round === 1
        && v[0].expireAt?.entryId === PC_ENTRY_ID
        && v[0].expireAt?.boundary === 'turn-end',
    );

    // …and it renders as a usable row.
    await expect(grantedSection(page)).toBeVisible();
    await expect(
      grantedSection(page).getByRole('button', { name: 'Use granted E2E Opening Swing' }),
    ).toBeVisible();
  });

  test('spending a granted action removes it from the pool AND draws on the base turn budget', async ({
    page,
    seed,
  }) => {
    // NOTE: #1645 predicted the granted pool would be spent *instead of* the
    // turn budget. handleUseGranted calls spendActions(cost) — the grant is a
    // one-shot permission slip, not a free action — so this asserts both writes.
    await seed({ character: [character()] });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
        // A 2-action grant so the budget delta is unambiguous (3 → 1).
        [`cnmh_grantedactions_${CHAR_ID}`]: [grantEntry('E2E Heavy Opening', 2)],
      },
    });

    await gotoEncounter(page);

    await expect(budget(page)).toHaveAttribute('aria-valuenow', '3');
    await grantedSection(page).getByRole('button', { name: 'Use granted E2E Heavy Opening' }).click();

    // Base budget: 2 of 3 actions spent.
    await session.expectSent(
      `cnmh_turnstate_${CHAR_ID}`,
      (v) => v?.actionsSpent === 2
        && Array.isArray(v?.actionsLog)
        && v.actionsLog.some((a: any) => a.name === 'E2E Heavy Opening' && a.cost === 2),
    );
    await expect(budget(page)).toHaveAttribute('aria-valuenow', '1');

    // Granted pool: the one-shot is gone, and the row with it.
    await session.expectSent(
      `cnmh_grantedactions_${CHAR_ID}`,
      (v) => Array.isArray(v) && v.length === 0,
    );
    await expect(grantedSection(page)).toHaveCount(0);
  });

  test('the turn-advance sweep expires a boundary-bound grant and keeps an open-ended one', async ({
    page,
    seed,
  }) => {
    // Both grants are EARNED here rather than seeded, and that is load-bearing:
    // sweepExpiredOnBoundaries reads the pool out of localStorage, not out of
    // the session cache. A value that arrived as FULL_STATE is read by
    // useSyncedState's computeInitial *before* the subscribe effect runs, so
    // that path never calls writeLocal and the sweep sees an empty pool —
    // a seeded grant is simply invisible to it. applyAbility writes both
    // localStorage and the relay, so going through the real grant rail is the
    // only way to put the sweep under test. (Same reason a client that only
    // ever *received* someone else's grant can't expire it — noted on the PR.)
    await seed({ character: [character({ actions: [HERALD_ACTION, STANDING_ACTION] })] });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
      },
    });

    await gotoEncounter(page);

    await openAbility(page, HERALD_ACTION.name);
    await page.getByLabel('confirm-cast').click();
    await openAbility(page, STANDING_ACTION.name);
    await page.getByLabel('confirm-cast').click();

    // Two grants: one caster-turn-end, one with no expiry at all.
    await session.expectSent(
      `cnmh_grantedactions_${CHAR_ID}`,
      (v) =>
        Array.isArray(v)
        && v.length === 2
        && v[0].expireAt?.entryId === PC_ENTRY_ID
        && v[1].expireAt === undefined,
    );

    const section = grantedSection(page);
    await expect(section.getByRole('button', { name: 'Use granted E2E Opening Swing' })).toBeVisible();
    await expect(section.getByRole('button', { name: 'Use granted E2E Oathbound Strike' })).toBeVisible();

    // useEndTurn → advanceTurn → sweepExpiredOnBoundaries (utils/turnEffects.js).
    await page.getByRole('button', { name: 'End turn' }).click();

    await session.expectSent(
      `cnmh_grantedactions_${CHAR_ID}`,
      (v) => Array.isArray(v) && v.length === 1 && v[0].action?.name === 'E2E Oathbound Strike',
    );
    await session.expectSent(
      'cnmh_encounter_global',
      (v) =>
        Array.isArray(v?.log)
        && v.log.some((e: any) => String(e.text).includes('E2E Opening Swing expired')),
    );

    await expect(section.getByRole('button', { name: 'Use granted E2E Opening Swing' })).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'Use granted E2E Oathbound Strike' })).toBeVisible();
  });

  // ── Frequency ──────────────────────────────────────────────────────────────

  test('a once-per-day ability records the use on cnmh_freq and is refused on a second attempt', async ({
    page,
    seed,
  }) => {
    await seed({ character: [character({ actions: [DAILY_ACTION] })] });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
      },
    });

    await gotoEncounter(page);

    // First use: no frequency block, confirm enabled, one 'day' record written.
    await openAbility(page, DAILY_ACTION.name);
    await expect(page.locator('.uam-cost-empty')).toHaveCount(0);
    await page.getByLabel('confirm-cast').click();

    await session.expectSent(
      `cnmh_freq_${CHAR_ID}`,
      (v) =>
        Array.isArray(v?.[DAILY_FREQ_KEY])
        && v[DAILY_FREQ_KEY].length === 1
        && v[DAILY_FREQ_KEY][0].per === 'day',
    );

    // Second attempt: the modal still opens (the lock is declarative, with a GM
    // override), but the lock message renders and confirm is refused.
    await openAbility(page, DAILY_ACTION.name);
    await expect(page.locator('.uam-cost-empty')).toContainText('Once per day');
    await expect(page.getByLabel('confirm-cast')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Clear lock (GM ruling)' })).toBeVisible();
  });

  test('daily preparations prune the day records from the frequency ledger', async ({ page, seed }) => {
    await seed({ character: [character({ actions: [DAILY_ACTION] })] });
    const session = await mockSession(page, {
      seed: {
        // No encounter — the Daily Preparations bar only renders out of combat.
        [`cnmh_freq_${CHAR_ID}`]: {
          [DAILY_FREQ_KEY]: [{ gameSecs: 1000, realTs: 1, per: 'day' }],
        },
      },
    });

    await gotoSheet(page);

    // Stats is the sheet's default tab; the bar sits above the effects panel.
    await page.getByRole('button', { name: 'Daily Preparations' }).click();
    await expect(page.getByText('daily abilities')).toBeVisible();

    await page.getByRole('button', { name: 'Prepare', exact: true }).click();

    // pruneLedgerByPer drops the whole key once its last record goes.
    await session.expectSent(
      `cnmh_freq_${CHAR_ID}`,
      (v) => !!v && typeof v === 'object' && Object.keys(v).length === 0,
    );
  });

  // ── Consumed uses ──────────────────────────────────────────────────────────

  test('a talisman spent from SavePrompt records on cnmh_consumed and is not offered again', async ({
    page,
    seed,
  }) => {
    await seed({
      item: [PIN_ITEM],
      character: [character({ inventory: [{ ref: PIN_ITEM.id, quantity: 1, uid: PIN_UID }] })],
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
        // Affixed to some host — affixedTalismanItems only reads the keys.
        [`cnmh_affixed_${CHAR_ID}`]: { [PIN_UID]: 'uid-econ-host' },
        [`cnmh_saveprompt_${CHAR_ID}`]: {
          reqId: 'econ-1', save: 'fortitude', dc: 20, effectName: 'E2E Blight',
        },
      },
    });

    await gotoEncounter(page);

    const prompt = page.getByRole('region', { name: 'Fortitude save prompt' });
    await expect(prompt).toBeVisible();

    const optIn = prompt.getByRole('checkbox', { name: `${PIN_ITEM.name} (+2)` });
    await expect(optIn).toBeVisible();
    await optIn.check();

    await prompt.getByRole('group', { name: 'raw d20' }).getByRole('button', { name: '12', exact: true }).click();
    await prompt.getByRole('button', { name: 'Submit Fortitude save' }).click();

    // Burned: one use recorded by item NAME, and the affix binding dropped.
    // Uid-keyed since #1659 — a second pin in the pack keeps its own charge.
    await session.expectSent(`cnmh_consumed_${CHAR_ID}`, (v) => v?.[PIN_UID] === 1);
    await session.expectSent(`cnmh_affixed_${CHAR_ID}`, (v) => !!v && !(PIN_UID in v));
    await expect(page.getByRole('status', { name: 'Save result' })).toBeVisible();

    // A fresh prompt clears the result and re-renders the entry row — the anchor
    // for the absence assertion — but the spent talisman is no longer offered.
    session.push(`cnmh_saveprompt_${CHAR_ID}`, {
      reqId: 'econ-2', save: 'fortitude', dc: 18, effectName: 'E2E Blight',
    });
    await expect(prompt.getByRole('group', { name: 'raw d20' })).toBeVisible();
    await expect(prompt.getByRole('checkbox', { name: `${PIN_ITEM.name} (+2)` })).toHaveCount(0);
  });
});
