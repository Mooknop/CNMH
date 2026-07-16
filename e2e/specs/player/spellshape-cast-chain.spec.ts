/**
 * Spellshape cast-flow chain (#1047, third-wave #519 gap) — the invested-scepter
 * Spellshape actions the #1001 epic (#1003–#1012) chains into "Cast a Spell".
 * Nothing exercised the chained cast through the real UI: a scepter's Spellshape
 * tile opens UseAbilityModal → ChainedSpellSection, the player picks a repertoire
 * spell, and the spellshape's transform / self-effect / injected riders reshape
 * that single cast. The transform algebra is unit-tested (spellshapeTransform,
 * ChainedSpellSection, UseAbilityModal.*); here we drive the four shipped scepters
 * end-to-end and assert the player-visible cost/rank chips and the synced writes.
 *
 * One caster holds all four scepters and casts every chain into ONE repertoire
 * spell — Winter's Cold Embrace (rank 6, cold *energy* damage, *basic Fortitude*
 * save) — chosen because it simultaneously satisfies each scepter's angle:
 *   - Quickened Casting (#1004): −1 action → the 2-action cast costs 1 (total 2).
 *   - Energy Ablation (#1006–#1008): a cold-damage cast grants the caster
 *     resistance to a chosen energy type = the cast rank (inline modifier effect).
 *   - Heighten (#1009): numeric effects treat it as rank 8 (12d4 → 16d4) while the
 *     slot spent / logged rank stays the native 6.
 *   - Sicken Spell (#1011): the basic-Fortitude filter keeps it eligible and the
 *     sickened riders ride the chained save request out to the GM.
 *
 * The scepters + spell are real bundled-seed docs (snapshotItems/snapshotSpells),
 * so the authored `chain`/`transform`/`injectRiders` blocks — not hand stubs —
 * are what the flow consumes. mockSession (#293) seeds the active encounter and
 * records the app's synced writes.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';
import { snapshotSpells, snapshotItems, casterCharacter, gotoSheet } from '../../helpers/spellcasting';

const CHAR_ID = 'e2e-caster';
const CHAR_NAME = 'E2E Caster';
const SPELL_ID = 'winters-cold-embrace';
const SPELL_NAME = "Winter's Cold Embrace";

const SCEPTERS = [
  'scepter-of-quickening',
  'scepter-of-energy-ablation',
  'scepter-of-heightening',
  'scepter-of-sickening',
];

// PC entry matching activeEncounter()'s default id, plus an enemy carrying the
// bridge-imported defenses (AC + save mods) the save-spell chains resolve against.
const pcOrderEntry = { entryId: `e2e-${CHAR_ID}`, kind: 'pc', charId: CHAR_ID, name: CHAR_NAME, initiative: 20 };
const troll = {
  entryId: 'e2e-enemy-frost-troll',
  kind: 'enemy' as const,
  name: 'Frost Troll',
  initiative: 10,
  defenses: { ac: 24, saves: { fortitude: 14, reflex: 9, will: 11 } },
};

// A rank-6 occult caster (Cha 16, expert) holding all four spellshape scepters,
// with rank-6 slots and Winter's Cold Embrace as the one repertoire spell.
const caster = () =>
  casterCharacter({
    id: CHAR_ID,
    name: CHAR_NAME,
    level: 12,
    slots: { '6': 3 },
    repertoire: [SPELL_ID],
    extra: {
      inventory: SCEPTERS.map((ref, i) => ({ ref, uid: `sc-${i}`, invested: true })),
    },
  });

// Find a log line on the synced encounter record matching every needle.
const logHas = (...needles: string[]) => (v: any) =>
  Array.isArray(v?.log) && v.log.some((e: any) => needles.every((n) => String(e.text).includes(n)));

// Seed the active encounter + a fresh (un-swept) turn budget, then navigate to
// the sheet's Encounter tab and open the named scepter's Spellshape modal.
async function openScepter(
  page: import('@playwright/test').Page,
  actionName: string,
): Promise<MockSession> {
  const mock = await mockSession(page, {
    seed: {
      cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, { order: [pcOrderEntry, troll] }),
      'cnmh_turnstate_e2e-caster': readyTurnState('1:0'),
    },
  });
  await gotoSheet(page, CHAR_ID, CHAR_NAME);
  await page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Encounter', exact: true })
    .click();
  // Spellshape actions live in the deck's Actions segment.
  await page.getByRole('tab', { name: 'Actions' }).click();
  await page.getByRole('button', { name: actionName, exact: true }).first().click();
  await page.getByRole('button', { name: /^Confirm / }).click();
  // Every chain defaults its picker to the one repertoire spell.
  await expect(page.getByLabel('spell picker')).toHaveValue(SPELL_ID);
  return mock;
}

test.describe('Spellshape cast-flow chain', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      spell: snapshotSpells(SPELL_ID),
      item: snapshotItems(...SCEPTERS),
      character: [caster()],
    });
  });

  test('Quickened Casting reduces the chained spell to 1 action (total 2, not 3)', async ({ page }) => {
    const mock = await openScepter(page, 'Quickened Casting');

    // Transform chip: the 2-action cast now costs 1 (−1, min 1).
    await expect(page.getByTestId('chain-transform-note')).toContainText('now 1');
    // Parent 1 + reduced 1 = 2 on the confirm button (un-transformed would be 3).
    await expect(page.getByRole('button', { name: 'confirm-cast' })).toContainText('Use (2)');

    await page.getByRole('button', { name: 'confirm-cast' }).click();
    // The reduced total is what actually drains the turn budget.
    await mock.expectSent('cnmh_turnstate_e2e-caster', (v) => v?.actionsSpent === 2);
  });

  test('Energy Ablation grants caster resistance vs the chosen type = the cast rank', async ({ page }) => {
    const mock = await openScepter(page, 'Energy Ablation');

    await page.getByLabel('Energy type').selectOption('cold');
    await page.getByRole('button', { name: 'confirm-cast' }).click();

    // Inline resistance effect on the caster, parametrized by the rank-6 cast.
    const effects = await mock.expectSent(
      'cnmh_effects_e2e-caster',
      (v) => Array.isArray(v) && v.length > 0,
    );
    expect(effects[effects.length - 1]).toMatchObject({
      name: 'Energy Ablation (cold)',
      appliedBy: CHAR_ID,
      modifiers: [{ stat: 'resistance', vs: 'cold', amount: 6 }],
    });
    // …and it's announced in the combat log.
    await mock.expectSent(
      'cnmh_encounter_global',
      logHas('gains Energy Ablation (cold)', 'resistance 6 vs cold'),
    );
  });

  test('Heighten drives numeric effects at rank 8 while the slot/logged rank stays 6', async ({ page }) => {
    const mock = await openScepter(page, 'Heighten');

    // Rank chip: numeric effects at 6+2=8, cast/counteract stays the native 6.
    await expect(page.getByTestId('chain-rank-note')).toContainText('numeric effects at rank 8');
    await expect(page.getByTestId('chain-rank-note')).toContainText('cast/counteract stays rank 6');

    // Target the troll → the save-spell damage hint scales to the boosted rank:
    // 12d4 base + 2 ranks × 2d4 = 16d4 (the rank-8 damage, not the rank-6 12d4).
    await page.getByRole('button', { name: 'Target Frost Troll' }).click();
    await expect(page.locator('.dmg-expression')).toHaveText('16d4 cold');

    await page.getByRole('button', { name: 'confirm-cast' }).click();
    // The GM's save request carries the NATIVE cast rank (the slot spent), not the
    // numeric-only boost — Heighten never changes what rank was actually cast.
    await mock.expectSent(
      'cnmh_encounter_global',
      (v) =>
        v?.saveRequests?.some(
          (r: any) =>
            r.abilityName?.includes('Heighten') && r.abilityName?.includes(SPELL_NAME) && r.rank === 6,
        ),
    );
  });

  test('Sicken Spell rides the sickened riders onto the chained save request', async ({ page }) => {
    const mock = await openScepter(page, 'Sicken Spell');

    // The basic-Fortitude filter keeps Winter's Cold Embrace eligible (asserted by
    // openScepter's picker-value check), and both riders surface degree-gated.
    await page.getByRole('button', { name: 'Target Frost Troll' }).click();
    const riders = page.getByRole('group', { name: 'damage riders' });
    await expect(riders).toContainText('sickened 1');
    await expect(riders).toContainText('sickened 2 (crit fail)');

    await page.getByRole('button', { name: 'confirm-cast' }).click();

    // The save request the GM sees is a basic-Fortitude save carrying the sickened
    // conditions, each scoped to the failure degree it applies on.
    const enc = await mock.expectSent(
      'cnmh_encounter_global',
      (v) => v?.saveRequests?.some((r: any) => r.damage?.riders?.some((rd: any) => rd.condition === 'sickened 1')),
    );
    const req = enc.saveRequests.find((r: any) =>
      r.damage?.riders?.some((rd: any) => rd.condition === 'sickened 1'),
    );
    expect(req.save).toBe('fortitude');
    expect(req.basic).toBe(true);
    expect(req.abilityName).toContain('Sicken Spell');
    expect(req.abilityName).toContain(SPELL_NAME);
    expect(req.damage.riders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ condition: 'sickened 1', on: ['failure'] }),
        expect.objectContaining({ condition: 'sickened 2', on: ['criticalFailure'] }),
      ]),
    );
  });
});
