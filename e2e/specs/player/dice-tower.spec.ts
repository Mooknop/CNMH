/**
 * Foundry dice tower (#1490 S1–S7 + the #1575 D2/D3 follow-ups) — the
 * cnmh_rollreq_global → cnmh_rolldone_global round-trip behind the "Roll in
 * Foundry" button (src/utils/diceRelay.js, src/hooks/useFoundryDice.js,
 * src/components/shared/FoundryDiceInput.jsx).
 *
 * Same shape as movement.spec: there is no Foundry peer on the local stack, so
 * `mockSession` (#293) plays the bridge — it announces the wire protocol on
 * cnmh_bridgehello_global, hears the app's rollreq and answers with a rolldone
 * ack carrying a chosen d20 face. Everything the ack does NOT carry (modifier,
 * DC, degree of success) stays the app's, so each assertion below is really
 * "the delegated face landed in the manual input and the resolver did the rest".
 *
 * The four contract guarantees the relay's own comments call out get one test
 * each: the happy path, the ok:false nack ("fall back to manual entry NOW", no
 * ROLL_TIMEOUT_MS wait), the unique-id correlation that makes a persisted ack
 * hydrated at mount inert, and the ROLL_PROTOCOL=3 gate that hides the button
 * for older bridges. Then the two device-local follow-ups (pending-roll card,
 * table-dice mode) and the damage-formula delegation of S5.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';
// The roll gate + deadline and the hello payload the gate reads its protocol
// off — copies of src/utils/diceRelay.js, kept in helpers/bridge.ts because
// e2e/ never imports from src/ (see that file's header).
import { bridgeHello, ROLL_PROTOCOL, ROLL_TIMEOUT_MS } from '../../helpers/bridge';

const CHAR_ID = 'e2e-diceroller';
const CHAR_NAME = 'E2E Dice Roller';
const ENEMY_NAME = 'E2E Goblin';
const ENEMY_AC = 20;

// PC order entry matching activeEncounter()'s default (kind:'pc', current turn).
const pcOrderEntry = {
  entryId: `e2e-${CHAR_ID}`,
  kind: 'pc',
  charId: CHAR_ID,
  name: CHAR_NAME,
  initiative: 20,
};

// An enemy the resolver can read an AC off (the enemyWithDefenses filter).
const enemyEntry = {
  entryId: 'e2e-enemy-e2e-goblin',
  kind: 'enemy' as const,
  name: ENEMY_NAME,
  initiative: 10,
  defenses: { ac: ENEMY_AC },
};

// A plain MAP-bearing strike: attackMod → actor-roll vs AC, so the resolver
// renders the d20 entry row the dice tower hangs off. `damage` is optional —
// omitted, no DamagePanel appears and the d20 input is the only dice input on
// screen, which keeps the "Roll in Foundry" locator unambiguous.
const strike = (extra: Record<string, unknown> = {}) => ({
  name: 'E2E Slash',
  actions: '1',
  traits: ['Attack'],
  attackMod: 10,
  description: 'A melee strike.',
  ...extra,
});

// The roll button gates on the announced hello protocol being >= ROLL_PROTOCOL,
// deliberately not on the app-wide MIN_BRIDGE_PROTOCOL.
const rollBtn = (page: Page) => page.getByRole('button', { name: 'Roll in Foundry' });
const d20Input = (page: Page) => page.getByLabel('raw d20');
const degree = (page: Page) => page.locator('.trr-result-degree');

// Seed content + synced state and land on the encounter tab. `protocol` is the
// bridge's announced wire protocol; `seedAck` pre-loads cnmh_rolldone_global as
// if a previous session's ack had been persisted by the DO.
const setup = async (
  page: Page,
  seed: (data: Record<string, unknown>) => Promise<void>,
  {
    action = strike(),
    protocol = ROLL_PROTOCOL,
    seedAck = undefined,
  }: {
    action?: Record<string, unknown>;
    protocol?: number;
    seedAck?: Record<string, unknown>;
  } = {},
): Promise<MockSession> => {
  await seed({
    character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5, actions: [action] }],
  });
  const session = await mockSession(page, {
    seed: {
      cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, {
        order: [pcOrderEntry, enemyEntry],
      }),
      [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
      cnmh_bridgehello_global: bridgeHello(protocol),
      ...(seedAck ? { cnmh_rolldone_global: seedAck } : {}),
    },
  });

  await page.goto(`/character/${CHAR_ID}`);
  await expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({
    timeout: 15_000,
  });
  // Encounter-hydration gate: the mode-aware play tab only reads "Encounter"
  // once cnmh_encounter_global has hydrated into usePlayMode. Clicking it (with
  // Playwright's auto-wait) is therefore the barrier — asserting on resolver
  // state before this lands is the classic flake in this suite.
  await page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Encounter', exact: true })
    .click();
  return session;
};

// Actions tab → the strike → Confirm → pick the target, which is what puts the
// inline TargetRollResolver (and its dice-tower input) on screen.
const openResolver = async (page: Page, actionName = 'E2E Slash') => {
  await page.getByRole('tab', { name: 'Actions' }).click();
  await page.getByRole('button', { name: new RegExp(actionName) }).first().click();
  await page.getByRole('button', { name: /^Confirm / }).click();
  await page.getByRole('button', { name: `Target ${ENEMY_NAME}` }).click();
};

// A well-formed bridge ack for a request. `faces` mirrors the kept-die pairs
// Foundry reports; d20FaceFrom picks the [20, face] pair out of it.
const ack = (id: string, { ok = true, total = 0, faces = [] as number[][] } = {}) => ({
  id,
  charId: CHAR_ID,
  ok,
  total,
  faces,
  ts: Date.now(),
});

test.describe('Foundry dice tower', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('happy path: the Roll button delegates 1d20 and the ack fills the face', async ({
    page,
    seed,
  }) => {
    const session = await setup(page, seed);
    await openResolver(page);

    await expect(rollBtn(page)).toBeVisible();
    await expect(d20Input(page)).toHaveValue('');
    await rollBtn(page).click();

    // The request carries the app's formula, the speaker charId, and a unique
    // id; `flavor` is UseAbilityModal's chat label ("<verb>: <ability>").
    const req = await session.expectSent(
      'cnmh_rollreq_global',
      (v) => v?.formula === '1d20' && v?.charId === CHAR_ID,
    );
    expect(typeof req.id).toBe('string');
    expect(String(req.flavor)).toContain('E2E Slash');

    // Bridge rolls it in Foundry and acks the kept d20 pair. The app takes ONLY
    // the face — every modifier and the degree stay app-side.
    session.push('cnmh_rolldone_global', ack(req.id, { total: 15, faces: [[20, 15]] }));

    await expect(d20Input(page)).toHaveValue('15');
    // 15 + attackMod 10 = 25 vs AC 20 → Hit, exactly as if 15 had been typed.
    await expect(degree(page)).toHaveText('Hit');
  });

  test('nack: an ok:false ack restores manual entry immediately, with no timeout wait', async ({
    page,
    seed,
  }) => {
    const session = await setup(page, seed);
    // Play a bridge that refuses every request (bad formula / Foundry error).
    session.onSent('cnmh_rollreq_global', (req) => {
      session.push('cnmh_rolldone_global', ack(req.id, { ok: false }));
    });

    await openResolver(page);
    await rollBtn(page).click();
    await session.expectSent('cnmh_rollreq_global');

    // Back to "Roll" (not "Rolling…") well inside ROLL_TIMEOUT_MS — the point of
    // the nack is that it settles NOW rather than on the deadline, so the
    // assertion deliberately expires before the deadline could have fired.
    await expect(rollBtn(page)).toHaveText('Roll', { timeout: ROLL_TIMEOUT_MS / 2 });
    await expect(rollBtn(page)).toBeEnabled();
    await expect(d20Input(page)).toHaveValue('');

    // And the manual path is untouched: type the die, get the degree.
    await d20Input(page).fill('15');
    await expect(degree(page)).toHaveText('Hit');
  });

  test('stale ack: a persisted rolldone hydrated at mount never satisfies a live request', async ({
    page,
    seed,
  }) => {
    // A previous session's ack, replayed in FULL_STATE on connect. Its id can
    // never match a request built after mount — that is the whole reason the
    // rail needs no freshness window.
    const session = await setup(page, seed, {
      seedAck: ack('roll-stale-from-a-previous-session', { total: 20, faces: [[20, 20]] }),
    });
    await openResolver(page);

    await rollBtn(page).click();
    const req = await session.expectSent('cnmh_rollreq_global');
    expect(req.id).not.toBe('roll-stale-from-a-previous-session');

    // Give the hydrated ack every chance to be mistaken for the answer: the
    // request must still be in flight and the input untouched by the stale 20.
    await page.waitForTimeout(1_500);
    await expect(rollBtn(page)).toHaveText('Rolling…');
    await expect(d20Input(page)).toHaveValue('');

    // The id-matched ack does settle it — proving the wait above was the id
    // check doing its job, not the rail being dead.
    session.push('cnmh_rolldone_global', ack(req.id, { total: 7, faces: [[20, 7]] }));
    await expect(d20Input(page)).toHaveValue('7');
    // 7 + 10 = 17 vs AC 20 → Miss, i.e. the stale 20's degree, not reused.
    await expect(degree(page)).toHaveText('Miss');
  });

  test('protocol gate: a bridge older than ROLL_PROTOCOL offers no Roll button', async ({
    page,
    seed,
  }) => {
    const session = await setup(page, seed, { protocol: ROLL_PROTOCOL - 1 });
    await openResolver(page);

    // Manual entry is the base path and is unaffected — the older module keeps
    // every other rail working and simply never surfaces the delegation.
    await expect(d20Input(page)).toBeVisible();
    await expect(rollBtn(page)).toHaveCount(0);

    await d20Input(page).fill('15');
    await expect(degree(page)).toHaveText('Hit');
    // Nothing was ever delegated.
    expect(session.sent.some((m) => m.stateType === 'rollreq')).toBe(false);
  });

  test('pending-roll card: the in-flight request floats a card that the ack settles', async ({
    page,
    seed,
  }) => {
    const session = await setup(page, seed);
    await openResolver(page);

    const pending = page.getByTestId('roll-toast-pending');
    await expect(pending).toHaveCount(0);

    await rollBtn(page).click();
    const req = await session.expectSent('cnmh_rollreq_global');

    // #1575 D2: the device that asked floats "Rolling in Foundry…" for the up
    // to 10s round-trip (device-local pendingRolls bus, not the fx channel).
    await expect(pending).toBeVisible();
    await expect(pending).toContainText('Rolling in Foundry…');
    await expect(pending).toContainText(CHAR_NAME);

    session.push('cnmh_rolldone_global', ack(req.id, { total: 18, faces: [[20, 18]] }));

    // The pending card converts into a normal result toast carrying the face.
    await expect(pending).toHaveCount(0);
    await expect(page.getByTestId('roll-toast')).toContainText('18');
  });

  test('table-dice mode: the device pref hides delegation without writing shared state', async ({
    page,
    seed,
  }) => {
    const session = await setup(page, seed);

    // Baseline: with this exact seed the button is offered (see the happy path).
    await openResolver(page);
    await expect(rollBtn(page)).toBeVisible();

    // Close the modal so the navbar toggle is reachable, then flip the pref.
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    const toggle = page.getByRole('button', { name: 'Physical dice mode' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // #1575 D3: this DEVICE rolls physical dice, so every FoundryDiceInput hides
    // its button; manual typing (the universal base path) is unchanged.
    await openResolver(page);
    await expect(d20Input(page)).toBeVisible();
    await expect(rollBtn(page)).toHaveCount(0);
    await d20Input(page).fill('15');
    await expect(degree(page)).toHaveText('Hit');

    // It is device-local: a localStorage pref (useDevicePref), never a synced
    // cnmh_* key — nothing about it may reach the other players' devices.
    expect(
      await page.evaluate(() => window.localStorage.getItem('cnmh-devicepref-tabledice')),
    ).toBe('true');
    expect(session.sent.some((m) => JSON.stringify(m).includes('tabledice'))).toBe(false);
    expect(session.sent.some((m) => m.stateType === 'rollreq')).toBe(false);
  });

  test('damage delegation: the panel sends its own formula and takes the total', async ({
    page,
    seed,
  }) => {
    const session = await setup(page, seed, {
      action: strike({ damage: '2d8+4', damageType: 'piercing' }),
    });
    await openResolver(page);

    // Resolve the attack manually so the DamagePanel appears — this test is
    // about the SECOND dice input, so scope every locator to its panel.
    await d20Input(page).fill('15');
    await expect(degree(page)).toHaveText('Hit');

    const dmgPanel = page.locator('.dmg-panel');
    const dmgRoll = dmgPanel.getByRole('button', { name: 'Roll in Foundry' });
    await expect(dmgRoll).toBeVisible();
    await dmgRoll.click();

    // #1490 S5: the damage formula, not 1d20.
    const req = await session.expectSent(
      'cnmh_rollreq_global',
      (v) => v?.formula === '2d8+4',
    );
    session.push(
      'cnmh_rolldone_global',
      ack(req.id, { total: 13, faces: [[8, 5], [8, 4]] }),
    );

    // Off-d20 formulas fill the TOTAL (there is no face to type here).
    await expect(page.getByLabel('rolled damage total')).toHaveValue('13');
    await expect(page.locator('.dmg-result-line')).toContainText('13');
  });

  test('damage delegation: a prose damage expression shows no Roll button', async ({
    page,
    seed,
  }) => {
    // isRollableExpression rejects hand-authored prose ('1d6 cold splash') that
    // Foundry's Roll parser would nack — the app hides the button rather than
    // round-trip a guaranteed failure. The d20 input above it is unaffected.
    await setup(page, seed, {
      action: strike({ damage: '1d6 cold splash', damageType: 'cold' }),
    });
    await openResolver(page);

    await expect(page.locator('.trr-entry-row').getByRole('button', { name: 'Roll in Foundry' }))
      .toBeVisible();

    await d20Input(page).fill('15');
    await expect(degree(page)).toHaveText('Hit');

    const dmgPanel = page.locator('.dmg-panel');
    await expect(dmgPanel).toBeVisible();
    await expect(dmgPanel.getByRole('button', { name: 'Roll in Foundry' })).toHaveCount(0);
    await expect(page.getByLabel('rolled damage total')).toBeVisible();
  });
});
