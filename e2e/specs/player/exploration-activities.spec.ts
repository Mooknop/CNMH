/**
 * Exploration ACTIVITIES (#1622) — what the party is doing while it travels.
 *
 * `movement.spec.ts` already owns the exploration *movement* state machine
 * (cnmh_exploremove / cnmh_exploreoverride / the movereq round-trip); this file
 * owns the other half: the activity pick itself and everything keyed off it.
 *
 * Keys under test (built by `syncKey(RELAY.X, id)` / `globalKey(...)`, so the
 * literal strings live only here and in the mock):
 *   cnmh_exploration_<charId>   — ExplorationTab / ExplorationList / FollowExpertModal
 *   cnmh_followexpert_<charId>  — FollowExpertModal (read by RollActivityModal)
 *   cnmh_scoutbonus_global      — written by ExplorationTab, READ by
 *                                 encounter/InitiativeEntry.jsx
 *
 * The scout-bonus tests are the reason this file exists: picking Scout during
 * exploration changes what a *different* PC's initiative entry computes once
 * combat starts. That is a cross-mode, cross-character effect, so it needs two
 * pages and a relay between them (see `bridgeKey` below). The scout's OWN entry
 * gets the same +1 (#1628) — the whole group does — and that half is a
 * single-page test, since the scout's sheet is the only page involved.
 *
 * Party sizing note: `useExplorationReady` flips the tab from the Activity
 * picker to the Movement pad the moment EVERY party PC has a pick. Every test
 * here therefore seeds three PCs and leaves at least one without one, so the
 * picker (and the active-activity banner) stays on screen for the assertions.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { pcEntry, encounterState } from '../../helpers/encounter';

const SCOUT = { id: 'e2e-scout', name: 'E2E Scout' };
const EXPERT = { id: 'e2e-expert', name: 'E2E Expert' };
const TAGALONG = { id: 'e2e-tagalong', name: 'E2E Tagalong' };

// ── Local helpers (factor-out candidates once a second exploration spec wants
// them — kept in-file so this PR touches nothing shared). ────────────────────

const openExplorationTab = (page: Page) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Exploration', exact: true })
    .click();

const expectSheet = (page: Page, name: string) =>
  expect(page.getByRole('heading', { name, level: 1 })).toBeVisible({ timeout: 15_000 });

// An ExplorationList row. `getByRole(name)` is substring matching and the row's
// accessible name carries the glyph + skill chip, so match the name span exactly.
const activityRow = (page: Page, name: string) =>
  page.locator('.el-activity-list button.action-row').filter({
    has: page.locator('.action-row__name', { hasText: new RegExp(`^${name}$`) }),
  });

const banner = (page: Page) => page.locator('.exploration-active-banner');

/**
 * RollEntry's 1-20 tap pad (#1686 — replaced InitiativeEntry's `d20-input`
 * text field). Scoped inside the initiative region so it can't collide with
 * any other RollEntry/FoundryDiceInput control elsewhere on the sheet. Face
 * names need `exact: true` — non-exact '1' also matches 10-19.
 */
const d20Pad = (page: Page) =>
  page.getByRole('region', { name: 'Initiative entry' }).getByRole('group', { name: 'raw d20' });

const tapD20Face = (page: Page, face: number) =>
  d20Pad(page).getByRole('button', { name: String(face), exact: true }).click();

// Pick an activity through the detail modal (the only path for a plain activity —
// Follow the Expert and Treat Wounds intercept the row click with their own modal).
async function pickActivity(page: Page, name: string) {
  await activityRow(page, name).click();
  const detail = page.getByRole('dialog', { name });
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: 'Set as active' }).click();
  await expect(detail).toBeHidden();
}

// Forward one synced key from one mocked page's relay to another's, the way the
// real CampaignSession DO broadcasts a client UPDATE to every OTHER peer. Needed
// because `mockSession` is per-page: without this the two sockets are islands.
function bridgeKey(from: MockSession, to: MockSession, cnmhKey: string) {
  from.onSent(cnmhKey, (value) => to.push(cnmhKey, value));
}

test.describe('Exploration activities', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      character: [
        { id: SCOUT.id, name: SCOUT.name, level: 5 },
        // Expert in Stealth (rank 2) → running Avoid Notice makes them a valid
        // Follow the Expert target (getExpertHighlightSkill needs rank ≥ 2).
        { id: EXPERT.id, name: EXPERT.name, level: 5, skills: { stealth: { proficiency: 2 } } },
        // Trained only (rank 1) — deliberately NOT Expert, so a self-pairing or a
        // non-followable expert can't sneak into the picker by accident.
        { id: TAGALONG.id, name: TAGALONG.name, level: 5, skills: { stealth: { proficiency: 1 } } },
      ],
    });
  });

  test('picking an activity writes cnmh_exploration_<id>, and switching replaces it', async ({ page }) => {
    const session = await mockSession(page, { seed: { cnmh_playmode_global: 'exploration' } });

    await page.goto(`/character/${SCOUT.id}`);
    await expectSheet(page, SCOUT.name);
    await openExplorationTab(page);

    // Nothing picked yet: no banner, and the party board says so.
    await expect(banner(page)).toHaveCount(0);
    await expect(page.locator('.epb-rows')).toContainText('deciding…');

    await pickActivity(page, 'Scout');

    // The pick is a scalar on the character's own key.
    expect(await session.expectSent(`cnmh_exploration_${SCOUT.id}`, (v) => v === 'Scout')).toBe('Scout');

    // …and the tab reflects it: the banner names it, shows its travel pace and
    // its mechanics note, and the row is pinned active.
    await expect(banner(page)).toContainText('Scout');
    await expect(banner(page)).toContainText('½ Speed');
    await expect(banner(page)).toContainText('+1 circumstance bonus to initiative');
    await expect(activityRow(page, 'Scout')).toHaveClass(/action-row--active/);
    // The party board picks it up through the shared roster reader.
    await expect(page.locator('.epb-chip').filter({ hasText: 'Scout' })).toBeVisible();

    // Switching: one activity at a time — the key is overwritten, not appended.
    await pickActivity(page, 'Defend');

    expect(await session.expectSent(`cnmh_exploration_${SCOUT.id}`, (v) => v === 'Defend')).toBe('Defend');
    // Exactly one banner, naming only the new pick.
    await expect(banner(page)).toHaveCount(1);
    await expect(banner(page)).toContainText('Defend');
    await expect(banner(page)).not.toContainText('Scout');
    await expect(activityRow(page, 'Defend')).toHaveClass(/action-row--active/);
    await expect(activityRow(page, 'Scout')).not.toHaveClass(/action-row--active/);

    // Every value ever written to the key is a plain string — nothing accumulated.
    const picks = session.sent
      .filter((m) => m.characterId === SCOUT.id && m.stateType === 'exploration')
      .map((m) => m.value);
    expect(picks.every((v) => typeof v === 'string')).toBe(true);
    expect(picks.at(-1)).toBe('Defend');
  });

  test('Follow the Expert pairs to an Expert+ party member and feeds the +2 into their roll', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        // The expert is already Avoiding Notice — Stealth, which they're Expert in.
        [`cnmh_exploration_${EXPERT.id}`]: 'Avoid Notice',
      },
    });

    await page.goto(`/character/${TAGALONG.id}`);
    await expectSheet(page, TAGALONG.name);
    await openExplorationTab(page);

    // The row opens the party picker directly (not the generic detail modal).
    await activityRow(page, 'Follow the Expert').click();
    const picker = page.getByRole('dialog', { name: 'Follow the Expert' });
    await expect(picker).toBeVisible();

    const option = picker.locator('.fem-option');
    await expect(option).toHaveCount(1);
    await expect(option).toContainText(EXPERT.name);
    await expect(option).toContainText('Avoid Notice · Stealth');
    await expect(option).toContainText('Expert+');
    await option.click();
    await expect(picker).toBeHidden();

    // One pick writes BOTH keys: the pairing and the follower's activity.
    const link = await session.expectSent(
      `cnmh_followexpert_${TAGALONG.id}`,
      (v) => v?.expertCharId === EXPERT.id,
    );
    expect(link).toEqual({ expertCharId: EXPERT.id, skillId: 'stealth' });
    await session.expectSent(`cnmh_exploration_${TAGALONG.id}`, (v) => v === 'Follow the Expert');

    // The banner reflects the pairing, naming the skill the +2 rides on.
    await expect(banner(page)).toContainText('Follow the Expert');
    await expect(banner(page)).toContainText('+2 circumstance to Stealth');

    // …and the pairing is not cosmetic: RollActivityModal folds the +2 into any
    // check on that same skill. Avoid Notice is the Stealth-keyed activity, so
    // open its Roll Check and read the bonus row.
    await activityRow(page, 'Avoid Notice').click();
    const detail = page.getByRole('dialog', { name: 'Avoid Notice' });
    await detail.getByRole('button', { name: 'Roll Check' }).click();

    // Scope by body class, not dialog name: the detail modal and the roll modal
    // share the activity's title, so `getByRole('dialog', …)` is ambiguous while
    // the first one is still unmounting.
    await expect(page.locator('.ram-body .ram-bonus-note')).toContainText('+2 Follow the Expert');
  });

  test('the pairing picker refuses self-pairing and experts without a followable activity', async ({ page }) => {
    await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        // Hustle has no highlightSkills at all → nobody is followable through it,
        // whatever their proficiencies.
        [`cnmh_exploration_${EXPERT.id}`]: 'Hustle',
        // The follower themself IS running a Stealth activity — but at Trained,
        // and self-pairing is refused regardless.
        [`cnmh_exploration_${TAGALONG.id}`]: 'Avoid Notice',
      },
    });

    await page.goto(`/character/${TAGALONG.id}`);
    await expectSheet(page, TAGALONG.name);
    await openExplorationTab(page);

    // Anchor the absence assertions: wait for the picker's own empty-state copy
    // (which only renders once the eligibility pass has run over the roster)
    // before asserting nobody is offered.
    await activityRow(page, 'Follow the Expert').click();
    const picker = page.getByRole('dialog', { name: 'Follow the Expert' });
    await expect(picker.locator('.fem-empty')).toContainText(
      'No party member is currently performing an exploration activity with an Expert+ skill',
    );
    await expect(picker.locator('.fem-option')).toHaveCount(0);
    await expect(picker.getByText(TAGALONG.name)).toHaveCount(0);
    await expect(picker.getByText(EXPERT.name)).toHaveCount(0);
  });

  test('scouting during exploration raises a different PC\'s initiative once combat starts', async ({
    page,
    context,
  }) => {
    // Two seats. The lookout is mid-encounter (setup phase, Foundry-linked so the
    // app computes the total rather than taking a typed one); the scout is still
    // in exploration. `cnmh_scoutbonus_global` is the only wire between them, so
    // it is the only key bridged — an active encounter would flip the scout's
    // sheet out of exploration mode and the Exploration tab would disappear.
    //
    // The scout's page is opened FIRST, and both pages share one browser context
    // (so they keep the project's baseURL/Access headers). useSyncedState mirrors
    // every key into localStorage, which the two sheets share: loading the scout
    // after the lookout would let the lookout's seeded `cnmh_encounter_global`
    // pre-hydration-seed the scout's sheet into encounter mode.
    const scoutPage = await context.newPage();
    const scout = await mockSession(scoutPage, { seed: { cnmh_playmode_global: 'exploration' } });
    await scoutPage.goto(`/character/${SCOUT.id}`);
    await expectSheet(scoutPage, SCOUT.name);
    await openExplorationTab(scoutPage);

    const lookoutPage = page;
    const lookout = await mockSession(lookoutPage, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_encounter_global: {
          ...encounterState({ phase: 'setup', order: [pcEntry(TAGALONG.id, TAGALONG.name)] }),
          foundryCombatId: 'e2e-combat-scout',
        },
      },
    });

    await lookoutPage.goto(`/character/${TAGALONG.id}`);
    await expectSheet(lookoutPage, TAGALONG.name);
    await lookoutPage
      .getByRole('navigation', { name: 'Character sheet sections' })
      .getByRole('button', { name: 'Encounter', exact: true })
      .click();

    const breakdown = lookoutPage.getByLabel('initiative-breakdown');
    await expect(breakdown).toBeVisible();

    // Baseline: no scout out there, so the entry offers Perception alone.
    const before = (await breakdown.textContent()) || '';
    expect(before).not.toContain('Scout');
    const mod = Number(/Perception ([+-]\d+)/.exec(before)?.[1]);
    expect(Number.isFinite(mod)).toBe(true);
    await expect(lookoutPage.locator('.initiative-entry-scout')).toHaveCount(0);

    // Only now wire the relay: `push` throws without a live socket on the far
    // side, and ExplorationTab writes a null scoutbonus on mount.
    bridgeKey(scout, lookout, 'cnmh_scoutbonus_global');

    await pickActivity(scoutPage, 'Scout');

    // ExplorationTab publishes the scout's id on the global key…
    await scout.expectSent('cnmh_scoutbonus_global', (v) => v === SCOUT.id);

    // …and the lookout's initiative entry, in a different play mode on a
    // different page, picks it up: the reminder appears and the modifier grows.
    await expect(lookoutPage.locator('.initiative-entry-scout')).toContainText(
      '+1 circumstance bonus to initiative',
    );
    await expect(breakdown).toContainText('Scout +1');

    // The bonus is arithmetic, not decoration: the computed total is d20 +
    // Perception + 1.
    await tapD20Face(lookoutPage, 15);
    await expect(breakdown).toContainText('=');
    const after = (await breakdown.textContent()) || '';
    const total = Number(/=\s*(-?\d+)/.exec(after)?.[1]);
    expect(total).toBe(15 + mod + 1);

    // Dropping the activity retracts the party-wide bonus. (No `expectSent` for
    // the null here: ExplorationTab already wrote one on mount, so scanning the
    // sent log for `null` would pass whether or not the clear did anything —
    // the lookout's UI is the only honest witness.)
    await banner(scoutPage).getByRole('button', { name: 'Clear' }).click();
    await expect(lookoutPage.locator('.initiative-entry-scout')).toHaveCount(0);
    await expect(breakdown).not.toContainText('Scout +1');

    await scoutPage.close();
  });

  test('the scout gets the +1 on their own initiative entry too (#1628)', async ({ page }) => {
    // The scout's own half needs no second seat: `cnmh_scoutbonus_global` already
    // carries the scout's id by the time combat starts, so seed it directly and
    // load the scout INTO the encounter. An active encounter makes usePlayMode
    // report 'encounter', which swaps ExplorationTab out for the encounter
    // surface — so nothing here can write the null-on-mount scoutbonus that the
    // two-page test has to work around.
    await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_scoutbonus_global: SCOUT.id,
        cnmh_encounter_global: {
          ...encounterState({ phase: 'setup', order: [pcEntry(SCOUT.id, SCOUT.name)] }),
          foundryCombatId: 'e2e-combat-self-scout',
        },
      },
    });

    await page.goto(`/character/${SCOUT.id}`);
    await expectSheet(page, SCOUT.name);
    await page
      .getByRole('navigation', { name: 'Character sheet sections' })
      .getByRole('button', { name: 'Encounter', exact: true })
      .click();

    // The scout is not excluded from their own activity: reminder and bonus both.
    await expect(page.locator('.initiative-entry-scout')).toContainText(
      '+1 circumstance bonus to initiative',
    );
    const breakdown = page.getByLabel('initiative-breakdown');
    await expect(breakdown).toContainText('Scout +1');

    const mod = Number(/Perception ([+-]\d+)/.exec((await breakdown.textContent()) || '')?.[1]);
    expect(Number.isFinite(mod)).toBe(true);

    await tapD20Face(page, 15);
    await expect(breakdown).toContainText('=');
    const total = Number(/=\s*(-?\d+)/.exec((await breakdown.textContent()) || '')?.[1]);
    expect(total).toBe(15 + mod + 1);
  });

  test('RollActivityModal grades a check by DC extremes', async ({ page }) => {
    await mockSession(page, { seed: { cnmh_playmode_global: 'exploration' } });

    await page.goto(`/character/${SCOUT.id}`);
    await expectSheet(page, SCOUT.name);
    await openExplorationTab(page);

    // Make an Impression is a plain (non-secret, non-targeted) Diplomacy check.
    await pickActivity(page, 'Make an Impression');
    await banner(page).getByRole('button', { name: 'Roll Check' }).click();

    const roll = page.getByRole('dialog', { name: 'Make an Impression' });
    await expect(roll).toBeVisible();
    await expect(roll.locator('.ram-bonus-label')).toHaveText('Diplomacy');
    const bonus = Number((await roll.locator('.ram-bonus-value').textContent())?.replace('+', ''));
    expect(Number.isFinite(bonus)).toBe(true);

    // Degrees pinned by DC extremes rather than by the seeded build: a nat 20
    // against DC 1 beats it by 10+ no matter what the modifier is.
    await roll.getByLabel('d20 roll').fill('20');
    await roll.getByLabel('DC').fill('1');
    await expect(roll.locator('.ram-total-row')).toContainText(String(20 + bonus));
    await expect(roll.locator('.ram-degree')).toHaveText('Critical Success');

    // …and a nat 1 against DC 60 misses by 10+ just as unconditionally.
    await roll.getByLabel('d20 roll').fill('1');
    await roll.getByLabel('DC').fill('60');
    await expect(roll.locator('.ram-total-row')).toContainText(String(1 + bonus));
    await expect(roll.locator('.ram-degree')).toHaveText('Critical Failure');
  });
});
