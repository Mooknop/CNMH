/**
 * GM Command Dock (#1525): the dock mounts the REAL player encounter controls
 * for the PC whose turn it is (S2), lists every other PC's reactions with
 * trigger text in the rail (S3), fires reaction prompts from a rail row and
 * pins any PC onto the stage (S4). Enemy turns render the DockEnemyPane
 * (#1531) fed by the persisted cnmh_foekit_global — asserted read-only here:
 * the strike/cast rails gate on live Foundry presence, which a bridgeless e2e
 * session never has (same deliberate call as the dice-tower rails, #1490).
 *
 * The relay is mocked (mockSession) so acting-on-behalf is asserted the same
 * way player specs assert their own writes: the dock's End turn must produce
 * the identical cnmh_encounter_global advance the player's client would send.
 * Hydration gate: the deck's "End turn" button is the encounter-only element
 * (same gate as the player lifecycle spec); enemy-turn tests gate on the
 * enemy pane itself instead — there is no End turn button on an enemy turn.
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
  {
    id: CLERIC_ID,
    name: CLERIC_NAME,
    level: 5,
    reactions: [
      {
        name: 'E2E Riposte',
        actions: 'Reaction',
        triggerType: 'attack-melee',
        trigger: 'A melee attack hits you',
      },
    ],
  },
];

// Fighter acting at index 0; cleric + an enemy behind them.
const dockEncounter = () =>
  encounterState({
    phase: 'in-progress',
    round: 2,
    currentTurnIndex: 0,
    order: [
      pcEntry(FIGHTER_ID, FIGHTER_NAME, 20),
      pcEntry(CLERIC_ID, CLERIC_NAME, 15),
      enemyEntry('E2E Ghoul', 10),
    ],
  });

const sessionSeed = () => ({
  cnmh_encounter_global: dockEncounter(),
  // The cleric's reaction must be armed (defaultTurnState has it unavailable
  // until a first turn).
  [`cnmh_turnstate_${CLERIC_ID}`]: readyTurnState(),
});

const gotoDock = async (page: import('@playwright/test').Page) => {
  await page.goto('/gm/dock');
  await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible({ timeout: 15_000 });
};

// The ghoul enriched to the bridge's enemy order-entry shape (#1531): the
// defensive block renders from the encounter entry, the offensive kit from
// the persisted foekit key.
const GHOUL = {
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
    hp: { current: 9, max: 20 },
    description: '',
    creatureKey: 'e2e-ghoul',
  },
};

const ghoulTurnSeed = () => ({
  cnmh_encounter_global: encounterState({
    phase: 'in-progress',
    round: 2,
    currentTurnIndex: 2,
    order: [
      pcEntry(FIGHTER_ID, FIGHTER_NAME, 20),
      pcEntry(CLERIC_ID, CLERIC_NAME, 15),
      GHOUL,
    ],
  }),
  [`cnmh_turnstate_${CLERIC_ID}`]: readyTurnState(),
  cnmh_foekit_global: {
    entryId: GHOUL.entryId,
    foundryActorId: 'a-e2e-ghoul',
    ts: 1,
    kit: {
      strikes: [{
        index: 0, slug: 'jaws', label: 'Jaws', attackModifier: 9,
        variantLabels: ['+9', '+4', '-1'], traits: ['agile'], ranged: false,
        damage: [{ formula: '1d8+4', type: 'piercing' }], attackEffects: ['grab'],
      }],
      spellcasting: [],
      abilities: [{
        id: 'ab1', name: 'E2E Paralysis', actionType: 'free', actions: null,
        category: 'offensive', traits: ['incapacitation'], description: 'Paralyze on a hit.',
      }],
      skills: [{ slug: 'athletics', mod: 7 }],
    },
  },
});

test.describe('GM Command Dock', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: CHARACTERS });
  });

  test('follows the turn, lists other PCs in the rail, and End turn advances the shared encounter', async ({ page }) => {
    const session = await mockSession(page, { seed: sessionSeed() });
    await gotoDock(page);

    // Acting pane = the active PC's real deck.
    await expect(page.getByRole('region', { name: `Acting as ${FIGHTER_NAME}` })).toBeVisible();

    // Rail: the cleric (with trigger text) but not the acting fighter.
    const rail = page.getByRole('complementary', { name: 'Party reactions' });
    await expect(rail.getByRole('region', { name: `${CLERIC_NAME} reactions` })).toBeVisible();
    await expect(rail).toContainText('E2E Riposte');
    await expect(rail).toContainText('A melee attack hits you');
    await expect(rail.getByRole('region', { name: `${FIGHTER_NAME} reactions` })).not.toBeVisible();

    // Acting on the player's behalf: End turn writes the same advance the
    // player's own client would.
    await page.getByRole('button', { name: 'End turn' }).click();
    await session.expectSent('cnmh_encounter_global', (v: any) => v?.currentTurnIndex === 1);

    // The dock hands off to the next PC; the fighter joins the rail.
    await expect(page.getByRole('region', { name: `Acting as ${CLERIC_NAME}` })).toBeVisible();
    await expect(rail.getByRole('region', { name: `${FIGHTER_NAME} reactions` })).toBeVisible();
  });

  test('Prompt on a rail reaction fires the matching trigger event at that PC', async ({ page }) => {
    const session = await mockSession(page, { seed: sessionSeed() });
    await gotoDock(page);

    await page.getByRole('button', { name: 'Prompt E2E Riposte' }).click();

    await session.expectSent(
      `cnmh_reactprompt_${CLERIC_ID}`,
      (v: any) => v?.eventId === 'melee-attack' && v?.round === 2 && typeof v?.reqId === 'string',
    );
  });

  test('an enemy turn renders the foe pane from the persisted kit, read-only, with every PC in the rail', async ({ page }) => {
    await mockSession(page, { seed: ghoulTurnSeed() });
    await page.goto('/gm/dock');

    // Hydration gate: the enemy pane is the encounter-only element on an
    // enemy turn (there is no End turn button to wait for).
    const pane = page.getByTestId('dock-enemy-pane');
    await expect(pane).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('region', { name: 'Enemy turn: E2E Ghoul' })).toBeVisible();

    // Vitals + defenses straight off the encounter entry — unredacted.
    await expect(pane.getByTestId('dock-enemy-hp')).toContainText('9/20');
    await expect(pane.getByTestId('dock-enemy-defenses')).toContainText('16');

    // The kit: strike with its MAP ladder as TEXT (no Foundry presence in e2e,
    // so the strike/cast rails never grow buttons), ability, skill.
    await expect(pane).toContainText('Jaws');
    await expect(pane).toContainText('+9 / +4 / -1');
    await expect(pane).toContainText('1d8+4 piercing');
    await expect(pane).toContainText('E2E Paralysis');
    await expect(pane).toContainText('Athletics +7');
    await expect(pane.getByRole('button', { name: /Strike: Jaws/ })).not.toBeVisible();
    await expect(pane.getByTestId('dock-enemy-waiting')).not.toBeVisible();

    // Enemy turn = no staged PC, so BOTH PCs sit in the reaction rail.
    const rail = page.getByRole('complementary', { name: 'Party reactions' });
    await expect(rail.getByRole('region', { name: `${FIGHTER_NAME} reactions` })).toBeVisible();
    await expect(rail.getByRole('region', { name: `${CLERIC_NAME} reactions` })).toBeVisible();
  });

  test('pin stages an off-turn PC and Follow turn returns to the pointer', async ({ page }) => {
    await mockSession(page, { seed: sessionSeed() });
    await gotoDock(page);

    const pins = page.getByRole('group', { name: 'Stage a character' });
    await pins.getByRole('button', { name: CLERIC_NAME }).click();

    // The cleric takes the stage off-turn (their deck renders its off-turn
    // view) and drops out of the rail, replaced by the fighter.
    await expect(page.getByRole('region', { name: `Acting as ${CLERIC_NAME}` })).toBeVisible();
    await expect(page.getByText('pinned')).toBeVisible();
    const rail = page.getByRole('complementary', { name: 'Party reactions' });
    await expect(rail.getByRole('region', { name: `${FIGHTER_NAME} reactions` })).toBeVisible();
    await expect(rail.getByRole('region', { name: `${CLERIC_NAME} reactions` })).not.toBeVisible();

    await pins.getByRole('button', { name: 'Follow turn' }).click();
    await expect(page.getByRole('region', { name: `Acting as ${FIGHTER_NAME}` })).toBeVisible();
  });
});
