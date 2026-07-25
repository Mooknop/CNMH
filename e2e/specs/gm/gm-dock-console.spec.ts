/**
 * GM console + enemy vitals on the Command Dock (#1537 S1–S3, PRs #1548/#1549/
 * #1550) — everything `gm-command-dock.spec.ts` deliberately leaves alone. That
 * spec asserts turn-follow, the reaction rail, the read-only foe kit and the
 * pin; this one drives the CONTROLS the same page grew afterwards:
 *
 *   • DockGmConsole (#1548) — GmSaveRequest pushes `cnmh_saveprompt_<charId>`
 *     at PCs; RequestedSaves resolves an enemy save and writes the degree into
 *     the encounter combat log.
 *   • The enemy pane's condition editor (#1549) — GM-applied conditions are
 *     app truth on `cnmh_enemyfx_global`, and the dock's own order-strip badge
 *     follows them (EnemyConditionBadge itself is the PLAYER-surface renderer
 *     of the same store — InitiativeStrip only; the dock renders the identical
 *     chip inline in DockOrderStrip).
 *   • The enemy vitals controls (#1550) — quick damage/heal over
 *     `cnmh_dmgapply_global`, the persistent-damage clear popover, and the
 *     ad-hoc save over `cnmh_saveroll_global` / `cnmh_savedone_global`.
 *
 * The relay is mocked (mockSession) so it can play the two peers a bridgeless
 * E2E session never has: the Foundry module (which answers a save roll and
 * writes the foe's new HP back onto the encounter) and the player client
 * (which would receive the save prompt). Enemy HP is Foundry-authoritative by
 * design — the app only ever RELAYS damage — so "quick damage moves foe HP" is
 * asserted as the relay the app sends plus the write-back the bridge answers
 * with, which is the whole of the app's side of that loop.
 *
 * Degrees are pinned with DC extremes (DC 1 + nat 20, DC 60 + nat 1) rather
 * than derived from a seeded stat block, so the arithmetic can't drift.
 *
 * Hydration gates, as everywhere else on the dock: "End turn" is the
 * encounter-only element on a PC turn, the enemy pane itself on an enemy turn.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { encounterState, pcEntry, enemyEntry, readyTurnState } from '../../helpers/encounter';

const FIGHTER_ID = 'e2e-fighter';
const FIGHTER_NAME = 'E2E Fighter';
const CLERIC_ID = 'e2e-cleric';
const CLERIC_NAME = 'E2E Cleric';

const CHARACTERS = [
  { id: FIGHTER_ID, name: FIGHTER_NAME, level: 5 },
  { id: CLERIC_ID, name: CLERIC_NAME, level: 5 },
];

// The acting foe, in the bridge's enriched order-entry shape (#1531) so the
// pane has vitals and defenses to render.
const ghoul = (hpCurrent = 9) => ({
  ...enemyEntry('E2E Ghoul', 10),
  foundryActorId: 'a-e2e-ghoul',
  creatureKey: 'e2e-ghoul',
  defenses: {
    ac: 16,
    saves: { fortitude: 6, reflex: 8, will: 4 },
    immunities: [],
    resistances: [],
    weaknesses: [],
  },
  bestiary: {
    img: null,
    level: 1,
    rarity: 'common',
    traits: ['medium', 'undead'],
    perception: 7,
    speed: 30,
    hp: { current: hpCurrent, max: 20 },
    description: '',
    creatureKey: 'e2e-ghoul',
  },
});

const GHOUL_ENTRY_ID = ghoul().entryId;
const ZOMBIE = enemyEntry('E2E Zombie', 8);

// ── Local dock-setup helpers ─────────────────────────────────────────────────
// Deliberately local to this spec: two sibling GM specs are in flight against
// the shared e2e/helpers this run, so nothing here touches them. Both are
// factor-out candidates for e2e/helpers/encounter.ts once the dust settles.

// The fighter is acting (index 0); the cleric and two foes sit behind them.
// `turnToken` matches round:index so TurnTrackerPanel's turn-begin sweep sees
// a turn already in progress and leaves the seeded turnstate alone.
const pcTurnSeed = (extra: Record<string, unknown> = {}) => ({
  cnmh_encounter_global: {
    ...encounterState({
      phase: 'in-progress',
      round: 2,
      currentTurnIndex: 0,
      order: [
        pcEntry(FIGHTER_ID, FIGHTER_NAME, 20),
        pcEntry(CLERIC_ID, CLERIC_NAME, 15),
        ghoul(),
        ZOMBIE,
      ],
    }),
    ...extra,
  },
  [`cnmh_turnstate_${FIGHTER_ID}`]: readyTurnState('2:0'),
  [`cnmh_turnstate_${CLERIC_ID}`]: readyTurnState('2:0'),
});

// The ghoul is acting (index 2) — the enemy pane, with its condition editor
// and (Foundry-gated, and mockSession reports Foundry present) vitals controls.
const enemyTurnEncounter = (hpCurrent = 9) =>
  encounterState({
    phase: 'in-progress',
    round: 2,
    currentTurnIndex: 2,
    order: [
      pcEntry(FIGHTER_ID, FIGHTER_NAME, 20),
      pcEntry(CLERIC_ID, CLERIC_NAME, 15),
      ghoul(hpCurrent),
    ],
  });

const gotoPcTurn = async (page: import('@playwright/test').Page) => {
  await page.goto('/gm/dock');
  await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible({ timeout: 15_000 });
};

const gotoEnemyTurn = async (page: import('@playwright/test').Page) => {
  await page.goto('/gm/dock');
  await expect(page.getByTestId('dock-enemy-pane')).toBeVisible({ timeout: 15_000 });
};

// One pending save request in the shape makeSaveRequest stamps (encounterUtils).
const saveRequest = (id: string, dc: number, target: { entryId: string; name: string }) => ({
  id,
  ts: Date.now(),
  status: 'pending',
  casterId: FIGHTER_ID,
  casterName: FIGHTER_NAME,
  abilityName: 'E2E Fireball',
  save: 'reflex',
  dc,
  basic: true,
  targets: [{ entryId: target.entryId, name: target.name, saveMod: 0 }],
});

test.describe('GM dock console', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: CHARACTERS });
  });

  test('Request Save pushes the player save prompt to every PC in the order', async ({ page }) => {
    const session = await mockSession(page, { seed: pcTurnSeed() });
    await gotoPcTurn(page);

    const gmConsole = page.getByRole('complementary', { name: 'GM console' });
    await expect(gmConsole.getByRole('heading', { name: 'Request Save' })).toBeVisible();

    await gmConsole.getByLabel('save type').selectOption('reflex');
    await gmConsole.getByLabel('save DC').fill('22');
    await gmConsole.getByLabel('effect name').fill('E2E Fireball');
    await gmConsole.getByLabel('basic save').check();
    // Target defaults to "All PCs" — both roster PCs should receive a prompt.
    await gmConsole.getByRole('button', { name: 'Request save' }).click();

    const matches = (v: any) =>
      v?.save === 'reflex' && v?.dc === 22 && v?.effectName === 'E2E Fireball'
      && v?.basic === true && typeof v?.reqId === 'string';
    await session.expectSent(`cnmh_saveprompt_${FIGHTER_ID}`, matches);
    await session.expectSent(`cnmh_saveprompt_${CLERIC_ID}`, matches);
  });

  test('Request Save aimed at one PC leaves the other alone', async ({ page }) => {
    const session = await mockSession(page, { seed: pcTurnSeed() });
    await gotoPcTurn(page);

    const gmConsole = page.getByRole('complementary', { name: 'GM console' });
    await gmConsole.getByLabel('save DC').fill('18');
    await gmConsole.getByLabel('save target').selectOption(CLERIC_ID);
    await gmConsole.getByRole('button', { name: 'Request save' }).click();

    // Anchor the absence assertion (#1592): await the prompt that DOES get
    // sent first, so "the fighter got nothing" is read after the send loop
    // has demonstrably run rather than racing it.
    await session.expectSent(`cnmh_saveprompt_${CLERIC_ID}`, (v: any) => v?.dc === 18);
    expect(session.sent.some((m) => m.stateType === 'saveprompt' && m.characterId === FIGHTER_ID)).toBe(false);
  });

  test('resolving a requested save logs the degree — DC extremes pin both ends', async ({ page }) => {
    const session = await mockSession(page, {
      seed: pcTurnSeed({
        saveRequests: [
          // DC 1 + a nat 20 → critical success no matter the modifier.
          saveRequest('savereq-e2e-crit-success', 1, { entryId: GHOUL_ENTRY_ID, name: 'E2E Ghoul' }),
          // DC 60 + a nat 1 → critical failure, likewise.
          saveRequest('savereq-e2e-crit-failure', 60, { entryId: ZOMBIE.entryId, name: 'E2E Zombie' }),
        ],
      }),
    });
    await gotoPcTurn(page);

    const gmConsole = page.getByRole('complementary', { name: 'GM console' });
    await expect(gmConsole.getByRole('heading', { name: 'Requested Saves' })).toBeVisible();
    // Pending work shows on the console toggle badge (2 requests, 0 payloads).
    await expect(page.getByRole('button', { name: 'GM console (2)' })).toBeVisible();

    // Typing the d20 previews the degree inline before anything is committed.
    await gmConsole.getByLabel('E2E Ghoul d20').fill('20');
    await expect(gmConsole.locator('.trr-result-degree')).toContainText('Critical Success');

    // `saveLabel` comes from DEFENSE_LABELS, which speaks in DCs ("Reflex DC")
    // because it is shared with the defense pickers — hence the doubled "DC".
    const CRIT_SUCCESS_LINE =
      'E2E Ghoul rolls Reflex DC vs DC 1 (E2E Fireball): 20 → Critical Success';
    const CRIT_FAILURE_LINE =
      'E2E Zombie rolls Reflex DC vs DC 60 (E2E Fireball): 1 → Critical Failure';
    const combatLog = page.getByRole('region', { name: 'Combat log' });

    await gmConsole.getByRole('button', { name: 'Log Results' }).first().click();
    await session.expectSent(
      'cnmh_encounter_global',
      (v: any) => (v?.log || []).some(
        (l: any) => typeof l?.text === 'string' && l.text.includes(CRIT_SUCCESS_LINE),
      ),
    );
    await expect(combatLog).toContainText(CRIT_SUCCESS_LINE);
    // The resolved request leaves the panel; the other one stays.
    await expect(gmConsole.getByLabel('E2E Ghoul d20')).toBeHidden();

    await gmConsole.getByLabel('E2E Zombie d20').fill('1');
    await expect(gmConsole.locator('.trr-result-degree')).toContainText('Critical Failure');
    await gmConsole.getByRole('button', { name: 'Log Results' }).click();
    await session.expectSent(
      'cnmh_encounter_global',
      (v: any) => (v?.log || []).some(
        (l: any) => typeof l?.text === 'string' && l.text.includes(CRIT_FAILURE_LINE),
      ),
    );
    await expect(combatLog).toContainText(CRIT_FAILURE_LINE);

    // Both resolved → the panel self-hides and the badge clears.
    await expect(gmConsole.getByRole('heading', { name: 'Requested Saves' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'GM console', exact: true })).toBeVisible();
  });

  test('condition editor: a valued condition lands on enemyfx, chips on the pane and the order strip, and clears again', async ({ page }) => {
    const session = await mockSession(page, {
      seed: { cnmh_encounter_global: enemyTurnEncounter() },
    });
    await gotoEnemyTurn(page);

    const pane = page.getByTestId('dock-enemy-pane');
    await pane.getByLabel('Add condition').selectOption('frightened');
    // The value input only exists for valued conditions — its appearance is
    // itself the assertion that the catalog lookup fired.
    const valueInput = pane.getByLabel('Condition value');
    await expect(valueInput).toBeVisible();
    await valueInput.fill('2');
    await pane.getByRole('button', { name: 'Apply' }).click();

    // App truth: cnmh_enemyfx_global, keyed by encounter entryId (NOT
    // cnmh_conditions_<id> — the bridge full-replaces that key, see
    // utils/persistentDamage.js for the same reasoning).
    await session.expectSent(
      'cnmh_enemyfx_global',
      (v: any) => v?.[GHOUL_ENTRY_ID]?.conditions?.some(
        (c: any) => c.id === 'frightened' && c.value === 2 && c.source === 'GM (dock)',
      ),
    );

    // Pane chip (removable — app-applied, not Foundry truth) and the dock's
    // order-strip badge, which is DockOrderStrip's copy of EnemyConditionBadge.
    const removeChip = pane.getByRole('button', { name: 'Remove Frightened 2' });
    await expect(removeChip).toBeVisible();
    const strip = page.getByRole('group', { name: 'E2E Ghoul: 1 applied conditions' });
    await expect(strip).toContainText('Frightened 2');

    await removeChip.click();
    await session.expectSent(
      'cnmh_enemyfx_global',
      (v: any) => (v?.[GHOUL_ENTRY_ID]?.conditions || []).length === 0,
    );
    await expect(removeChip).toBeHidden();
    await expect(strip).toBeHidden();
  });

  test('quick damage and heal relay typed amounts, and the bridge write-back moves the HP dial', async ({ page }) => {
    const session = await mockSession(page, {
      seed: { cnmh_encounter_global: enemyTurnEncounter(9) },
    });
    await gotoEnemyTurn(page);

    const pane = page.getByTestId('dock-enemy-pane');
    await expect(pane.getByTestId('dock-enemy-hp')).toContainText('9/20');

    const vitals = pane.getByTestId('dock-enemy-gmctl');
    await vitals.getByLabel('Quick damage amount').fill('7');
    await vitals.getByLabel('Quick damage type').selectOption('fire');
    await vitals.getByRole('button', { name: 'Damage' }).click();

    // Typed and RAW — PF2e nets the foe's IWR on its side, so the app never
    // pre-subtracts (utils/damageRelay.js).
    await session.expectSent(
      'cnmh_dmgapply_global',
      (v: any) => v?.sourceName === 'GM damage (dock)'
        && v?.hits?.[0]?.entryId === GHOUL_ENTRY_ID
        && v.hits[0].amount === 7
        && v.hits[0].type === 'fire',
    );

    // Foundry owns enemy HP: the dial only moves once the bridge pushes the
    // damaged actor back onto the encounter entry.
    session.push('cnmh_encounter_global', enemyTurnEncounter(2));
    await expect(pane.getByTestId('dock-enemy-hp')).toContainText('2/20');

    // Heal rides the same rail as a NEGATIVE untyped amount (healing has no
    // IWR, so untyped is the correct wire shape).
    await vitals.getByLabel('Quick damage amount').fill('7');
    await vitals.getByRole('button', { name: 'Heal' }).click();
    await session.expectSent(
      'cnmh_dmgapply_global',
      (v: any) => v?.sourceName === 'GM healing (dock)'
        && v?.hits?.[0]?.entryId === GHOUL_ENTRY_ID
        && v.hits[0].amount === -7
        && v.hits[0].type === '',
    );

    session.push('cnmh_encounter_global', enemyTurnEncounter(9));
    await expect(pane.getByTestId('dock-enemy-hp')).toContainText('9/20');
  });

  test('the persistent-damage clear popover on the enemy pane drops the instance', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: enemyTurnEncounter(),
        cnmh_persistent_global: {
          [GHOUL_ENTRY_ID]: [{ id: 'pd-e2e-1', dice: '1d6', type: 'fire', sourceName: 'E2E Fireball' }],
        },
      },
    });
    await gotoEnemyTurn(page);

    // Scope to the pane: DockOrderStrip renders its own PersistentChip for the
    // same entry, so an unscoped locator would be ambiguous.
    const pane = page.getByTestId('dock-enemy-pane');
    const chip = pane.getByRole('button', { name: 'E2E Ghoul: 1d6 persistent fire' });
    await expect(chip).toBeVisible();
    await chip.click();

    const popover = pane.getByRole('dialog', { name: 'Persistent damage on E2E Ghoul' });
    await expect(popover).toContainText('E2E Fireball');
    // The popover overlays neighbouring chips, which win the hit-test — the
    // player damage spec fights the same z-order.
    await popover.getByRole('button', { name: 'Flat check passed' }).dispatchEvent('click');

    await session.expectSent('cnmh_persistent_global', (v: any) => !(v?.[GHOUL_ENTRY_ID]?.length));
    await expect(chip).toBeHidden();
  });

  test('ad-hoc foe save: no authored prompt, the bridge answers, the degree reads out', async ({ page }) => {
    const session = await mockSession(page, {
      seed: { cnmh_encounter_global: enemyTurnEncounter() },
    });
    await gotoEnemyTurn(page);

    const vitals = page.getByTestId('dock-enemy-pane').getByTestId('dock-enemy-gmctl');
    // Exact: "Foe save" would also match the "Foe save DC" input.
    await vitals.getByLabel('Foe save', { exact: true }).selectOption('fortitude');
    await vitals.getByLabel('Foe save DC').fill('60');
    await vitals.getByRole('button', { name: 'Roll save' }).click();

    // Straight onto the saveroll rail — nothing was parked on encounter
    // .saveRequests, which is the point of the ad-hoc roller.
    const req = await session.expectSent(
      'cnmh_saveroll_global',
      (v: any) => v?.save === 'fortitude' && v?.dc === 60
        && v?.targets?.[0]?.entryId === GHOUL_ENTRY_ID,
    );
    expect(String(req.id)).toContain('docksave-');

    // The bridge answers with the rolled d20 + live total; the degree is
    // recomputed app-side (computeSaveDegree is the one source of truth).
    // DC 60 with a nat 1 is a critical failure whatever the stat block says.
    session.push('cnmh_savedone_global', {
      id: req.id,
      ts: Date.now(),
      results: [{ entryId: GHOUL_ENTRY_ID, name: 'E2E Ghoul', d20: 1, total: 1 }],
    });

    const readout = page.getByTestId('dock-enemy-save-result');
    await expect(readout).toContainText('Fort save');
    await expect(readout).toContainText('1 vs DC 60');
    await expect(readout).toContainText('Critical Failure');
  });
});
