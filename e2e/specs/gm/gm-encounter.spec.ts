/**
 * GM encounter panel + initiative-commit flow (#514, part of #519) — the GM side
 * of the Initiative epic (#494). A Foundry-linked encounter in `setup` phase shows
 * the roll-for-initiative panel (`GmInitiativePanel`): per-PC roll status read off
 * `cnmh_initroll_<charId>`, an N/M tally, and the manual "Start anyway" / "Reopen
 * initiative" overrides.
 *
 * There is no Foundry bridge peer in an E2E run, so mockSession (#293) plays it:
 * it seeds the linked `setup` encounter, pushes player `cnmh_initroll_*` rolls, and
 * later pushes the `in-progress` transition the bridge would write after it commits.
 * The app owns the GM panel's reads and the `cnmh_initcommit_global` write, which is
 * what we assert — Foundry combat start is the bridge's job, not the app's.
 *
 * Desktop-only (GM Tools has no responsive layout).
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { pcEntry, encounterState } from '../../helpers/encounter';

const FIGHTER = { id: 'e2e-fighter', name: 'E2E Fighter' };
const ROGUE = { id: 'e2e-rogue', name: 'E2E Rogue' };
const COMBAT_ID = 'e2e-foundry-combat-1';

// A Foundry-linked encounter parked in `setup` — the only state in which the GM
// panel renders (GmEncounter gates it on `foundryCombatId && phase === 'setup'`).
const setupEncounter = (order: Array<Record<string, unknown>>) => ({
  ...encounterState({ phase: 'setup', order }),
  foundryCombatId: COMBAT_ID,
});

const roll = (total: number, skill: string) => ({
  d20: total - 5,
  mod: 5,
  total,
  skill,
  ts: Date.now(),
});

test.describe('GM encounter panel + initiative-commit flow', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      character: [
        { id: FIGHTER.id, name: FIGHTER.name, level: 5 },
        { id: ROGUE.id, name: ROGUE.name, level: 5 },
      ],
    });
  });

  test('roll-in → commit → in-progress: live roll status, commit, and bridge transition', async ({ page }) => {
    const order = [pcEntry(FIGHTER.id, FIGHTER.name), pcEntry(ROGUE.id, ROGUE.name)];
    const session = await mockSession(page, {
      seed: { cnmh_encounter_global: setupEncounter(order) },
    });

    await page.goto('/gm/encounter');

    // Setup panel renders the roster, each PC waiting, with a 0/2 tally.
    const panel = page.locator('[aria-label="initiative-setup-panel"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByLabel('initiative-rolled-count')).toHaveText('0 / 2 in');
    await expect(panel.getByTestId(`init-status-${FIGHTER.id}`)).toContainText('waiting');
    await expect(panel.getByTestId(`init-status-${ROGUE.id}`)).toContainText('waiting');

    // A player rolls → their row flips to "rolled" live and the tally ticks up.
    session.push(`cnmh_initroll_${FIGHTER.id}`, roll(22, 'perception'));
    await expect(panel.getByTestId(`init-status-${FIGHTER.id}`)).toContainText('22');
    await expect(panel.getByLabel('initiative-rolled-count')).toHaveText('1 / 2 in');

    session.push(`cnmh_initroll_${ROGUE.id}`, roll(17, 'stealth'));
    await expect(panel.getByTestId(`init-status-${ROGUE.id}`)).toContainText('17');
    await expect(panel.getByLabel('initiative-rolled-count')).toHaveText('2 / 2 in');

    // All rolls in → commit writes cnmh_initcommit_global with every PC's roll.
    await panel.getByRole('button', { name: 'start-anyway' }).click();
    const commit = await session.expectSent(
      'cnmh_initcommit_global',
      (v) => Array.isArray(v?.rolls) && v.rolls.length === 2,
    );
    expect(commit.rollNpcs).toBe(true);
    expect(commit.rolls).toEqual(
      expect.arrayContaining([
        { entryId: `e2e-pc-${FIGHTER.id}`, initiative: 22 },
        { entryId: `e2e-pc-${ROGUE.id}`, initiative: 17 },
      ]),
    );

    // The bridge commits and starts Foundry combat → writes the in-progress
    // encounter back. The setup panel gives way to the live status line.
    session.push(
      'cnmh_encounter_global',
      {
        ...encounterState({
          phase: 'in-progress',
          round: 1,
          currentTurnIndex: 0,
          order: [pcEntry(FIGHTER.id, FIGHTER.name, 22), pcEntry(ROGUE.id, ROGUE.name, 17)],
        }),
        foundryCombatId: COMBAT_ID,
      },
    );
    await expect(panel).toBeHidden();
    const status = page.locator('.gm-encounter-status');
    await expect(status).toContainText('in-progress');
    await expect(status).toContainText('Round 1');
  });

  test('start anyway with a missing roll commits the rolls that are in, omitting the absent PC', async ({ page }) => {
    const order = [pcEntry(FIGHTER.id, FIGHTER.name), pcEntry(ROGUE.id, ROGUE.name)];
    const session = await mockSession(page, {
      seed: { cnmh_encounter_global: setupEncounter(order) },
    });

    await page.goto('/gm/encounter');

    const panel = page.locator('[aria-label="initiative-setup-panel"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // Only the fighter rolls; the rogue is absent / stalled.
    session.push(`cnmh_initroll_${FIGHTER.id}`, roll(19, 'perception'));
    await expect(panel.getByLabel('initiative-rolled-count')).toHaveText('1 / 2 in');

    await panel.getByRole('button', { name: 'start-anyway' }).click();

    const commit = await session.expectSent('cnmh_initcommit_global');
    expect(commit.rollNpcs).toBe(true);
    expect(commit.rolls).toEqual([{ entryId: `e2e-pc-${FIGHTER.id}`, initiative: 19 }]);
  });

  test('reopen initiative retracts every submitted roll', async ({ page }) => {
    const order = [pcEntry(FIGHTER.id, FIGHTER.name), pcEntry(ROGUE.id, ROGUE.name)];
    const session = await mockSession(page, {
      seed: { cnmh_encounter_global: setupEncounter(order) },
    });

    await page.goto('/gm/encounter');

    const panel = page.locator('[aria-label="initiative-setup-panel"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    session.push(`cnmh_initroll_${FIGHTER.id}`, roll(21, 'perception'));
    await expect(panel.getByLabel('initiative-rolled-count')).toHaveText('1 / 2 in');

    await panel.getByRole('button', { name: 'reopen-initiative' }).click();

    // A null initroll is the retract signal the bridge drops from its tally —
    // the app writes one per PC.
    await session.expectSent(`cnmh_initroll_${FIGHTER.id}`, (v) => v === null);
    await session.expectSent(`cnmh_initroll_${ROGUE.id}`, (v) => v === null);
  });
});
