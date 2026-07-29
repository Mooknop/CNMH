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
import { foeEntry, gotoFoeKitDock, gotoPcTurnDock, pcTurnSeed } from '../../helpers/dock';

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

// Fighter acting at index 0; cleric + an enemy behind them. The cleric's
// reaction must be armed (defaultTurnState has it unavailable until a first
// turn); pcTurnSeed derives the matching turnToken from the round, so the
// #1131 turn-begin sweep can't wipe the armed state mid-test.
const sessionSeed = () =>
  pcTurnSeed({
    round: 2,
    armedPcIds: [CLERIC_ID],
    order: [
      pcEntry(FIGHTER_ID, FIGHTER_NAME, 20),
      pcEntry(CLERIC_ID, CLERIC_NAME, 15),
      enemyEntry('E2E Ghoul', 10),
    ],
  });

// The ghoul enriched to the bridge's enemy order-entry shape (#1531): the
// defensive block renders from the encounter entry, the offensive kit from
// the persisted foekit key. foeEntry's defaults ARE this ghoul; only its
// identity and current HP are spelled out here.
const GHOUL = foeEntry({
  name: 'E2E Ghoul',
  initiative: 10,
  actorId: 'a-e2e-ghoul',
  creatureKey: 'e2e-ghoul',
  hpCurrent: 9,
});

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
    await gotoPcTurnDock(page);

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
    await gotoPcTurnDock(page);

    await page.getByRole('button', { name: 'Prompt E2E Riposte' }).click();

    await session.expectSent(
      `cnmh_reactprompt_${CLERIC_ID}`,
      (v: any) => v?.eventId === 'melee-attack' && v?.round === 2 && typeof v?.reqId === 'string',
    );
  });

  test('an enemy turn renders the foe pane from the persisted kit, read-only, with every PC in the rail', async ({ page }) => {
    const session = await mockSession(page, { seed: ghoulTurnSeed() });

    // Hydration gate: the enemy pane is the encounter-only element on an
    // enemy turn (there is no End turn button to wait for); this test drives
    // the kit's tab strip, so the helper's second gate (Strikes tab) applies.
    const pane = await gotoFoeKitDock(page);
    await expect(page.getByRole('region', { name: 'Enemy turn: E2E Ghoul' })).toBeVisible();

    // Vitals + defenses straight off the encounter entry — unredacted.
    await expect(pane.getByTestId('dock-enemy-hp')).toContainText('9/20');
    await expect(pane.getByTestId('dock-enemy-defenses')).toContainText('16');

    // The kit rides the S3 tab strip (#1556) — Strikes is the default tab;
    // abilities and skills live behind their tabs. MAP ladder stays TEXT
    // (no Foundry presence in e2e, so the strike/cast rails never grow
    // buttons).
    await expect(pane).toContainText('Jaws');
    await expect(pane).toContainText('+9 / +4 / -1');
    await expect(pane).toContainText('1d8+4 piercing');
    await expect(pane.getByRole('button', { name: /Strike: Jaws/ })).not.toBeVisible();
    await expect(pane.getByTestId('dock-enemy-waiting')).not.toBeVisible();

    await pane.getByRole('tab', { name: /Abilities/ }).click();
    await expect(pane).toContainText('E2E Paralysis');
    await pane.getByRole('tab', { name: /Skills/ }).click();
    await expect(pane).toContainText('Athletics +7');

    // Enemy turn = no staged PC, so BOTH PCs sit in the reaction rail.
    const rail = page.getByRole('complementary', { name: 'Party reactions' });
    await expect(rail.getByRole('region', { name: `${FIGHTER_NAME} reactions` })).toBeVisible();
    await expect(rail.getByRole('region', { name: `${CLERIC_NAME} reactions` })).toBeVisible();

    // #1537 S1: End enemy turn advances the encounter without leaving the dock
    // (no foundryCombatId in the seed → the app-side advance: ghoul was last,
    // so the pointer wraps to the fighter and the round ticks).
    await page.getByRole('button', { name: "End E2E Ghoul's turn" }).click();
    await session.expectSent(
      'cnmh_encounter_global',
      (v: any) => v?.currentTurnIndex === 0 && v?.round === 3,
    );
    await expect(page.getByRole('region', { name: `Acting as ${FIGHTER_NAME}` })).toBeVisible();
  });

  test('pin stages an off-turn PC and Follow turn returns to the pointer', async ({ page }) => {
    await mockSession(page, { seed: sessionSeed() });
    await gotoPcTurnDock(page);

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
