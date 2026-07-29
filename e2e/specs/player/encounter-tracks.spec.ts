/**
 * Encounter tracks (#1469 T1-T3, #1470-#1475) — the Victory Point subsystem on
 * the player surface, untested before this file (gap #1593 under epic #1589).
 *
 * A GM-authored track lives on the global `cnmh_vpchallenge_global` key; each
 * PC's contributions append to their own single-writer `cnmh_vpresult_<charId>`
 * key, and the live pool is `startValue + party check VP + GM adjust`. No
 * Foundry bridge is involved — everything here is app + synced state, so the
 * whole subsystem is seeded through mockSession (#293).
 *
 * Degrees are pinned by DC extremes rather than by knowing the seeded
 * character's untrained skill modifier: DC 1 with a d20 of 20 is a critical
 * success (+2 VP) and DC 60 with a d20 of 1 is a critical failure (-1 VP) for
 * any plausible modifier. That keeps the VP arithmetic — the thing actually
 * under test — deterministic without seeding a skill build.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';
import { expectSheet, openPlayTab } from '../../helpers/sheet';

const CHAR_ID = 'e2e-tracker';
const CHAR_NAME = 'E2E Tracker';

// A skill that cannot fail and one that cannot succeed — see the file header.
const AUTO_CRIT_SUCCESS = { skill: 'arcana', dc: 1 };
const AUTO_CRIT_FAILURE = { skill: 'religion', dc: 60 };

// Normalized challenge doc (src/utils/victoryPoints.js): `mode` decides the
// cadence, `actionCost` the turn-budget spend, and the meter fields
// (startValue/min/max/failAt/adjust) the live pool.
const track = (over: Record<string, unknown> = {}) => ({
  id: 'e2e-vpc-ritual',
  name: 'Bolster the Ritual',
  skills: [AUTO_CRIT_SUCCESS],
  threshold: 4,
  target: 'all',
  targetIds: [CHAR_ID],
  mode: 'perRound',
  actionCost: 0,
  startValue: 0,
  adjust: 0,
  createdAt: 1,
  ...over,
});

const challenges = (...docs: Array<{ id: string }>) =>
  Object.fromEntries(docs.map((d) => [d.id, d]));

/**
 * Navigate, open the Encounter tab, and gate on encounter hydration.
 *
 * `cnmh_encounter_global` is a GLOBAL key, so the seeded FULL_STATE can land a
 * beat after first paint; every assertion here depends on `encounter.active`
 * (the per-round cadence, the action spend, the objectives strip's placement
 * inside the active-encounter branch of EncounterSkeleton). The self-status
 * bar's "End turn" button renders only for an active, in-progress encounter on
 * this PC's turn, reading the same useEncounter the cards do — so waiting for
 * it proves encounter mode is live app-wide before we touch a track.
 */
const gotoEncounter = async (page: import('@playwright/test').Page) => {
  await page.goto(`/character/${CHAR_ID}`);
  await expectSheet(page, CHAR_NAME);
  await openPlayTab(page, 'Encounter');
  await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible();
};

test.describe('Encounter tracks', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
  });

  test('a seeded VP challenge prompts on the Encounter tab; an attempt records and moves the meter', async ({
    page,
  }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME), // PC is the current turn
        // Matching turnToken — activeEncounter sits at round 1 / index 0. Without
        // it TurnTrackerPanel's turn-begin sweep rewrites turnstate mid-test.
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
        cnmh_vpchallenge_global: challenges(
          track({ skills: [AUTO_CRIT_SUCCESS, AUTO_CRIT_FAILURE] }),
        ),
      },
    });

    await gotoEncounter(page);

    const card = page.getByRole('region', { name: 'Bolster the Ritual challenge prompt' });
    await expect(card).toBeVisible();
    // One radio per authored skill, each carrying its own DC (#1470).
    await expect(card.getByRole('radio')).toHaveCount(2);
    await expect(card.getByRole('radio', { name: /Arcana/ })).toContainText('DC 1');
    // Empty party pool against the authored threshold (#1471).
    await expect(card.getByLabel('Bolster the Ritual party pool')).toHaveText('Party: 0 / 4 VP');

    await card.getByRole('radio', { name: /Arcana/ }).click();
    await card.getByLabel('Bolster the Ritual d20 roll').fill('20');
    await card.getByRole('button', { name: 'Submit Arcana check' }).click();

    // The contribution lands on this character's own result key, round-stamped
    // with the combat round.
    await session.expectSent(
      `cnmh_vpresult_${CHAR_ID}`,
      (v) =>
        Array.isArray(v?.['e2e-vpc-ritual']) &&
        v['e2e-vpc-ritual'].length === 1 &&
        v['e2e-vpc-ritual'][0].round === 1 &&
        v['e2e-vpc-ritual'][0].skill === 'arcana' &&
        v['e2e-vpc-ritual'][0].degree === 'criticalSuccess' &&
        v['e2e-vpc-ritual'][0].vp === 2,
    );

    const result = card.getByRole('status', { name: 'Skill check result' });
    await expect(result).toContainText('Critical Success');
    await expect(result).toContainText('+2 VP');
    // The meter advances live off the party's result keys.
    await expect(card.getByLabel('Bolster the Ritual party pool')).toHaveText('Party: 2 / 4 VP');

    await session.expectSent(
      'cnmh_encounter_global',
      (v) =>
        Array.isArray(v?.log) &&
        v.log.some((e: { text?: string }) =>
          String(e.text).includes('Bolster the Ritual: Arcana (DC 1)'),
        ),
    );
    await expect(page.getByRole('region', { name: 'Combat log' })).toContainText('+2 VP');
  });

  /**
   * The #1480 regression guard, and the highest-value test in the file: during
   * combat a perRound track has NO round lock. The 3-action economy is the only
   * limiter, so a PC may spend a whole turn on one track — fight, Bolster, or
   * talk, freely (#1469). Covers the action-cost box (#1473) in the same pass,
   * since the two are the same mechanism seen from both ends.
   */
  test('cadence: actions, not a round lock, limit repeat attempts in combat', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
        cnmh_vpchallenge_global: challenges(track({ mode: 'perRound', actionCost: 1, threshold: 8 })),
      },
    });

    await gotoEncounter(page);

    const card = page.getByRole('region', { name: 'Bolster the Ritual challenge prompt' });
    await expect(card).toBeVisible();
    // The authored cadence + cost are both surfaced on the card.
    await expect(card).toContainText('each round');
    await expect(card.getByLabel('costs 1 action')).toBeVisible();

    // The self-status pips are the turn budget; valuenow is actions LEFT.
    const pips = page.getByRole('region', { name: 'Self status' }).getByRole('meter');
    await expect(pips).toHaveAttribute('aria-valuenow', '3');

    // Only one authored skill → it is pre-selected, so an attempt is d20 + submit.
    const attempt = async () => {
      await card.getByLabel('Bolster the Ritual d20 roll').fill('20');
      await card.getByRole('button', { name: 'Submit Arcana check' }).click();
    };

    await attempt();
    await expect(pips).toHaveAttribute('aria-valuenow', '2');
    // The card does NOT lock after the first attempt of the round…
    await expect(card.getByLabel('Bolster the Ritual d20 roll')).toBeVisible();
    await expect(card).not.toContainText('Locked — again next round');

    await attempt();
    await expect(pips).toHaveAttribute('aria-valuenow', '1');
    await attempt();
    // …and only the exhausted budget stops the third.
    await expect(pips).toHaveAttribute('aria-valuenow', '0');

    // Three entries, all stamped with the SAME combat round — the whole point.
    await session.expectSent(
      `cnmh_vpresult_${CHAR_ID}`,
      (v) =>
        Array.isArray(v?.['e2e-vpc-ritual']) &&
        v['e2e-vpc-ritual'].length === 3 &&
        v['e2e-vpc-ritual'].every((e: { round: number; vp: number }) => e.round === 1 && e.vp === 2),
    );
    await expect(card.getByLabel('your total contribution')).toHaveText('Your total: +6 VP');
    await expect(card.getByLabel('Bolster the Ritual party pool')).toHaveText('Party: 6 / 8 VP');

    // Each attempt also billed the turn budget by the authored cost (#1473).
    await session.expectSent(
      `cnmh_turnstate_${CHAR_ID}`,
      (v) =>
        v?.actionsSpent === 3 &&
        (v.actionsLog || []).filter((a: { name: string }) => a.name === 'Bolster the Ritual').length === 3,
    );
  });

  test('fail-at-zero: a survival meter that hits its floor surfaces FAILING', async ({ page }) => {
    await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
        // A threshold-less meter (#1471/#1474): no success line, only a floor.
        // One point of stability left, so a single critical failure lands on it.
        cnmh_vpchallenge_global: challenges(
          track({
            name: 'Ritual Stability',
            skills: [AUTO_CRIT_FAILURE],
            threshold: null,
            startValue: 1,
            min: 0,
            failAt: 0,
          }),
        ),
      },
    });

    await gotoEncounter(page);

    const card = page.getByRole('region', { name: 'Ritual Stability challenge prompt' });
    const pool = card.getByLabel('Ritual Stability party pool');
    // Threshold-less meters render the bare pool — no " / N".
    await expect(pool).toHaveText('Party: 1 VP');
    await expect(card).not.toContainText('FAILING');

    await card.getByLabel('Ritual Stability d20 roll').fill('1');
    await card.getByRole('button', { name: 'Submit Religion check' }).click();

    await expect(card.getByRole('status', { name: 'Skill check result' })).toContainText(
      'Critical Failure',
    );
    // -1 VP takes the pool to the failAt floor; the clamp keeps it at min.
    await expect(pool).toHaveText('Party: 0 VP');
    await expect(card).toContainText('FAILING');
    // The party-wide strip flags the same failure, which is its whole job (#1472).
    await expect(page.getByRole('region', { name: 'Encounter objectives' })).toContainText('FAILING');
  });

  test('objectives strip lists every active track and follows the pool to completion', async ({
    page,
  }) => {
    await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
        cnmh_vpchallenge_global: challenges(
          track({ threshold: 2 }),
          // A second, concurrent track (#1470). It targets nobody on this
          // client, so it never prompts here — but the strip is party-wide and
          // still lists it, which is the distinction under test.
          track({
            id: 'e2e-vpc-crowd',
            name: 'Calm the Crowd',
            targetIds: [],
            threshold: 6,
            startValue: 2,
            createdAt: 2,
          }),
        ),
      },
    });

    await gotoEncounter(page);

    const strip = page.getByRole('region', { name: 'Encounter objectives' });
    const ritual = strip.getByLabel('Bolster the Ritual objective');
    await expect(ritual).toContainText('0 / 2 VP');
    await expect(strip.getByLabel('Calm the Crowd objective')).toContainText('2 / 6 VP');
    // Only the track that targets this PC raises a prompt card.
    await expect(page.getByRole('region', { name: 'Calm the Crowd challenge prompt' })).toHaveCount(0);

    const card = page.getByRole('region', { name: 'Bolster the Ritual challenge prompt' });
    await card.getByLabel('Bolster the Ritual d20 roll').fill('20');
    await card.getByRole('button', { name: 'Submit Arcana check' }).click();

    // +2 VP completes the 2-VP objective; the strip reflects it without a reload.
    await expect(ritual).toContainText('2 / 2 VP');
    // The untouched concurrent track is unmoved — result entries are per-track.
    await expect(strip.getByLabel('Calm the Crowd objective')).toContainText('2 / 6 VP');
  });

  /**
   * Influence tracks (#205/#1475) ride along here rather than in their own file.
   * They share the challenge key and the pool helpers but swap the card: two
   * check groups (Discover / Influence), DCs masked until the GM reveals the
   * skill, and — like every track — no lock during combat.
   */
  test('influence: masked DCs, a discovery check, and no lock during combat', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
        cnmh_vpchallenge_global: challenges(
          track({
            id: 'e2e-inf-envoy',
            kind: 'influence',
            name: 'The Envoy',
            skills: [
              { skill: 'diplomacy', dc: 1 },
              { skill: 'religion', dc: 60 },
            ],
            discoveries: [{ ...AUTO_CRIT_SUCCESS }],
            revealed: ['diplomacy'],
            roundsTotal: 10,
            threshold: null,
            actionCost: 1,
          }),
        ),
      },
    });

    await gotoEncounter(page);

    const card = page.getByRole('region', { name: 'The Envoy influence prompt' });
    await expect(card).toBeVisible();
    // Revealed skills show their DC; unrevealed ones stay masked (#205).
    await expect(card.getByRole('radio', { name: /Diplomacy/ })).toContainText('DC 1');
    await expect(card.getByRole('radio', { name: /Religion/ })).toContainText('DC ?');
    // The header tracks the scene against its authored length.
    await expect(card).toContainText('Round 1 / 10');

    // A Discovery check contributes 0 VP by design — it buys information.
    await card.getByRole('radio', { name: /Arcana/ }).click();
    await card.getByLabel('The Envoy d20 roll').fill('20');
    await card.getByRole('button', { name: 'Submit Arcana check' }).click();

    await session.expectSent(
      `cnmh_vpresult_${CHAR_ID}`,
      (v) => v?.['e2e-inf-envoy']?.[0]?.discovery === true && v['e2e-inf-envoy'][0].vp === 0,
    );

    // Neither group locks mid-combat: a second attempt in the same round lands.
    await card.getByRole('radio', { name: /Diplomacy/ }).click();
    await card.getByLabel('The Envoy d20 roll').fill('20');
    await card.getByRole('button', { name: 'Submit Diplomacy check' }).click();

    await session.expectSent(
      `cnmh_vpresult_${CHAR_ID}`,
      (v) =>
        v?.['e2e-inf-envoy']?.length === 2 &&
        v['e2e-inf-envoy'].every((e: { round: number }) => e.round === 1),
    );
    await expect(card.getByRole('radio', { name: /Arcana/ })).toBeEnabled();
    await expect(card.getByRole('radio', { name: /Diplomacy/ })).toBeEnabled();
    await expect(card.getByLabel("this round's checks")).toContainText('Discovery');

    // Both attempts billed the turn budget — the influence card is action-costed too.
    await expect(page.getByRole('region', { name: 'Self status' }).getByRole('meter')).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
  });
});
