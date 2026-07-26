/**
 * The back half of the dock-encounter-completion epic (#1537), which had zero
 * E2E before #1596: the order strip's inline actor-map assign (S5/#1551), the
 * menagerie — summons, linked minions, disposition-aware panes (S6/#1552), the
 * challenge tracker + free-form trigger console (S7/#1553), the RK-reveal side
 * effects (S9/#1555), and the #1556 broadcast-console restyle (#1567).
 *
 * Every surface here is GM-side and lives on /gm/dock, so the relay is mocked
 * (mockSession) exactly like the sibling dock specs: the bridge is the peer
 * that can't exist in an E2E run, and the assertions are the writes the app
 * owns — cnmh_actormap_global, cnmh_summons_global, cnmh_spawnminion_global,
 * cnmh_knowledge_global, cnmh_reactprompt_<charId>, cnmh_sessionlog_global.
 *
 * Hydration gate: never assert dock state before an encounter-only element is
 * on screen. On a PC turn that's the deck's "End turn" button; on an
 * enemy/ally turn there is none, so the gate is the enemy pane itself — both
 * live in helpers/dock.ts (#1612), with the reasoning.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { encounterState, pcEntry, enemyEntry } from '../../helpers/encounter';
import {
  foeEntry,
  gotoFoeKitDock,
  gotoNonPcDock,
  gotoPcTurnDock,
  pcTurnSeed,
} from '../../helpers/dock';

const FIGHTER_ID = 'e2e-fighter';
const FIGHTER_NAME = 'E2E Fighter';
const CLERIC_ID = 'e2e-cleric';
const CLERIC_NAME = 'E2E Cleric';
const ROGUE_ID = 'e2e-rogue';
const ROGUE_NAME = 'E2E Rogue';

const CHARACTERS = [
  { id: FIGHTER_ID, name: FIGHTER_NAME, level: 5, class: 'Fighter' },
  {
    id: CLERIC_ID,
    name: CLERIC_NAME,
    level: 5,
    class: 'Cleric',
    reactions: [
      {
        name: 'E2E Riposte',
        actions: 'Reaction',
        triggerType: 'attack-melee',
        trigger: 'A melee attack hits you',
      },
    ],
  },
  { id: ROGUE_ID, name: ROGUE_NAME, level: 5, class: 'Rogue' },
];

// Round 1 / index 0 with the fighter acting; `extraOrder` appends the extra
// combatants a given test needs behind the party. The shared builder derives
// the fighter's turnToken from `round` — which matters here more than most
// (#1131): a mismatched token makes TurnTrackerPanel treat the mount as the
// start of the PC's turn and sweep, zeroing exactly the minion granted-action
// pools a menagerie spec is asserting.
const fighterTurnSeed = (extraOrder: Array<Record<string, unknown>> = []) =>
  pcTurnSeed({
    armedPcIds: [FIGHTER_ID],
    order: [
      pcEntry(FIGHTER_ID, FIGHTER_NAME, 20),
      pcEntry(CLERIC_ID, CLERIC_NAME, 15),
      ...extraOrder,
    ],
  });

const orderStrip = (page: Page) => page.getByRole('group', { name: 'Stage a character' });
const menagerie = (page: Page) => page.getByTestId('dock-menagerie');

test.describe('Dock menagerie, actor map, and broadcast console', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: CHARACTERS });
  });

  // ── Actor-map assign (#1551) ────────────────────────────────────────────
  test('an undecided combatant assigns inline from the order strip, and the assigned PC drives the dock', async ({ page }) => {
    // A Foundry combatant the bridge couldn't auto-match: kind 'enemy' with a
    // foundryActorId and nothing in cnmh_actormap_global for it.
    const token = { ...enemyEntry('E2E Token 7', 12), foundryActorId: 'a-e2e-token-7' };
    const session = await mockSession(page, { seed: fighterTurnSeed([token]) });
    await gotoPcTurnDock(page);

    const row = page.getByTestId(`dock-order-${token.entryId}`);
    // Undecided ⇒ the select is shown unprompted; there is no reassign pencil yet.
    const assign = row.getByLabel(`assign-${token.entryId}`);
    await expect(assign).toBeVisible();
    await expect(row.getByRole('button', { name: `Reassign ${token.name}` })).toHaveCount(0);

    await assign.selectOption(ROGUE_ID);

    // The decision is a campaign-wide write the bridge and every client read.
    await session.expectSent(
      'cnmh_actormap_global',
      (v: any) => v?.['a-e2e-token-7'] === ROGUE_ID,
    );

    // Decided ⇒ the select collapses to the reassign pencil, so a wrong
    // auto-match stays fixable without leaving the dock.
    await expect(assign).toBeHidden();
    await expect(row.getByRole('button', { name: `Reassign ${token.name}` })).toBeVisible();

    // ...and the assignment is what attribution runs on: the row now resolves
    // to a PC, so staging it acts as the ROGUE even though the combatant is
    // still named after its Foundry token.
    await row.getByRole('button', { name: `Stage ${token.name}` }).click();
    await expect(page.getByRole('region', { name: `Acting as ${ROGUE_NAME}` })).toBeVisible();
  });

  test('"Not a PC" stores the null sentinel so the actor map never re-matches the slot', async ({ page }) => {
    const token = { ...enemyEntry('E2E Token 8', 11), foundryActorId: 'a-e2e-token-8' };
    const session = await mockSession(page, { seed: fighterTurnSeed([token]) });
    await gotoPcTurnDock(page);

    const row = page.getByTestId(`dock-order-${token.entryId}`);
    // '' is the "Not a PC" option; the strip translates it to an explicit null
    // (GmEncounter precedent) — undefined would read as "still undecided" and
    // ActorMapSync would try to match it again.
    await row.getByLabel(`assign-${token.entryId}`).selectOption('');

    const map = await session.expectSent(
      'cnmh_actormap_global',
      (v: any) => v && 'a-e2e-token-8' in v,
    );
    expect(map['a-e2e-token-8']).toBeNull();

    // Decided-as-not-a-PC still collapses to the pencil, and the row stays a
    // non-PC one (no Stage button).
    await expect(row.getByRole('button', { name: `Reassign ${token.name}` })).toBeVisible();
    await expect(row.getByRole('button', { name: `Stage ${token.name}` })).toHaveCount(0);
  });

  // ── Menagerie: summons (#1552) ──────────────────────────────────────────
  test('the menagerie summons a pool creature onto a sustain, and the order strip grows its row', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        ...fighterTurnSeed(),
        // The bridge's Foundry "Summons" folder mirror.
        cnmh_summonpool_global: [
          {
            key: 'e2e-wolf',
            name: 'E2E Dire Wolf',
            level: 3,
            hp: { max: 24 },
            defenses: { ac: 19 },
            traits: ['animal'],
            img: null,
          },
        ],
        // The summon must hang off a live sustain — the cleric has one.
        [`cnmh_sustains_${CLERIC_ID}`]: [
          { id: 'e2e-sustain-1', spellName: 'E2E Summon Animal', castRank: 3 },
        ],
      },
    });
    await gotoPcTurnDock(page);

    await menagerie(page).getByRole('button', { name: 'Add summon to encounter' }).click();
    const modal = page.getByRole('dialog', { name: 'Add summon' });
    await expect(modal).toBeVisible();

    await modal.getByLabel('summon caster').selectOption(CLERIC_ID);
    // The sustain select is a key-changing useSyncedState read
    // (useSustains(casterId || 'none')), so wait for the caster's ledger to
    // actually land before picking from it.
    await expect(modal.getByLabel('linked sustain')).toBeVisible();
    await modal.getByLabel('linked sustain').selectOption('e2e-sustain-1');
    await modal.getByLabel('summon creature').selectOption('e2e-wolf');

    // The summary confirms the pool entry resolved before we commit.
    await expect(modal.getByLabel('summon summary')).toContainText('HP 24');

    await modal.getByRole('button', { name: 'Add summon to encounter' }).click();

    // cnmh_summons_global is app-owned (the bridge full-replaces the encounter
    // order, so summons can't live there) — this write IS the summon.
    const summons = await session.expectSent(
      'cnmh_summons_global',
      (v: any) => Array.isArray(v) && v.length === 1,
    );
    expect(summons[0]).toMatchObject({
      kind: 'summon',
      name: 'E2E Dire Wolf',
      casterId: CLERIC_ID,
      sustainId: 'e2e-sustain-1',
    });

    // useEncounter's display view appends summons to the order, so the strip
    // shows it with the Summon kind tag, its HP, and a Dismiss control.
    const row = orderStrip(page).getByRole('listitem').filter({ hasText: 'E2E Dire Wolf' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Summon');
    await expect(row.getByLabel('E2E Dire Wolf hp')).toHaveText('24/24');

    await row.getByRole('button', { name: 'Dismiss E2E Dire Wolf' }).click();
    await session.expectSent('cnmh_summons_global', (v: any) => Array.isArray(v) && v.length === 0);
    await expect(row).toHaveCount(0);
  });

  // ── Menagerie: linked minions (#1552) ───────────────────────────────────
  test('a bridge-linked minion spawns onto the map from the menagerie', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        ...fighterTurnSeed(),
        // Read-only bridge map: which Foundry actor is whose companion/familiar.
        cnmh_minionactors_global: {
          [`${CLERIC_ID}-familiar`]: {
            foundryActorId: 'a-e2e-sparrow',
            name: 'E2E Sparrow',
            role: 'familiar',
            ownerCharId: CLERIC_ID,
            onScene: false,
          },
        },
      },
    });
    await gotoPcTurnDock(page);

    const pane = menagerie(page);
    // The row names the minion and its owner, so the GM can tell two familiars apart.
    await expect(pane).toContainText('E2E Sparrow');
    await expect(pane).toContainText(CLERIC_NAME);

    await pane.getByRole('button', { name: 'Spawn E2E Sparrow on the map' }).click();
    await session.expectSent(
      'cnmh_spawnminion_global',
      (v: any) => v?.ownerCharId === CLERIC_ID && v?.role === 'familiar' && typeof v?.ts === 'number',
    );

    // The bridge answers by flipping onScene; the button settles into its
    // already-placed state rather than disappearing.
    session.push('cnmh_minionactors_global', {
      [`${CLERIC_ID}-familiar`]: {
        foundryActorId: 'a-e2e-sparrow',
        name: 'E2E Sparrow',
        role: 'familiar',
        ownerCharId: CLERIC_ID,
        onScene: true,
      },
    });
    await expect(pane.getByRole('button', { name: 'E2E Sparrow is on the map' })).toBeDisabled();
  });

  // ── Disposition-aware panes (#1552) ─────────────────────────────────────
  test('a FRIENDLY combatant gets the ally pane and the ally-toned strip row; a hostile one does not', async ({ page }) => {
    // Both are kind:'enemy' with no charId — disposition is the ONLY thing
    // telling a summoned ally from a real foe (bridge protocol 9). Written out
    // rather than built with helpers/dock.ts's `foeEntry`: the point of the
    // test is the one field neither of them would get from a foe builder, and
    // giving them defenses and a full stat block would only add noise the
    // assertions then have to ignore.
    const wisp = {
      ...enemyEntry('E2E Wisp', 18),
      disposition: 1,
      creatureKey: 'e2e-wisp',
      bestiary: { hp: { current: 12, max: 12 }, level: 2, traits: ['air'], img: null },
    };
    const ghoul = {
      ...enemyEntry('E2E Ghoul', 8),
      disposition: -1,
      creatureKey: 'e2e-ghoul',
      bestiary: { hp: { current: 9, max: 20 }, level: 1, traits: ['undead'], img: null },
    };
    await mockSession(page, {
      seed: {
        // The wisp is up, so the stage renders ITS pane.
        cnmh_encounter_global: encounterState({
          phase: 'in-progress',
          round: 1,
          currentTurnIndex: 0,
          order: [wisp, pcEntry(FIGHTER_ID, FIGHTER_NAME, 15), ghoul],
        }),
      },
    });
    const pane = await gotoNonPcDock(page);

    // Ally tone: the pane says "Ally turn", not "Enemy turn", and the advance
    // control speaks the same language.
    await expect(page.getByRole('region', { name: 'Ally turn: E2E Wisp' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Enemy turn: E2E Wisp' })).toHaveCount(0);
    await expect(pane).toContainText('Ally turn');
    await expect(page.getByRole('button', { name: "End E2E Wisp's turn" })).toBeVisible();

    // The strip tones the two rows differently off the same disposition field.
    const strip = orderStrip(page);
    await expect(strip.getByTestId(`dock-order-${wisp.entryId}`)).toContainText('Ally');
    await expect(strip.getByTestId(`dock-order-${ghoul.entryId}`)).toContainText('Enemy');
    await expect(strip.getByTestId(`dock-order-${wisp.entryId}`)).not.toContainText('Enemy');
  });

  // ── Challenge tracker (#1553) ───────────────────────────────────────────
  test('the challenge tracker aggregates player VP contributions live', async ({ page }) => {
    const CHALLENGE_ID = 'e2e-ch-barricade';
    const session = await mockSession(page, {
      seed: {
        ...fighterTurnSeed(),
        cnmh_vpchallenge_global: {
          [CHALLENGE_ID]: {
            id: CHALLENGE_ID,
            name: 'E2E Barricade',
            skills: [{ skill: 'athletics', dc: 18 }],
            threshold: 4,
            targetIds: [FIGHTER_ID, CLERIC_ID],
            mode: 'once',
            actionCost: 1,
            createdAt: 1,
          },
        },
        // One PC has already submitted from their own device.
        [`cnmh_vpresult_${FIGHTER_ID}`]: {
          [CHALLENGE_ID]: [
            { round: 1, skill: 'athletics', d20: 18, total: 27, degree: 'criticalSuccess', vp: 2, at: 1 },
          ],
        },
      },
    });
    await gotoPcTurnDock(page);

    const track = page.getByTestId(`vp-track-${CHALLENGE_ID}`);
    await expect(track).toBeVisible();

    // The fighter's submitted check is shown in full; the cleric is still out.
    const fighterRow = track.getByTestId(`vp-row-${CHALLENGE_ID}-${FIGHTER_ID}`);
    await expect(fighterRow).toContainText('Athletics');
    await expect(fighterRow).toContainText('27');
    await expect(fighterRow).toContainText('Critical Success');
    await expect(fighterRow.getByLabel(`vp-${CHALLENGE_ID}-${FIGHTER_ID}`)).toHaveText('+2 VP');
    await expect(track.getByTestId(`vp-row-${CHALLENGE_ID}-${CLERIC_ID}`)).toContainText('Waiting');
    await expect(track).toContainText('2 / 4 VP');
    await expect(track).toContainText('1/2 submitted');

    // The second PC submits on their own key — the GM pool follows without a reload.
    session.push(`cnmh_vpresult_${CLERIC_ID}`, {
      [CHALLENGE_ID]: [
        { round: 1, skill: 'religion', d20: 12, total: 20, degree: 'success', vp: 1, at: 2 },
      ],
    });
    await expect(track.getByTestId(`vp-row-${CHALLENGE_ID}-${CLERIC_ID}`)).toContainText('Religion');
    await expect(track).toContainText('3 / 4 VP');
    await expect(track).toContainText('2/2 submitted');

    // The GM's own ±1 nudge rides `adjust` on the shared challenge doc.
    await track.getByRole('button', { name: 'Nudge E2E Barricade up' }).click();
    await session.expectSent(
      'cnmh_vpchallenge_global',
      (v: any) => v?.[CHALLENGE_ID]?.adjust === 1,
    );
    await expect(track).toContainText('4 / 4 VP');
  });

  // ── Free-form trigger console (#1553) ───────────────────────────────────
  test('the free-form trigger console fires an ad-hoc event at one named PC only', async ({ page }) => {
    const session = await mockSession(page, { seed: fighterTurnSeed() });
    await gotoPcTurnDock(page);

    const console_ = page.getByRole('complementary', { name: 'GM console' });
    await console_.getByLabel('trigger event').selectOption('melee-attack');
    await console_.getByLabel('trigger target').selectOption(CLERIC_ID);
    await console_.getByLabel('trigger note').fill('gargoyle drops from the rafters');

    // The console tells the GM who actually holds a matching reaction, so an
    // arbitrary event can still be aimed.
    await expect(console_.getByLabel('eligible PCs')).toContainText(CLERIC_NAME);
    await expect(console_.getByLabel('eligible PCs')).toContainText('E2E Riposte');

    await console_.getByRole('button', { name: 'Fire trigger' }).click();

    const prompt = await session.expectSent(
      `cnmh_reactprompt_${CLERIC_ID}`,
      (v: any) => v?.eventId === 'melee-attack',
    );
    expect(prompt.note).toBe('gargoyle drops from the rafters');
    expect(prompt.round).toBe(1);
    expect(typeof prompt.reqId).toBe('string');

    // Absence needs an anchor: the session-log append happens AFTER the whole
    // target loop, so once it has landed, an un-targeted fighter prompt would
    // already be in `sent` if it were ever going to be.
    await session.expectSent('cnmh_sessionlog_global');
    expect(
      session.sent.some((m) => m.characterId === FIGHTER_ID && m.stateType === 'reactprompt'),
    ).toBe(false);
  });

  // ── Broadcast console (#1567) ───────────────────────────────────────────
  test('a broadcast lands in the shared session log with its kind dot', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        ...fighterTurnSeed(),
        // Two pre-existing broadcasts of different kinds, to prove the dot is
        // keyed off the entry type rather than being one flat colour.
        cnmh_sessionlog_global: [
          { id: 'slog-e2e-2', ts: Date.parse('2026-07-24T10:05:00Z'), type: 'recall', text: 'E2E recall entry' },
          { id: 'slog-e2e-1', ts: Date.parse('2026-07-24T10:00:00Z'), type: 'gm', text: 'E2E gm entry' },
        ],
      },
    });
    await gotoPcTurnDock(page);

    const log = page.getByRole('region', { name: 'Session Log' });
    await expect(log).toBeVisible();
    const entries = log.getByRole('listitem');
    await expect(entries.filter({ hasText: 'E2E gm entry' })).toContainText('GM');
    await expect(entries.filter({ hasText: 'E2E recall entry' })).toContainText('RK');

    // The kind dot is a ::before on the entry, so it can only be read through
    // getComputedStyle — assert the two kinds actually resolve to different
    // colours (the restyle's whole point) and that neither is blank.
    const dotColour = (text: string) =>
      log
        .getByRole('listitem')
        .filter({ hasText: text })
        .evaluate((el) => window.getComputedStyle(el, '::before').backgroundColor);
    const gmDot = await dotColour('E2E gm entry');
    const rkDot = await dotColour('E2E recall entry');
    expect(gmDot).toMatch(/^rgb/);
    expect(gmDot).not.toBe(rkDot);

    // A fresh broadcast — the trigger console's log append — lands on the
    // shared key (which is what makes it visible beyond this GM client) and
    // shows up at the top of the console's log immediately.
    await page.getByRole('button', { name: 'Fire trigger' }).click();
    const written = await session.expectSent(
      'cnmh_sessionlog_global',
      (v: any) => Array.isArray(v) && v[0]?.type === 'trigger',
    );
    expect(written[0].text).toContain('Ranged attack incoming');
    await expect(entries.first()).toContainText('Ranged attack incoming');
    await expect(entries.first()).toContainText('all PCs');
  });

  // ── RK-reveal side effects (#1555) ──────────────────────────────────────
  test('revealing a foe ability from the dock witnesses it for the whole party, keyed by creature', async ({ page }) => {
    // creatureKey (not entryId) is what rkKeyFor picks, so the reveal is shared
    // by every ghoul in the campaign. Entries WITHOUT a creatureKey fall back
    // to entryId — an ephemeral record that encounter-end pruning drops.
    const ghoul = foeEntry({
      name: 'E2E Ghoul',
      initiative: 12,
      actorId: 'a-e2e-ghoul',
      creatureKey: 'e2e-ghoul',
      hpCurrent: 9,
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: encounterState({
          phase: 'in-progress',
          round: 1,
          currentTurnIndex: 0,
          order: [ghoul, pcEntry(FIGHTER_ID, FIGHTER_NAME, 10)],
        }),
        cnmh_foekit_global: {
          entryId: ghoul.entryId,
          foundryActorId: 'a-e2e-ghoul',
          ts: 1,
          kit: {
            strikes: [],
            spellcasting: [],
            abilities: [
              {
                id: 'ab1',
                name: 'E2E Paralysis',
                actionType: 'free',
                actions: null,
                category: 'offensive',
                traits: ['incapacitation'],
                description: 'Paralyze on a hit.',
              },
            ],
            skills: [],
          },
        },
      },
    });
    // Kit gate, not just the pane: the tab strip renders only once the foekit
    // for this entryId has landed, and the Abilities tab is one of its tabs.
    const pane = await gotoFoeKitDock(page);

    await pane.getByRole('tab', { name: /Abilities/ }).click();
    const row = pane.getByTestId('dock-enemy-ability').filter({ hasText: 'E2E Paralysis' });
    await expect(row).toBeVisible();

    // Abilities have no execution rail (the strike/cast rails need live Foundry
    // presence, which an E2E session never has), so the reveal is a GM tap.
    await row.getByRole('button', { name: 'Reveal E2E Paralysis' }).click();

    const knowledge = await session.expectSent(
      'cnmh_knowledge_global',
      (v: any) => !!v?.['e2e-ghoul']?.witnessed?.['E2E Paralysis'],
    );
    expect(knowledge['e2e-ghoul'].witnessed['E2E Paralysis'].kind).toBe('ability');
    // Keyed by creatureKey, NOT the per-encounter entryId.
    expect(knowledge[ghoul.entryId]).toBeUndefined();

    // The row settles into its revealed tag; the button is spent.
    await expect(row).toContainText('revealed');
    await expect(row.getByRole('button', { name: 'Reveal E2E Paralysis' })).toHaveCount(0);

    // A first reveal is also announced on the encounter log — the party-facing
    // half of "the table saw it".
    await session.expectSent(
      'cnmh_encounter_global',
      (v: any) => (v?.log || []).some((l: any) => String(l.text || '').includes('E2E Paralysis')),
    );
  });
});
