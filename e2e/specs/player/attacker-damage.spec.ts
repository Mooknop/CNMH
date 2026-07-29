/**
 * Attacker damage step (#1049, part of #519; absorbs #345's DamagePanel angle) —
 * the hit → enter-total → apply path through UseAbilityModal's damage panel.
 * attack-rolls.spec covers the roll-vs-AC degrees; damage.spec covers the
 * *defender* receiving HP/persistent state. Nothing covered the attacker's side:
 * the typed damage profile off a strike's damageType (#1018), multi-instance
 * per-type entry (#1019), monster IWR netting + reveal-on-trigger (#1014), and
 * the typed Foundry relay that must stay RAW while the display nets IWR (#1016).
 *
 * The player drives the real resolver + damage panel; mockSession (#293) seeds
 * the active encounter with enemy targets carrying `defenses` (AC + IWR, as the
 * bridge imports them) and records the app's writes. Damage algebra is
 * unit-tested — here we assert the player-visible breakdown, the synced combat
 * log, the cnmh_knowledge_global reveal, and the cnmh_dmgapply_global payload.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';
import {
  applyDamage, breakdown, commitRoll, damageRow, degrees, rollDamage,
} from '../../helpers/rollSheet';
import { expectSheet, openPlayTab } from '../../helpers/sheet';

const CHAR_ID = 'e2e-fighter';
const CHAR_NAME = 'E2E Fighter';

// PC order entry matching activeEncounter()'s default (kind:'pc', current turn).
const pcOrderEntry = { entryId: `e2e-${CHAR_ID}`, kind: 'pc', charId: CHAR_ID, name: CHAR_NAME, initiative: 20 };

// An enemy combatant with bridge-imported defenses (AC + optional IWR lists).
const enemy = (name: string, defenses: Record<string, unknown>) => ({
  entryId: `e2e-enemy-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  kind: 'enemy' as const,
  name,
  initiative: 10,
  defenses,
});

const GOBLIN_ENTRY_ID = 'e2e-enemy-e2e-goblin';

// Find a log line on the synced encounter record matching every needle.
const logHas = (...needles: string[]) => (v: any) =>
  Array.isArray(v?.log) && v.log.some((e: any) => needles.every((n) => String(e.text).includes(n)));

// Seed + navigate boilerplate shared by every test: one strike action, one enemy.
const setup = async (
  page: import('@playwright/test').Page,
  seed: (data: Record<string, unknown>) => Promise<void>,
  action: Record<string, unknown>,
  enemyEntry: Record<string, unknown>,
) => {
  await seed({
    character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5, actions: [action] }],
  });
  const session = await mockSession(page, {
    seed: {
      cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, {
        order: [pcOrderEntry, enemyEntry],
      }),
      'cnmh_turnstate_e2e-fighter': readyTurnState(),
    },
  });

  await page.goto(`/character/${CHAR_ID}`);
  await expectSheet(page, CHAR_NAME);
  await openPlayTab(page, 'Encounter');

  await page.getByRole('tab', { name: 'Actions' }).click();
  await page.getByRole('button', { name: new RegExp(String(action.name)) }).first().click();
  await page.getByRole('button', { name: /^Confirm / }).click();
  await page.getByRole('button', { name: `Target ${enemyEntry.name}` }).click();
  return session;
};

test.describe('Attacker damage step', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('a hit\'s entered total reaches the log and the typed Foundry relay', async ({ page, seed }) => {
    const session = await setup(page, seed, {
      // damage + damageType (#1018) → buildDamageProfile emits a typed profile
      // and the panel appears after a hit.
      name: 'E2E Slash', actions: '1', traits: ['Attack'], attackMod: 10,
      damage: '2d8+4', damageType: 'piercing', description: 'A melee strike.',
    }, enemy('E2E Goblin', { ac: 20 }));

    // d20 15 + 10 = 25 vs AC 20 → Hit; the amount step is only offered after.
    await commitRoll(page, 15);
    await expect(degrees(page)).toHaveText('Hit');
    await rollDamage(page);
    await expect(page.locator('.de-expression')).toHaveText('2d8+4 piercing');

    await page.getByLabel('rolled damage total').fill('13');
    await expect(breakdown(page)).toContainText('13');

    await applyDamage(page);
    await session.expectSent(
      'cnmh_encounter_global',
      logHas('E2E Slash', 'vs E2E Goblin (AC 20)', '→ Hit', '· damage 13'),
    );
    // The relay carries the profile's type with the raw total (#1016).
    await session.expectSent(
      'cnmh_dmgapply_global',
      (v) => v?.sourceName === 'E2E Slash'
        && v?.hits?.length === 1
        && v.hits[0].entryId === GOBLIN_ENTRY_ID
        && v.hits[0].amount === 13
        && v.hits[0].type === 'piercing',
    );
  });

  test('a critical hit doubles the entered (un-doubled) total', async ({ page, seed }) => {
    const session = await setup(page, seed, {
      name: 'E2E Slash', actions: '1', traits: ['Attack'], attackMod: 10,
      damage: '2d8+4', damageType: 'piercing', description: 'A melee strike.',
    }, enemy('E2E Goblin', { ac: 20 }));

    // Nat 20: 30 vs AC 20 → Critical Hit; the built-in Crit ×2 toggle is on.
    await commitRoll(page, 20);
    await expect(degrees(page)).toHaveText('Critical Hit');

    await rollDamage(page);
    await page.getByLabel('rolled damage total').fill('13');
    await expect(breakdown(page)).toContainText('26 (13 ×2)');

    await applyDamage(page);
    await session.expectSent(
      'cnmh_encounter_global',
      logHas('→ Critical Hit', 'damage 26 (13 ×2)'),
    );
    await session.expectSent(
      'cnmh_dmgapply_global',
      (v) => v?.hits?.[0]?.amount === 26 && v?.hits?.[0]?.type === 'piercing',
    );
  });

  test('monster weakness nets into the shown damage, reveals itself, and the relay stays raw', async ({ page, seed }) => {
    const session = await setup(page, seed, {
      name: 'E2E Fire Lash', actions: '1', traits: ['Attack'], attackMod: 10,
      damage: '1d6', damageType: 'fire', description: 'A burning strike.',
    }, enemy('E2E Goblin', {
      ac: 20,
      // Bridge-imported IWR (#1014): hidden until it modifies applied damage.
      weaknesses: [{ type: 'fire', value: 5 }],
    }));

    await commitRoll(page, 15);
    await expect(degrees(page)).toHaveText('Hit');

    // Entered 4 + weakness 5 → displayed 9, named now that it fired.
    await rollDamage(page);
    await page.getByLabel('rolled damage total').fill('4');
    await expect(breakdown(page)).toContainText('9 (4 +5 weakness (fire))');

    await applyDamage(page);
    await session.expectSent(
      'cnmh_encounter_global',
      logHas('E2E Fire Lash', 'damage 9 (4 +5 weakness (fire))'),
    );
    // Reveal-on-trigger: announced in the log + stamped on the RK record.
    await session.expectSent(
      'cnmh_encounter_global',
      logHas("E2E Goblin's weakness to fire is revealed!"),
    );
    await session.expectSent(
      'cnmh_knowledge_global',
      (v) => v?.[GOBLIN_ENTRY_ID]?.weaknessesRevealed?.fire === true,
    );
    // The relay must send the PRE-IWR total — Foundry nets IWR authoritatively.
    await session.expectSent(
      'cnmh_dmgapply_global',
      (v) => v?.hits?.[0]?.amount === 4 && v?.hits?.[0]?.type === 'fire',
    );
  });

  test('multi-instance entry: per-type totals, per-instance resistance, raw typed relay', async ({ page, seed }) => {
    const session = await setup(page, seed, {
      name: 'E2E Flaming Slash', actions: '1', traits: ['Attack'], attackMod: 10,
      damage: '2d8+4', damageType: 'piercing', description: 'A rune-lit strike.',
      // An immediate extra-dice rider of a different type (a flaming rune's
      // fire dice) → damageEntryParts splits the entry into per-type inputs (#1019).
      riders: [{ id: 'e2e-flaming', label: 'flaming', dice: '1d6', type: 'fire' }],
    }, enemy('E2E Goblin', {
      ac: 20,
      resistances: [{ type: 'fire', value: 2 }],
    }));

    await commitRoll(page, 15);
    await expect(degrees(page)).toHaveText('Hit');

    // One DamageEntry row per typed part, base first. They share the
    // `rolled damage total` name, so each is reached through its own row.
    await rollDamage(page);
    await damageRow(page, '2d8+4 piercing').getByLabel('rolled damage total').fill('10');
    await damageRow(page, '1d6 fire').getByLabel('rolled damage total').fill('3');

    // Fire instance nets 3−2=1 → 10+1=11 shown; the resistance is named.
    await expect(breakdown(page)).toContainText('11 (13 -2 resistance (fire))');

    await applyDamage(page);
    await session.expectSent(
      'cnmh_encounter_global',
      logHas('E2E Flaming Slash', 'damage 11 (13 -2 resistance (fire))'),
    );
    await session.expectSent(
      'cnmh_encounter_global',
      logHas("E2E Goblin's resistance to fire is revealed!"),
    );
    // Relay: raw summed amount + raw per-type instances for PF2e's own netting.
    await session.expectSent(
      'cnmh_dmgapply_global',
      (v) => v?.hits?.[0]?.amount === 13
        && Array.isArray(v.hits[0].instances)
        && v.hits[0].instances.some((i: any) => i.type === 'piercing' && i.amount === 10)
        && v.hits[0].instances.some((i: any) => i.type === 'fire' && i.amount === 3),
    );
  });
});
