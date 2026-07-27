/**
 * Attack-roll resolution (#513, part of #519) — the actor-roll-vs-AC path through
 * UseAbilityModal: TargetRollResolver (single roll) and MultiRayResolver (one roll
 * per ray). encounter-prompts.spec covers requested saves; nothing covered an
 * attack roll resolved against a target's AC, the conditional situational toggles
 * (#274), or the multi-ray flow until now.
 *
 * The player drives the real resolver UI; mockSession (#293) seeds the active
 * encounter + enemy targets (with AC) and the actor's turn state. Degree math is
 * unit-tested — here we assert the player-visible degree chip and the synced
 * combat-log line, with deterministic d20 faces so each outcome is fixed.
 *
 * Since #1687 the single-roll path is RollSheet's: the face is TAPPED and no
 * degree exists until the commit, so the degree assertions moved after it.
 * Since #1691 (workstream J) direct multi-ray moved onto RollSheet too — a
 * sequential per-ray driver (MultiRayResolver via SequentialAttackSteps,
 * mounted through RollSheet's `dieSlot`): one ray's d20 pad and commit pill
 * at a time, not N simultaneous typed inputs. The outer sheet's own commit
 * pill only enables once every ray has rolled.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';
import {
  commitRoll, commitStep, currentStepLabel, degrees, openEdit, sheetPill, summaryLine,
} from '../../helpers/rollSheet';

const CHAR_ID = 'e2e-fighter';
const CHAR_NAME = 'E2E Fighter';

// PC order entry matching activeEncounter()'s default (kind:'pc', current turn).
const pcOrderEntry = { entryId: `e2e-${CHAR_ID}`, kind: 'pc', charId: CHAR_ID, name: CHAR_NAME, initiative: 20 };

// An enemy combatant the resolver can read an AC off (enemyWithDefenses filter).
const enemy = (name: string, ac: number) => ({
  entryId: `e2e-enemy-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  kind: 'enemy' as const,
  name,
  initiative: 10,
  defenses: { ac },
});

const openEncounterTab = (page: import('@playwright/test').Page) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Encounter', exact: true })
    .click();

const expectSheet = (page: import('@playwright/test').Page) =>
  expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });

// Find a log line on the synced encounter record matching every needle.
const logHas = (...needles: string[]) => (v: any) =>
  Array.isArray(v?.log) && v.log.some((e: any) => needles.every((n) => String(e.text).includes(n)));

test.describe('Attack-roll resolution', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('single-target: a Strike resolves vs AC and logs the hit', async ({ page, seed }) => {
    await seed({
      character: [{
        id: CHAR_ID,
        name: CHAR_NAME,
        level: 5,
        // attackMod → actor-roll vs AC (rollResolution Priority 2); Attack trait
        // marks it a MAP-bearing attack. No damage dice → no DamagePanel.
        actions: [{ name: 'E2E Slash', actions: '1', traits: ['Attack'], attackMod: 10, description: 'A melee strike.' }],
      }],
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, {
          order: [pcOrderEntry, enemy('E2E Goblin', 20)],
        }),
        'cnmh_turnstate_e2e-fighter': readyTurnState(),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);

    await page.getByRole('tab', { name: 'Actions' }).click();
    await page.getByRole('button', { name: /E2E Slash/ }).first().click();
    await page.getByRole('button', { name: /^Confirm / }).click();

    // Pick the target → the roll sheet takes over.
    await page.getByRole('button', { name: 'Target E2E Goblin' }).click();

    // No degree may exist before the commit — that is friction F2's fix.
    await expect(degrees(page)).toHaveCount(0);

    // d20 15 + attackMod 10 = 25 vs AC 20 → Hit (non-nat, no degree shift).
    // The commit is what logs, spends and toasts, all in one moment.
    await commitRoll(page, 15);
    await expect(degrees(page)).toHaveText('Hit');

    await session.expectSent(
      'cnmh_encounter_global',
      logHas('E2E Slash', 'vs E2E Goblin (AC 20)', '25', '→ Hit'),
    );
  });

  test('conditional toggle: flipping an off-guard-style situational bonus turns a miss into a hit', async ({ page, seed }) => {
    await seed({
      character: [{
        id: CHAR_ID,
        name: CHAR_NAME,
        level: 5,
        actions: [{ name: 'E2E Slash', actions: '1', traits: ['Attack'], attackMod: 10, description: 'A melee strike.' }],
      }],
      // A conditional ('vs X') circumstance modifier on the melee attack stat →
      // surfaces as an opt-in resolver toggle (#274), not netted into the base.
      effect: [{
        id: 'e2e-vs-prone',
        name: "E2E Hunter's Edge",
        description: 'A conditional edge vs prone foes.',
        modifiers: [{ stat: 'meleeAttack', vs: 'prone target', amount: 2, kind: 'circumstance' }],
      }],
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, {
          order: [pcOrderEntry, enemy('E2E Goblin', 20)],
        }),
        'cnmh_turnstate_e2e-fighter': readyTurnState(),
        'cnmh_effects_e2e-fighter': [{ effectId: 'e2e-vs-prone', sourceName: "E2E Hunter's Edge" }],
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);

    await page.getByRole('tab', { name: 'Actions' }).click();
    await page.getByRole('button', { name: /E2E Slash/ }).first().click();
    await page.getByRole('button', { name: /^Confirm / }).click();
    await page.getByRole('button', { name: 'Target E2E Goblin' }).click();

    // The toggle lives in the sheet's edit disclosure now, and its bonus folds
    // into the ONE number the sheet rolls against (the pre-commit summary line
    // is where that is visible — there is no degree to preview any more).
    await expect(summaryLine(page)).toContainText('attack +10');
    await openEdit(page);
    const toggle = page.getByRole('group', { name: 'situational bonuses' }).getByRole('button');
    await expect(toggle).toContainText('prone target');
    await toggle.click();
    await expect(summaryLine(page)).toContainText('attack +12');

    // d20 8 + 10 = 18 would have missed; + the flipped 2 = 20 == AC 20 → Hit.
    await commitRoll(page, 8);
    await expect(degrees(page)).toHaveText('Hit');

    await session.expectSent(
      'cnmh_encounter_global',
      logHas('vs E2E Goblin (AC 20)', '20', '→ Hit', 'incl. +2'),
    );
  });

  test('multi-ray: each ray resolves independently against its own target', async ({ page, seed }) => {
    await seed({
      character: [{
        id: CHAR_ID,
        name: CHAR_NAME,
        level: 5,
        // rollCount:2 → MultiRayResolver renders one roll row per ray.
        actions: [{ name: 'E2E Twin Bolt', actions: '2', traits: ['Attack'], attackMod: 10, rollCount: 2, description: 'Two rays.' }],
      }],
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, {
          order: [pcOrderEntry, enemy('E2E Goblin A', 20), enemy('E2E Goblin B', 25)],
        }),
        'cnmh_turnstate_e2e-fighter': readyTurnState(),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);

    await page.getByRole('tab', { name: 'Actions' }).click();
    await page.getByRole('button', { name: /E2E Twin Bolt/ }).first().click();
    await page.getByRole('button', { name: /^Confirm / }).click();

    // Picking the FIRST target hands off to the sheet (#1687); the TargetPicker
    // for the second one is reached through the edit disclosure from there.
    await page.getByRole('button', { name: 'Target E2E Goblin A' }).click();
    await openEdit(page);
    await page.getByRole('button', { name: 'Target E2E Goblin B' }).click();

    // Sequential (#1691, LOCKED): ray 1 first, defaulting to Goblin A.
    await expect(currentStepLabel(page)).toHaveText('Ray 1 of 2');
    await expect(degrees(page)).toHaveCount(0);

    // Ray 1: 15 + 10 = 25 vs AC 20 → Hit.
    await commitStep(page, 15);
    await expect(currentStepLabel(page)).toHaveText('Ray 2 of 2');
    // Ray 2: 10 + 10 = 20 vs AC 25 → Miss (20 is above AC−10, so a plain
    // failure rather than a critical miss).
    await commitStep(page, 10);

    // Both rays rolled — the outer sheet's own commit pill is now live; it
    // fires the whole confirm sequence in one moment, same as single-roll.
    await sheetPill(page).click();
    await expect(degrees(page)).toHaveText(['Hit', 'Miss']);

    await session.expectSent(
      'cnmh_encounter_global',
      (v) =>
        logHas('ray 1 vs E2E Goblin A (AC 20)', '25', '→ Hit')(v) &&
        logHas('ray 2 vs E2E Goblin B (AC 25)', '20', '→ Miss')(v),
    );
  });
});
