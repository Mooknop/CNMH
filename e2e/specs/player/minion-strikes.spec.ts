/**
 * Companion Strikes (#261/#391) — first e2e coverage for MinionStrikeModal
 * (flagged as the gap in the Roll Resolution redesign's workstream-K audit,
 * #1589 metric), written directly against the RollSheet migration (successor
 * arc to #1680).
 *
 * One full arc through the companion-strike surface:
 *   masthead companion button → AnimalCompanionModal (granted pool showing)
 *   → Bite → MinionStrikeSheet → Edit: pick target → tap d20 → "Log strike"
 *   → frozen Hit degree → Roll damage → total → Apply damage
 *   → logged strike line + the minion's own MAP/pool advanced.
 *
 * Determinism: Zevira-style hound — Dex 16 (+3), Bite trained (rank 1) at
 * owner level 5 → proficiency 2 + 5 = 7 → attack +10. Enemy AC 16; d20 12 →
 * total 22 → Hit (crit needs 26). Melee Str 14 folds +2 into the damage
 * string (1d8+2); the entered total 6 rides the log verbatim.
 *
 * Seeding gotcha (#1131/#1142, same as familiar-maneuvers): the turn-begin
 * sweep zeroes minion granted-action pools when the OWNER's turnState carries
 * a mismatched turnToken — both turnstates must be seeded with the encounter's
 * position token ('1:0') or the companion pool arrives empty and the strike
 * tile is hard-blocked.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';
import {
  applyDamage,
  damageRow,
  degrees,
  openEdit,
  rollDamage,
  tapFace,
} from '../../helpers/rollSheet';

const CHAR_ID = 'e2e-hunter';
const CHAR_NAME = 'E2E Hunter';
const COMPANION_NAME = 'E2E Hound';
const ENEMY_NAME = 'E2E Goblin';

const owner = () => ({
  id: CHAR_ID,
  name: CHAR_NAME,
  level: 5,
  saves: { fortitude: 10, reflex: 8, will: 6 },
  animalCompanion: {
    name: COMPANION_NAME,
    type: 'Beast',
    size: 'Medium',
    hp: 30,
    ac: 20,
    speed: 40,
    abilities: { strength: 14, dexterity: 16, constitution: 13 },
    saves: { fortitude: 9, reflex: 11, will: 7 },
    strikes: [
      { name: 'Bite', proficiency: 1, type: 'melee', damage: '1d8', traits: ['Attack', 'Finesse'] },
    ],
  },
});

const enemy = () => ({
  entryId: 'e2e-enemy-goblin',
  kind: 'enemy' as const,
  name: ENEMY_NAME,
  initiative: 10,
  defenses: { ac: 16, saves: { fortitude: 6, reflex: 5, will: 4 } },
});

test.describe('Companion strikes', () => {
  test('Bite resolves on the RollSheet: commit spends the pool and MAP, damage rides the log', async ({
    page,
    seed,
    reset,
  }) => {
    await reset();
    await seed({ character: [owner()] });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, {
          order: [
            { entryId: `e2e-${CHAR_ID}`, kind: 'pc', charId: CHAR_ID, name: CHAR_NAME, initiative: 20 },
            enemy(),
          ],
        }),
        // Matching tokens — without them the turn-begin sweep zeroes the
        // companion pool on mount (see the header comment).
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
        // Pool already granted (Command an Animal is familiar-maneuvers'
        // territory) — this box is about the Strike itself.
        [`cnmh_turnstate_${CHAR_ID}-companion`]: {
          ...readyTurnState('1:0'),
          actionsGranted: 2,
        },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    await page
      .getByRole('navigation', { name: 'Character sheet sections' })
      .getByRole('button', { name: 'Encounter', exact: true })
      .click();

    // Encounter-hydration gate (#1366 idiom): End Turn proves encounterMode is
    // live app-wide before anything pool-gated is asserted.
    await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible();

    // Masthead companion button (data-driven hasAnimalCompanion).
    await page.getByRole('button', { name: new RegExp(`^${COMPANION_NAME}`) }).click();
    await expect(page.getByRole('heading', { name: COMPANION_NAME, level: 2 })).toBeVisible();
    await expect(page.getByRole('status')).toHaveAttribute('aria-label', '2 granted actions left');

    // The strike tile opens the sheet (enabled — the pool is granted).
    await page.locator('.companion-strikes-list').getByRole('button', { name: /Bite/ }).click();
    await expect(
      page.getByRole('heading', { name: `${COMPANION_NAME} — Bite`, level: 2 }),
    ).toBeVisible();

    // Target pick lives in the edit disclosure; the pre-roll math line carries
    // the derived AC.
    await openEdit(page);
    await page.locator('.msm-target-picks').getByRole('button', { name: ENEMY_NAME }).click();
    await expect(page.locator('.rollentry-math')).toContainText(`${ENEMY_NAME} AC 16`);

    // d20 12 + attack 10 = 22 vs AC 16 → Hit; the commit is the one moment the
    // MAP + granted-action spends fire.
    await tapFace(page, 12);
    await page.getByRole('button', { name: 'Log strike' }).click();
    await expect(degrees(page)).toHaveText('Hit');

    await session.expectSent(
      `cnmh_turnstate_${CHAR_ID}-companion`,
      (v) => v?.attacksMade === 1,
    );
    await session.expectSent(
      `cnmh_turnstate_${CHAR_ID}-companion`,
      (v) => v?.actionsSpent === 1,
    );

    // The amount step: the un-doubled total, then the deferred log line.
    await rollDamage(page);
    await damageRow(page, '1d8').getByLabel('rolled damage total').fill('6');
    await applyDamage(page);

    await session.expectSent(
      'cnmh_encounter_global',
      (v) =>
        Array.isArray(v?.log) &&
        v.log.some((e: any) =>
          String(e.text).includes(
            `${COMPANION_NAME} Bite vs ${ENEMY_NAME} (AC 16): 22 → Hit · damage 6`,
          ),
        ),
    );
  });
});
