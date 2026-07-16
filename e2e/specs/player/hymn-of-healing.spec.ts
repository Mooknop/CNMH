/**
 * Hymn of Healing through the real cast flow — second consumer of the spell
 * cast-flow harness (#1133), closing out the #1127 Compositions item.
 *
 * Same UI chain as lingering-composition.spec.ts, but CastSpellModal routes
 * this id to HymnOfHealingModal: pick a willing target from the party list,
 * confirm, and one cast fans out across five synced keys:
 *
 *   cnmh_hp_<targetId>        — on-cast temp HP granted (take-higher)
 *   cnmh_focus_<casterId>     — focus point auto-spent
 *   cnmh_turnstate_<casterId> — Two Actions spent
 *   cnmh_sustains_<casterId>  — sustain ledger entry carrying the heal payload
 *                               (the turn-start fast-healing tick reads it)
 *   cnmh_playing_<casterId>   — 'while playing' flag (#935)
 *
 * Amounts auto-heighten to half the caster's level rounded up: level 5 →
 * rank 3 → fast healing 6, +6 temp HP (hymnHealing.js).
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';
import {
  snapshotSpells,
  casterCharacter,
  gotoSheet,
  openSpellsSegment,
  castSpell,
} from '../../helpers/spellcasting';

const CHAR_ID = 'e2e-bard';
const CHAR_NAME = 'E2E Bard';
const ALLY_ID = 'e2e-ally';
const ALLY_NAME = 'E2E Ally';
const ALLY_MAX_HP = 30;

const bard = (focus: { max: number; current?: number }) =>
  casterCharacter({
    id: CHAR_ID,
    name: CHAR_NAME,
    charClass: 'Bard',
    focus,
    focusSpells: ['hymn-of-healing'],
  });

// A second party member so the target picker has a non-self choice.
const ally = () => ({ id: ALLY_ID, name: ALLY_NAME, level: 5, maxHp: ALLY_MAX_HP });

async function openHymn(page: import('@playwright/test').Page) {
  await gotoSheet(page, CHAR_ID, CHAR_NAME);
  // Compositions render in the deck's first-class Spells segment now.
  await openSpellsSegment(page);
  await castSpell(page, 'Hymn of Healing');
  await expect(page.getByRole('heading', { name: 'Hymn of Healing', level: 2 })).toBeVisible();
}

test.describe('Hymn of Healing cast flow', () => {
  test('casting on an ally grants temp HP and registers the sustain', async ({
    page,
    seed,
    reset,
  }) => {
    await reset();
    await seed({
      spell: snapshotSpells('hymn-of-healing'),
      character: [bard({ max: 2, current: 2 }), ally()],
    });
    const mock = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
      },
    });

    await openHymn(page);
    // Level 5 → rank 3 amounts surface in the blurb.
    await expect(page.locator('.hoh-blurb')).toContainText('fast healing 6');

    // Default target is self; retarget to the ally.
    await page.getByRole('button', { name: `Target ${ALLY_NAME}` }).click();
    await expect(page.getByRole('button', { name: `Target ${ALLY_NAME}` })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Cast Hymn of Healing' }).click();

    // On-cast temp HP on the ALLY's hp record, seeded at full from maxHp.
    await mock.expectSent(
      `cnmh_hp_${ALLY_ID}`,
      (v) => v?.temp === 6 && v?.current === ALLY_MAX_HP && v?.max === ALLY_MAX_HP,
    );
    // Caster pays: 1 focus point + Two Actions.
    await mock.expectSent(`cnmh_focus_${CHAR_ID}`, (v) => v === 1);
    await mock.expectSent(`cnmh_turnstate_${CHAR_ID}`, (v) => v?.actionsSpent === 2);
    // Sustain ledger entry carries the heal payload for the turn-start tick.
    await mock.expectSent(`cnmh_sustains_${CHAR_ID}`, (v) =>
      (v || []).some(
        (s: any) =>
          s.spellId === 'hymn-of-healing' &&
          s.heal?.targetId === ALLY_ID &&
          s.heal?.fastHealing === 6 &&
          s.heal?.tempHp === 6,
      ),
    );
    // A Composition cast — the caster is now playing (#935).
    await mock.expectSent(`cnmh_playing_${CHAR_ID}`, (v) => v?.active === true);

    await expect(page.locator('.hoh-result')).toContainText(
      `Hymn of Healing on ${ALLY_NAME} — fast healing 6, +6 temp HP`,
    );
  });

  test('an empty focus pool disables the cast', async ({ page, seed, reset }) => {
    await reset();
    await seed({
      spell: snapshotSpells('hymn-of-healing'),
      character: [bard({ max: 2, current: 0 })],
    });
    const mock = await mockSession(page, {
      seed: { cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME) },
    });

    await openHymn(page);

    const confirm = page.getByRole('button', { name: 'No focus points' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeDisabled();
    // Nothing crossed the session: no spend, no sustain, no temp HP.
    expect(
      mock.sent.filter((m) => ['focus', 'sustains', 'hp'].includes(m.stateType)),
    ).toHaveLength(0);
  });
});
