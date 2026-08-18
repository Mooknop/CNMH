/**
 * Incoming-damage IWR application (#947) — resistance (#900), weakness (#918),
 * and immunity (#919) applied where damage actually lands on a PC: the GM's
 * AdjustHpModal (GM Dashboard → Adjust HP), plus the persistent-damage surfaces
 * (PersistentChip annotation + the end-of-turn reminder, #918 S2) and the
 * variant-aware worn resistance of the Energy Robe (#911/#922).
 *
 * The OUTGOING (attacker-side) IWR math against enemies is
 * specs/player/attacker-damage.spec.ts (#1049); this spec owns the incoming
 * side only. The engine readers (resistanceFor/weaknessFor/isImmuneTo,
 * wornResistanceFor) are unit-tested; here we assert the wired flow: seeded
 * effect-catalog modifiers + worn gear → the HP delta written to
 * cnmh_hp_<charId> and the IWR annotation appended to the encounter log
 * (cnmh_encounter_global), via mockSession.expectSent.
 *
 * Note cnmh_hp writes are per-character keys: the mock session's default
 * PRESENCE (foundry: true) keeps the offline write-gate (#553) open.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { encounterState, pcEntry, enemyEntry } from '../../helpers/encounter';

const CHAR_ID = 'e2e-sorcerer';
const CHAR_NAME = 'E2E Sorcerer';
const HP_KEY = `cnmh_hp_${CHAR_ID}`;
const EFFECTS_KEY = `cnmh_effects_${CHAR_ID}`;

const ROBED_FIRE_ID = 'e2e-robed-fire';
const ROBED_COLD_ID = 'e2e-robed-cold';

const fullHp = () => ({ current: 50, max: 50, temp: 0, dying: 0, wounded: 0, doomed: 0 });

// Effect-catalog docs carrying the special non-bonus modifiers the defense
// readers consume: `{ stat: 'resistance'|'weakness', vs, amount }`, and
// `{ stat: 'immunity', vs }` (no amount — immunity is absolute).
const IWR_EFFECTS = [
  {
    id: 'e2e-fire-resist',
    name: 'E2E Fire Ward',
    description: 'Resistance 5 to fire.',
    modifiers: [{ stat: 'resistance', vs: 'fire', amount: 5 }],
  },
  {
    id: 'e2e-fire-weak',
    name: 'E2E Fire Bane',
    description: 'Weakness 3 to fire.',
    modifiers: [{ stat: 'weakness', vs: 'fire', amount: 3 }],
  },
  {
    id: 'e2e-cold-weak',
    name: 'E2E Cold Bane',
    description: 'Weakness 3 to cold.',
    modifiers: [{ stat: 'weakness', vs: 'cold', amount: 3 }],
  },
  {
    id: 'e2e-fire-immune',
    name: 'E2E Fire Immunity',
    description: 'Immune to fire.',
    modifiers: [{ stat: 'immunity', vs: 'fire' }],
  },
];

// The item catalog is NOT seeded, so the app falls back to the bundled catalog
// (ContentContext takes the DO list INSTEAD of the bundle only when non-empty)
// — which is where the real `energy-robe` and its per-energy variants live.
// The inventory entry's `level` selects the variant (7 → Fire, 8 → Cold), whose
// `overrides.resistance` is merged onto the resolved item (#911).
const CHARACTERS = [
  { id: CHAR_ID, name: CHAR_NAME, level: 5 },
  {
    id: ROBED_FIRE_ID,
    name: 'E2E Robed Fire',
    level: 7,
    inventory: [{ ref: 'energy-robe', level: 7, quantity: 1, uid: 'robe-f' }],
  },
  {
    id: ROBED_COLD_ID,
    name: 'E2E Robed Cold',
    level: 8,
    inventory: [{ ref: 'energy-robe', level: 8, quantity: 1, uid: 'robe-c' }],
  },
];

// Open GM Dashboard → Adjust HP and put the modal in damage mode for `charId`.
async function openDamageMode(page: Page, charId: string) {
  await page.getByRole('button', { name: 'Adjust character HP' }).click();
  await page.getByLabel('select character').selectOption(charId);
  await page.getByRole('button', { name: 'Damage', exact: true }).click();
}

// Apply typed damage through the open modal.
async function applyTyped(page: Page, type: string, amount: number) {
  await page.getByLabel('damage type').selectOption(type);
  await page.getByLabel('hp amount').fill(String(amount));
  await page.getByRole('button', { name: 'Apply damage' }).click();
}

test.describe('Incoming damage IWR (AdjustHpModal)', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: CHARACTERS, effect: IWR_EFFECTS });
  });

  test('resistance reduces typed damage and floors at 0', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        [HP_KEY]: fullHp(),
        [EFFECTS_KEY]: [{ id: 'fx-r', effectId: 'e2e-fire-resist' }],
      },
    });
    await page.goto('/gm');
    await openDamageMode(page, CHAR_ID);

    // The preview beside the type picker announces the modifier before apply.
    await page.getByLabel('damage type').selectOption('fire');
    await expect(page.getByLabel('damage modifier preview')).toHaveText('resistance 5');

    // 10 fire − resistance 5 → 5 HP lost.
    await page.getByLabel('hp amount').fill('10');
    await page.getByRole('button', { name: 'Apply damage' }).click();
    await session.expectSent(HP_KEY, (v) => v?.current === 45 && v?.damageType === 'fire');
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log)
        && v.log.some((e: any) => String(e.text).includes(`${CHAR_NAME}: fire damage 10 → 5 (resistance 5)`)),
    );

    // 3 fire − resistance 5 floors at 0 — no HP movement below 45.
    await applyTyped(page, 'fire', 3);
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log)
        && v.log.some((e: any) => String(e.text).includes(`${CHAR_NAME}: fire damage 3 → 0 (resistance 5)`)),
    );
    const hpWrites = session.sent.filter((m) => m.stateType === 'hp' && m.characterId === CHAR_ID);
    expect(hpWrites.length).toBeGreaterThanOrEqual(2);
    for (const w of hpWrites) expect((w.value as any).current).toBe(45);
  });

  test('weakness adds to the loss; with resistance it adds first, then reduces', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        [HP_KEY]: fullHp(),
        [EFFECTS_KEY]: [
          { id: 'fx-cw', effectId: 'e2e-cold-weak' },
          { id: 'fx-fw', effectId: 'e2e-fire-weak' },
          { id: 'fx-fr', effectId: 'e2e-fire-resist' },
        ],
      },
    });
    await page.goto('/gm');
    await openDamageMode(page, CHAR_ID);

    // 4 cold + weakness 3 → 7 HP lost.
    await applyTyped(page, 'cold', 4);
    await session.expectSent(HP_KEY, (v) => v?.current === 43 && v?.damageType === 'cold');
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log)
        && v.log.some((e: any) => String(e.text).includes(`${CHAR_NAME}: cold damage 4 → 7 (weakness 3)`)),
    );

    // PF2e sequencing on one type: 10 fire + weakness 3 − resistance 5 → 8 lost.
    await applyTyped(page, 'fire', 10);
    await session.expectSent(HP_KEY, (v) => v?.current === 35 && v?.damageType === 'fire');
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log)
        && v.log.some((e: any) =>
          String(e.text).includes(`${CHAR_NAME}: fire damage 10 → 8 (weakness 3, resistance 5)`)),
    );
  });

  test('immunity zeroes typed damage and supersedes weakness', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        [HP_KEY]: fullHp(),
        [EFFECTS_KEY]: [
          { id: 'fx-im', effectId: 'e2e-fire-immune' },
          { id: 'fx-fw', effectId: 'e2e-fire-weak' },
        ],
      },
    });
    await page.goto('/gm');
    await openDamageMode(page, CHAR_ID);

    await page.getByLabel('damage type').selectOption('fire');
    // Immunity takes precedence in the preview — no weakness note.
    await expect(page.getByLabel('damage modifier preview')).toHaveText('immune');

    await page.getByLabel('hp amount').fill('10');
    await page.getByRole('button', { name: 'Apply damage' }).click();
    await session.expectSent(HP_KEY, (v) => v?.current === 50 && v?.damageType === 'fire');
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log)
        && v.log.some((e: any) => String(e.text).includes(`${CHAR_NAME}: fire damage 10 → 0 (immune)`)),
    );
  });

  test('a worn fire Energy Robe grants fire resistance 5 — and nothing vs cold', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        [`cnmh_hp_${ROBED_FIRE_ID}`]: fullHp(),
        // The robe carries the Invested trait: worn gear only contributes once
        // invested (useWornGear gate), so seed the attunement overlay.
        [`cnmh_invested_${ROBED_FIRE_ID}`]: { 'robe-f': true },
      },
    });
    await page.goto('/gm');
    await openDamageMode(page, ROBED_FIRE_ID);

    await page.getByLabel('damage type').selectOption('fire');
    await expect(page.getByLabel('damage modifier preview')).toHaveText('resistance 5');

    // 8 fire − resistance 5 → 3 lost.
    await page.getByLabel('hp amount').fill('8');
    await page.getByRole('button', { name: 'Apply damage' }).click();
    await session.expectSent(`cnmh_hp_${ROBED_FIRE_ID}`, (v) => v?.current === 47);
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log)
        && v.log.some((e: any) => String(e.text).includes('E2E Robed Fire: fire damage 8 → 3 (resistance 5)')),
    );

    // The fire variant does nothing against cold: full 8 lost, no IWR log line.
    await applyTyped(page, 'cold', 8);
    await session.expectSent(`cnmh_hp_${ROBED_FIRE_ID}`, (v) => v?.current === 39);
    expect(session.sent.some(
      (m) => m.stateType === 'encounter'
        && Array.isArray((m.value as any)?.log)
        && (m.value as any).log.some((e: any) => String(e.text).includes('cold damage')),
    )).toBe(false);
  });

  test('the cold variant of the same base item grants cold resistance instead (#911)', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        [`cnmh_hp_${ROBED_COLD_ID}`]: fullHp(),
        [`cnmh_invested_${ROBED_COLD_ID}`]: { 'robe-c': true },
      },
    });
    await page.goto('/gm');
    await openDamageMode(page, ROBED_COLD_ID);

    await page.getByLabel('damage type').selectOption('cold');
    await expect(page.getByLabel('damage modifier preview')).toHaveText('resistance 5');

    // 8 cold − resistance 5 → 3 lost.
    await page.getByLabel('hp amount').fill('8');
    await page.getByRole('button', { name: 'Apply damage' }).click();
    await session.expectSent(`cnmh_hp_${ROBED_COLD_ID}`, (v) => v?.current === 47);

    // And fire goes straight through the cold robe.
    await applyTyped(page, 'fire', 8);
    await session.expectSent(`cnmh_hp_${ROBED_COLD_ID}`, (v) => v?.current === 39);
  });
});

test.describe('Persistent-damage tick IWR (#918 S2)', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: CHARACTERS, effect: IWR_EFFECTS });
  });

  test('weakness annotates the chip and the end-of-turn reminder', async ({ page }) => {
    const pc = pcEntry(CHAR_ID, CHAR_NAME, 20);
    const goblin = enemyEntry('E2E Goblin', 15);
    const order = [pc, goblin];
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: encounterState({
          phase: 'in-progress',
          round: 1,
          currentTurnIndex: 0,
          order,
        }),
        cnmh_persistent_global: { [pc.entryId]: [{ id: 'p1', dice: '1d6', type: 'fire' }] },
        // Weakness 3 vs fire — vsMatches resolves the tick's `persistent-fire`
        // descriptor against the plain `fire` token.
        [EFFECTS_KEY]: [{ id: 'fx-fw', effectId: 'e2e-fire-weak' }],
      },
    });
    await page.goto('/gm');

    // The initiative-order chip states the weakness-annotated tick.
    const chip = page.getByRole('button', { name: `${CHAR_NAME}: 1d6 persistent fire + weakness 3` });
    await expect(chip).toBeVisible();

    // The popover's clear buttons render only for the GM — waiting for them
    // gates on useGmAuth having resolved, so the GM-only turn-end reminder
    // writer below is armed before we advance the turn.
    await chip.click();
    await expect(
      page
        .getByRole('dialog', { name: `Persistent damage on ${CHAR_NAME}` })
        .getByRole('button', { name: 'Flat check passed' }),
    ).toBeVisible();

    // Play the bridge: advance to the goblin's turn. The PC's turn just ended,
    // so the reminder watcher appends the weakness-annotated tick line.
    session.push('cnmh_encounter_global', encounterState({
      phase: 'in-progress',
      round: 1,
      currentTurnIndex: 1,
      order,
    }));
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log)
        && v.log.some((e: any) => String(e.text).includes(
          `${CHAR_NAME}: 1d6 persistent fire, weakness 3 (add) — DC 15 flat check to end`,
        )),
    );
  });
});
