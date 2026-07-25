/**
 * Dock enemy ACTION RAILS (#1595) — the execution half of the GM Command Dock's
 * enemy pane: native strikes (#1531 S3), native casts (#1531 S4), the typed
 * damage ack (#1016 mirrored by useDamageRelayAck), mid-turn foe vitals
 * freshness (#1531 S5 / PR #1536) and the foe Move tab (#1572 A2).
 *
 * `gm-command-dock.spec.ts` already proves the pane RENDERS the persisted foe
 * kit read-only, so nothing here re-covers that. What it deliberately could not
 * cover is everything below: those rails gate on live Foundry presence AND a
 * per-rail protocol floor, and that spec seeds no `cnmh_bridgehello_global`, so
 * the buttons never exist there. Seeding the hello (helpers/bridge.ts) is what
 * opens them — without it every test in this file would fail as "the button was
 * never there" rather than "the rail is broken".
 *
 * Shape is movement.spec.ts's: there is no Foundry peer on the local stack, so
 * `mockSession` (#293) plays the bridge — it announces a wire protocol, hears
 * the app's `strikereq` / `castreq` / `movereq` and answers with the matching
 * ack. Both prior bridge specs (dice-tower, map-bridge) treat id-correlation and
 * the ok:false nack as the load-bearing guarantees of a request/ack rail; the
 * strike rail gets the same treatment here, because a `strikedone` is persisted
 * synced state and therefore replays into every fresh dock mount forever.
 *
 * GM surface: `specs/gm/**` runs on the chromium project only.
 *
 * NOTE for whoever factors these files together: `gotoEnemyTurn` + the seed
 * builders below are local on purpose — the two sibling #1589 dock specs were
 * written in parallel under the same "touch no shared file" rule, so a shared
 * `helpers/dock.ts` is a follow-up, not something any one of us could land.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { encounterState, pcEntry, enemyEntry } from '../../helpers/encounter';
// The three per-rail protocol floors and the strike deadline — copies of
// src/utils/{strikeRelay,castRelay,movement}.js, kept in helpers/bridge.ts
// because e2e/ never imports from src/ (see that file's header).
import {
  bridgeHello,
  CAST_PROTOCOL,
  ENEMY_MOVE_PROTOCOL,
  STRIKE_PROTOCOL,
  STRIKE_TIMEOUT_MS,
} from '../../helpers/bridge';

const FIGHTER_ID = 'e2e-rails-fighter';
const FIGHTER_NAME = 'E2E Rails Fighter';
const FIGHTER = pcEntry(FIGHTER_ID, FIGHTER_NAME, 20);

const GHOUL_NAME = 'E2E Ghoul';
const GHOUL_ACTOR_ID = 'a-e2e-ghoul';
const GHOUL_ENTRY_ID = enemyEntry(GHOUL_NAME).entryId;
const GHOUL_HP_MAX = 28;

// A bridge new enough for every rail in this file. Individual floors get their
// own matrix test at the bottom.
const LIVE_PROTOCOL = ENEMY_MOVE_PROTOCOL;

// The ghoul enriched to the bridge's enemy order-entry shape (#1531): vitals and
// defenses ride the ENCOUNTER payload, the offensive kit rides cnmh_foekit_global.
// `creatureKey` is what the RK auto-witness on execution keys off.
const ghoulEntry = (hpCurrent = GHOUL_HP_MAX) => ({
  ...enemyEntry(GHOUL_NAME, 10),
  foundryActorId: GHOUL_ACTOR_ID,
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
    speed: 25,
    hp: { current: hpCurrent, max: GHOUL_HP_MAX },
    description: '',
    creatureKey: 'e2e-ghoul',
  },
});

// The ghoul acts last, so the dock's "End …'s turn" wraps the pointer to the
// fighter and ticks the round — the anchor the bridge-absent test leans on.
const ghoulEncounter = (hpCurrent = GHOUL_HP_MAX) =>
  encounterState({
    phase: 'in-progress',
    round: 2,
    currentTurnIndex: 1,
    order: [FIGHTER, ghoulEntry(hpCurrent)],
  });

// A fresh kit object per call so a test can mutate its copy (spent slots) and
// re-push it as the bridge would after Foundry consumed the resource.
const baseKit = () => ({
  strikes: [
    {
      index: 0,
      slug: 'jaws',
      label: 'Jaws',
      attackModifier: 9,
      variantLabels: ['+9', '+4', '-1'],
      traits: ['agile'],
      ranged: false,
      damage: [{ formula: '1d8+4', type: 'piercing' }],
      attackEffects: ['grab'],
    },
  ],
  spellcasting: [
    {
      id: 'sc-e2e-ghoul',
      name: 'Occult Innate Spells',
      tradition: 'occult',
      castingType: 'innate',
      dc: 19,
      attack: 11,
      slots: { 1: { value: 2, max: 2 } },
      spells: [
        {
          id: 'sp-e2e-fear',
          name: 'E2E Fear',
          rank: 1,
          isCantrip: false,
          cost: '2',
          uses: { value: 1, max: 1 },
          save: { statistic: 'will', basic: false },
          traits: ['emotion', 'fear'],
          description: 'The target is frightened.',
        },
      ],
    },
  ],
  abilities: [
    {
      id: 'ab-e2e-paralysis',
      name: 'E2E Paralysis',
      actionType: 'free',
      actions: null,
      category: 'offensive',
      traits: ['incapacitation'],
      description: 'Paralyze on a hit.',
    },
  ],
  skills: [{ slug: 'athletics', mod: 7 }],
  conditions: [],
});

const foeKit = (kit: Record<string, unknown> = baseKit()) => ({
  entryId: GHOUL_ENTRY_ID,
  foundryActorId: GHOUL_ACTOR_ID,
  kit,
  ts: Date.now(),
});

const dockSeed = ({
  protocol = LIVE_PROTOCOL,
  hpCurrent = GHOUL_HP_MAX,
  kit = baseKit(),
  extra = {},
}: {
  protocol?: number;
  hpCurrent?: number;
  kit?: Record<string, unknown>;
  extra?: Record<string, unknown>;
} = {}) => ({
  cnmh_bridgehello_global: bridgeHello(protocol, 'e2e-dock-rails'),
  cnmh_encounter_global: ghoulEncounter(hpCurrent),
  cnmh_foekit_global: foeKit(kit),
  ...extra,
});

/**
 * Land on the dock with the ghoul acting, gated on hydration.
 *
 * The enemy pane IS the encounter-only element on an enemy turn — there is no
 * "End turn" button to wait for (the acting combatant isn't a PC), so asserting
 * anything about the rails before this resolves would race the FULL_STATE
 * replay. The Strikes tab is the second gate: it renders only once the foe kit
 * matching THIS entryId has arrived, which is what every button below hangs off.
 */
const gotoEnemyTurn = async (page: Page) => {
  await page.goto('/gm/dock');
  const pane = page.getByTestId('dock-enemy-pane');
  await expect(pane).toBeVisible({ timeout: 15_000 });
  await expect(pane.getByRole('tab', { name: /Strikes/ })).toBeVisible();
  return pane;
};

/** A well-formed strikedone. `mode` is the bridge's read-out label, not input. */
const strikeAck = (
  id: string,
  { ok = true, mode = 'attack', total = 0, degree = 2 } = {},
) => ({ id, ok, mode, total, faces: [[20, total]], degree, ts: Date.now() });

const sentValues = (session: MockSession, stateType: string) =>
  session.sent.filter((m) => m.stateType === stateType).map((m) => m.value as any);

test.describe('Dock enemy action rails', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [{ id: FIGHTER_ID, name: FIGHTER_NAME, level: 5 }] });
  });

  // ── Strike rail (#1534) ────────────────────────────────────────────────────

  test('strike rail: a MAP button delegates the strike and the ack lands the degree', async ({
    page,
  }) => {
    const session = await mockSession(page, { seed: dockSeed() });
    const pane = await gotoEnemyTurn(page);

    // Default target is "Foundry's" — whatever the GM already has targeted on
    // the canvas — so the first request must carry no `targets` override at all.
    await pane.getByRole('button', { name: 'Strike: Jaws at +9' }).click();
    const first = await session.expectSent('cnmh_strikereq_global');
    expect(first).toMatchObject({ entryId: GHOUL_ENTRY_ID, actionIndex: 0, variant: 0 });
    expect(first.id).toMatch(/^strike-/);
    expect(first.targets).toBeUndefined();
    expect(first.damage).toBeUndefined();

    // In flight: every roll button disarms, so a jumpy GM can't queue a second
    // native roll behind the first (useFoeStrike drops it on pendingRef).
    await expect(pane.getByRole('button', { name: 'Strike: Jaws at +9' })).toBeDisabled();

    session.push('cnmh_strikedone_global', strikeAck(first.id, { total: 24, degree: 2 }));

    // Resolution is NATIVE — the app renders Foundry's own total and degree, it
    // never re-derives them from the foe's attackModifier.
    const result = pane.getByTestId('dock-enemy-result');
    await expect(result).toContainText('Jaws +9');
    await expect(result).toContainText('24');
    await expect(result).toContainText('Hit');

    // Second beat: a picked PC chip pre-sets the Foundry target, and the second
    // MAP step rides `variant`, not a recomputed modifier.
    await pane
      .getByRole('group', { name: 'Strike target' })
      .getByRole('button', { name: FIGHTER_NAME })
      .click();
    await pane.getByRole('button', { name: 'Strike: Jaws at +4' }).click();
    const second = await session.expectSent('cnmh_strikereq_global', (v) => v?.variant === 1);
    expect(second.targets).toEqual([FIGHTER.entryId]);
    expect(second.id).not.toBe(first.id);

    session.push('cnmh_strikedone_global', strikeAck(second.id, { total: 31, degree: 3 }));
    await expect(result).toContainText('Critical Hit');

    // Damage is the same rail with a `damage` mode rather than a MAP variant —
    // PF2e rolls it off the same strike, so it is not a second request shape.
    await pane.getByRole('button', { name: 'Critical damage: Jaws', exact: true }).click();
    const crit = await session.expectSent('cnmh_strikereq_global', (v) => v?.damage === 'critical');
    expect(crit).toMatchObject({ entryId: GHOUL_ENTRY_ID, actionIndex: 0 });
    session.push(
      'cnmh_strikedone_global',
      { ...strikeAck(crit.id, { mode: 'damage', total: 19 }), degree: null },
    );
    await expect(result).toContainText('Jaws — critical damage');
    await expect(result).toContainText('19');
  });

  test('strike rail: an ok:false nack falls back to Foundry chat at once', async ({ page }) => {
    const session = await mockSession(page, { seed: dockSeed() });
    // Play a bridge that refuses (no active token, Foundry error mid-roll).
    session.onSent('cnmh_strikereq_global', (req) => {
      session.push('cnmh_strikedone_global', { id: req.id, ok: false, ts: Date.now() });
    });

    const pane = await gotoEnemyTurn(page);
    const started = Date.now();
    await pane.getByRole('button', { name: 'Damage: Jaws', exact: true }).click();

    await expect(pane.getByTestId('dock-enemy-result')).toContainText('check Foundry chat');
    // The point of the nack is that it settles NOW instead of on the deadline.
    // The 30s spec timeout means a regression can only surface as a bare
    // timeout, so assert the elapsed time explicitly (as map-bridge does).
    expect(Date.now() - started).toBeLessThan(STRIKE_TIMEOUT_MS / 2);

    // …and the rail is armed again rather than stuck "striking".
    await expect(pane.getByRole('button', { name: 'Strike: Jaws at +9' })).toBeEnabled();
  });

  test('strike rail: a persisted strikedone hydrated at mount never satisfies a live request', async ({
    page,
  }) => {
    // `cnmh_strikedone_global` is persisted synced state: the LAST ack the
    // campaign ever saw replays in FULL_STATE on every dock mount. Correlation
    // is by unique request id precisely so that ghost is inert — which is why
    // this rail needs no freshness window at all.
    const stale = strikeAck('strike-from-a-previous-session', { total: 30, degree: 3 });
    const session = await mockSession(page, {
      seed: dockSeed({ extra: { cnmh_strikedone_global: stale } }),
    });
    const pane = await gotoEnemyTurn(page);

    // The hydrated ack is on record and reads as a critical hit, yet the pane
    // shows no result at all before anything is asked.
    await expect(pane.getByTestId('dock-enemy-result')).toHaveCount(0);

    await pane.getByRole('button', { name: 'Strike: Jaws at +9' }).click();
    const req = await session.expectSent('cnmh_strikereq_global');
    expect(req.id).not.toBe(stale.id);

    // Give the ghost every chance to be mistaken for the answer: the request
    // must still be in flight (button disarmed) and no read-out drawn.
    await page.waitForTimeout(1_500);
    await expect(pane.getByRole('button', { name: 'Strike: Jaws at +9' })).toBeDisabled();
    await expect(pane.getByTestId('dock-enemy-result')).toHaveCount(0);

    // Nor does a live ack meant for somebody else's request settle it.
    session.push('cnmh_strikedone_global', strikeAck('strike-someone-elses', { total: 30, degree: 3 }));
    await expect(pane.getByTestId('dock-enemy-result')).toHaveCount(0);

    // The id-matched ack — and only it — resolves the wait, proving the waits
    // above were the id check doing its job rather than the rail being dead.
    session.push('cnmh_strikedone_global', strikeAck(req.id, { total: 11, degree: 1 }));
    const result = pane.getByTestId('dock-enemy-result');
    await expect(result).toContainText('Miss');
    // The stale 30/critical was never reused.
    await expect(result).toContainText('11');
    await expect(result).not.toContainText('30');
  });

  // ── Cast rail (#1535) ──────────────────────────────────────────────────────

  test('cast rail: Cast delegates the spell and the foekit re-push spends the use', async ({
    page,
  }) => {
    const session = await mockSession(page, { seed: dockSeed() });
    const pane = await gotoEnemyTurn(page);

    await pane.getByRole('tab', { name: /Spells/ }).click();
    const castBtn = pane.getByRole('button', { name: 'Cast: E2E Fear' });
    await expect(castBtn).toBeEnabled();
    await castBtn.click();

    // The request names the spellcasting ENTRY item as well as the spell:
    // SpellcastingEntryPF2e#cast is invoked on the entry, and the rank heightens.
    const req = await session.expectSent('cnmh_castreq_global');
    expect(req).toMatchObject({
      entryId: GHOUL_ENTRY_ID,
      entryItemId: 'sc-e2e-ghoul',
      spellId: 'sp-e2e-fear',
      rank: 1,
    });
    expect(req.id).toMatch(/^cast-/);

    session.push('cnmh_castdone_global', {
      id: req.id, ok: true, name: 'E2E Fear', rank: 1, ts: Date.now(),
    });
    const result = pane.getByTestId('dock-enemy-cast-result');
    await expect(result).toContainText('Cast: E2E Fear');
    await expect(result).toContainText('rank 1');

    // v1 decision: FOUNDRY owns NPC resources. The ack is a read-out only — the
    // remaining count refreshes when the bridge re-pushes the kit off the real
    // item update, and a spell with nothing left disarms its own button.
    const spent = baseKit();
    (spent.spellcasting[0].spells[0].uses as { value: number; max: number }).value = 0;
    session.push('cnmh_foekit_global', foeKit(spent));

    await expect(pane.getByTestId('dock-enemy-spell')).toContainText('0/1');
    await expect(pane.getByRole('button', { name: 'Cast: E2E Fear' })).toBeDisabled();
  });

  test('cast rail: an ok:false nack points the GM back at the Foundry sheet', async ({ page }) => {
    const session = await mockSession(page, { seed: dockSeed() });
    session.onSent('cnmh_castreq_global', (req) => {
      session.push('cnmh_castdone_global', { id: req.id, ok: false, ts: Date.now() });
    });

    const pane = await gotoEnemyTurn(page);
    await pane.getByRole('tab', { name: /Spells/ }).click();
    await pane.getByRole('button', { name: 'Cast: E2E Fear' }).click();

    // The slot may or may not have been burned in Foundry, so the copy sends the
    // GM to the sheet rather than claiming the cast failed.
    await expect(pane.getByTestId('dock-enemy-cast-result'))
      .toContainText('cast it from the Foundry sheet');
    await expect(pane.getByRole('button', { name: 'Cast: E2E Fear' })).toBeEnabled();
  });

  // ── Damage ack (cnmh_dmgdone) ──────────────────────────────────────────────

  test('damage ack: a fresh dmgdone lands in the encounter log; a persisted one is inert', async ({
    page,
  }) => {
    // Unlike strike/cast, this rail has no request id to correlate against — the
    // bridge acks damage the app may never have asked for (a Foundry-side hit).
    // So useDamageRelayAck guards with a 15s freshness window instead, and a
    // persisted ack replayed at mount must fall outside it.
    const session = await mockSession(page, {
      seed: dockSeed({
        extra: {
          cnmh_dmgdone_global: {
            id: 'dmg-from-a-previous-session',
            sourceName: 'E2E Ancient History',
            applied: [{ entryId: FIGHTER.entryId, name: FIGHTER_NAME, amount: 99, type: 'fire' }],
            failed: [],
            ts: Date.now() - 60_000,
          },
        },
      }),
    });
    await gotoEnemyTurn(page);

    // The ghoul's Jaws landed on the fighter and PF2e applied it: the GM client
    // mirrors that into the shared log so the table sees "applied in Foundry".
    session.push('cnmh_dmgdone_global', {
      id: 'dmg-e2e-live',
      sourceName: 'E2E Ghoul: Jaws',
      applied: [{ entryId: FIGHTER.entryId, name: FIGHTER_NAME, amount: 7, type: 'piercing' }],
      failed: [{ entryId: 'e2e-enemy-unmapped', name: 'E2E Unmapped' }],
      ts: Date.now(),
    });

    const logHas = (needle: string) => (v: any) =>
      (v?.log || []).some((e: any) => String(e.text).includes(needle));

    await session.expectSent(
      'cnmh_encounter_global',
      logHas(`7 piercing damage applied to ${FIGHTER_NAME}`),
    );
    // Targets PF2e couldn't reach are called out rather than silently dropped.
    await session.expectSent(
      'cnmh_encounter_global',
      logHas('damage NOT applied to E2E Unmapped — apply by hand'),
    );

    // Anchored: the live line above is written from the SAME effect the stale
    // ack would have written from, so if the hydrated 99-fire ack were going to
    // log, it already would have.
    expect(
      sentValues(session, 'encounter').some((v) =>
        (v?.log || []).some((e: any) => String(e.text).includes('E2E Ancient History')),
      ),
    ).toBe(false);
  });

  // ── Mid-turn foe vitals freshness (#1536) ──────────────────────────────────

  test('mid-turn vitals: a re-pushed encounter refreshes the dial without resetting the pane', async ({
    page,
  }) => {
    const session = await mockSession(page, { seed: dockSeed() });
    const pane = await gotoEnemyTurn(page);
    await expect(pane.getByTestId('dock-enemy-hp')).toContainText(`${GHOUL_HP_MAX}/${GHOUL_HP_MAX}`);

    // Park on a non-default tab first: foe HP rides entry.bestiary.hp inside the
    // encounter payload, so the refresh arrives as a whole new encounter record.
    // If that remounted the pane, the GM would be bounced back to Strikes
    // mid-turn — the tab selection is the remount detector.
    await pane.getByRole('tab', { name: /Skills/ }).click();
    await expect(pane).toContainText('Athletics +7');

    // A PC's reaction hit the ghoul mid-turn; the bridge re-pushes the encounter
    // off the enemy actor update (#1536) rather than waiting for a combat hook.
    session.push('cnmh_encounter_global', ghoulEncounter(6));

    await expect(pane.getByTestId('dock-enemy-hp')).toContainText(`6/${GHOUL_HP_MAX}`);
    await expect(pane.getByRole('tab', { name: /Skills/ })).toHaveAttribute('aria-selected', 'true');
    // …and the kit is still the one keyed to this entry, not re-fetched.
    await expect(pane).toContainText('Athletics +7');
  });

  // ── Move tab (#1572 A2) ────────────────────────────────────────────────────

  test('move tab: the step pad drives the movement rail under the COMBAT entryId', async ({
    page,
  }) => {
    const session = await mockSession(page, { seed: dockSeed() });

    // Play the bridge's probe: one open step east, a wall west, speed 25.
    let movereqs = 0;
    session.onSent(`cnmh_movereq_${GHOUL_ENTRY_ID}`, (req) => {
      movereqs += 1;
      session.push(`cnmh_moveopts_${GHOUL_ENTRY_ID}`, {
        reqTs: req.ts,
        origin: { col: 5, row: 5 },
        reachable: [{ col: 6, row: 5, feet: 5, terrain: 'normal' }],
        blocked: [{ col: 4, row: 5, kind: 'wall' }],
        gridSize: 100,
        speed: 25,
        originOccupied: false,
      });
    });

    const pane = await gotoEnemyTurn(page);
    await pane.getByRole('tab', { name: 'Move' }).click();
    await pane.getByRole('button', { name: `Move ${GHOUL_NAME}` }).click();

    // THE contract of A1: the enemy has no charId and the app never learns its
    // token id, so the request rides the COMBAT entryId and the bridge resolves
    // it through the combatant lookup. Asserting the channel is asserting that.
    const req = session.sent.find((m) => m.stateType === 'movereq')!;
    expect(req.characterId).toBe(GHOUL_ENTRY_ID);
    expect(req.characterId).not.toBe(GHOUL_ACTOR_ID);
    expect(req.value).toMatchObject({ moveType: 'stride' });

    // The bridge's obstacles render on the same pad PCs and minions use.
    await expect(pane.getByLabel('Blocked by Wall')).toBeVisible();
    await pane.getByRole('button', { name: 'Step east' }).click();

    const confirm = await session.expectSent(
      `cnmh_moveconfirm_${GHOUL_ENTRY_ID}`,
      (v) => v?.destination?.col === 6 && v?.destination?.row === 5,
    );
    expect(confirm.moveType).toBe('stride');

    // movedone chains straight into the piggybacked next step (#451) — no second
    // probe — and the stride tally is display-only (enemy pips stay Foundry's).
    session.push(`cnmh_movedone_${GHOUL_ENTRY_ID}`, {
      reqTs: confirm.ts,
      feetMoved: 5,
      newPosition: { col: 6, row: 5 },
      nextOpts: {
        origin: { col: 6, row: 5 },
        reachable: [{ col: 7, row: 5, feet: 5, terrain: 'normal' }],
        blocked: [],
        gridSize: 100,
        speed: 25,
      },
    });

    const meta = pane.getByTestId('dock-enemy-move-meta');
    await expect(meta).toContainText('Moved 5 ft');
    await expect(meta).toContainText('1 Stride at 25 ft');
    await expect(pane.getByRole('button', { name: 'Step east' })).toBeVisible();
    expect(movereqs).toBe(1);

    // Done closes the pad and writes ONE dock-attributed line for the whole move.
    await pane.getByRole('button', { name: 'Done', exact: true }).click();
    await session.expectSent('cnmh_encounter_global', (v) =>
      (v?.log || []).some((e: any) => String(e.text) === `${GHOUL_NAME} moved 5 ft (dock)`),
    );
  });

  // ── Degradation ────────────────────────────────────────────────────────────

  test('bridge absent: every rail degrades to a read-only stat card, nothing hangs', async ({
    page,
  }) => {
    // A protocol-10 hello is on record from the last session the bridge WAS up,
    // so this isolates presence from protocol: `available` needs both, and with
    // no Foundry peer on the relay none of the rails may arm.
    const session = await mockSession(page, { seed: dockSeed(), foundry: false });
    const pane = await gotoEnemyTurn(page);

    // The pane is still the GM's full reference card — the MAP ladder just goes
    // back to being text, which is exactly the pre-S3 shape.
    await expect(pane).toContainText('+9 / +4 / -1');
    await expect(pane).toContainText('1d8+4 piercing');
    await expect(pane.getByRole('button', { name: /^Strike: Jaws/ })).toHaveCount(0);
    await expect(pane.getByRole('group', { name: 'Strike target' })).toHaveCount(0);
    // The ad-hoc damage/save controls ride live rails too, so they hide whole.
    await expect(pane.getByTestId('dock-enemy-gmctl')).toHaveCount(0);
    await expect(pane.getByRole('tab', { name: 'Move' })).toHaveCount(0);

    // Tabs still switch (local state) — degraded, not frozen.
    await pane.getByRole('tab', { name: /Spells/ }).click();
    await expect(pane).toContainText('E2E Fear');
    await expect(pane.getByRole('button', { name: 'Cast: E2E Fear' })).toHaveCount(0);

    // The turn can still be run from the dock. This is also the ANCHOR for the
    // absence assertions below: it is a global write, which survives the offline
    // sandbox freeze, so once it lands anything the rails were going to emit
    // would already be on the wire.
    await page.getByRole('button', { name: `End ${GHOUL_NAME}'s turn` }).click();
    await session.expectSent(
      'cnmh_encounter_global',
      (v: any) => v?.currentTurnIndex === 0 && v?.round === 3,
    );

    expect(sentValues(session, 'strikereq')).toHaveLength(0);
    expect(sentValues(session, 'castreq')).toHaveLength(0);
    expect(sentValues(session, 'movereq')).toHaveLength(0);
  });

  test('protocol floors: strike 6, cast 7 and move 10 open independently', async ({ page }) => {
    // Each rail carries its own floor rather than sharing the app-wide
    // MIN_BRIDGE_PROTOCOL, so a module part-way up the ladder keeps everything
    // it can actually do. Walking the hello up proves they are genuinely
    // independent gates and not one "dock protocol".
    const session = await mockSession(page, { seed: dockSeed({ protocol: STRIKE_PROTOCOL - 1 }) });
    const pane = await gotoEnemyTurn(page);

    await expect(pane).toContainText('+9 / +4 / -1');
    await expect(pane.getByRole('button', { name: /^Strike: Jaws/ })).toHaveCount(0);

    session.push('cnmh_bridgehello_global', bridgeHello(STRIKE_PROTOCOL, 'e2e-dock-rails'));
    await expect(pane.getByRole('button', { name: 'Strike: Jaws at +9' })).toBeVisible();
    // …but casting landed a protocol later.
    await pane.getByRole('tab', { name: /Spells/ }).click();
    await expect(pane).toContainText('E2E Fear');
    await expect(pane.getByRole('button', { name: 'Cast: E2E Fear' })).toHaveCount(0);

    session.push('cnmh_bridgehello_global', bridgeHello(CAST_PROTOCOL, 'e2e-dock-rails'));
    await expect(pane.getByRole('button', { name: 'Cast: E2E Fear' })).toBeVisible();
    // Move needs the bridge to resolve combat entryIds (A1) — three protocols on.
    await expect(pane.getByRole('tab', { name: 'Move' })).toHaveCount(0);

    session.push('cnmh_bridgehello_global', bridgeHello(ENEMY_MOVE_PROTOCOL, 'e2e-dock-rails'));
    await expect(pane.getByRole('tab', { name: 'Move' })).toBeVisible();
    // Nothing was delegated while the gates were shut.
    expect(sentValues(session, 'strikereq')).toHaveLength(0);
    expect(sentValues(session, 'castreq')).toHaveLength(0);
  });
});
