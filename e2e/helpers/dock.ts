/**
 * GM Command Dock (`/gm/dock`) — turn gates and seed builders (#1612).
 *
 * Three dock specs were written in parallel for epic #1589 under a "touch no
 * shared file" rule, so each grew its own copy of the setup below. The copies
 * agreed, which is the argument for this file: the rules encoded here are not
 * conveniences, they are the difference between a spec that fails as "the rail
 * is broken" and one that fails as "the element was never there".
 *
 * ── The turn gates ──────────────────────────────────────────────────────────
 * Never assert dock state before an ENCOUNTER-ONLY element is on screen: the
 * dock mounts long before the mocked relay's FULL_STATE replay lands, so an
 * un-gated assertion races hydration. Which element that is depends on WHOSE
 * turn it is, and there is no single locator covering both:
 *
 *   • PC turn      → the acting PC's deck, i.e. the "End turn" button.
 *   • enemy/ally   → there is NO "End turn" button (the acting combatant isn't
 *                    a PC), so the gate is `dock-enemy-pane` itself. If the
 *                    test drives the foe KIT (strikes, spells, skills, Move),
 *                    gate a second time on the Strikes tab: the pane renders
 *                    from the encounter entry, but the tab strip only exists
 *                    once `cnmh_foekit_global` for THIS entryId has arrived.
 *
 * ── Locator traps this surface sets ─────────────────────────────────────────
 * `getByRole(..., { name })` matches by SUBSTRING, and the enemy pane is full
 * of names that nest: 'Damage: Jaws' also matches 'Critical damage: Jaws', and
 * 'Foe save' also matches the 'Foe save DC' input. Pass `exact: true` there.
 * DockOrderStrip also renders its own copy of the pane's condition and
 * persistent-damage chips, so chip locators must be scoped to the pane.
 *
 * ── Seeding the bridge handshake is a CHOICE ────────────────────────────────
 * `bridgeHello` (helpers/bridge.ts) is deliberately NOT part of these builders.
 * Omit it and every protocol-gated rail stays hidden — which is what
 * `gm-dock-console.spec.ts` wants, because the strike rail's 'Damage: Jaws'
 * button would otherwise make its own 'Damage' locator ambiguous. Seed it and
 * the rails arm, and every such locator needs scoping or `exact: true`. Decide
 * per spec; don't inherit it by accident.
 *
 * ── Absence assertions need an anchor ───────────────────────────────────────
 * `isSandboxWritable` is true for any `characterId === 'global'`, so `_global`
 * writes survive the offline-sandbox freeze (`foundry: false`). That makes the
 * dock's "End …'s turn" — an encounter write — a reliable anchor even with no
 * Foundry peer: once it lands, anything a rail was going to emit would already
 * be on the wire, so "nothing was sent" is read after the fact rather than
 * racing it.
 */

import { expect, type Page } from '@playwright/test';
import { encounterState, enemyEntry, readyTurnState } from './encounter';

/** Hydration is a FULL_STATE replay over the mocked socket plus a React mount;
 *  the per-assertion default (7s local) is tight for a cold first navigation,
 *  so the gates below — and only the gates — get their own budget. */
const HYDRATE_TIMEOUT = 15_000;

// ── Navigation + turn gates ──────────────────────────────────────────────────

/** Land on the dock with a PC acting. "End turn" belongs to the staged PC's
 *  real deck, so it exists only once the encounter has hydrated AND resolved to
 *  a PC turn — both halves of the gate in one locator. */
export const gotoPcTurnDock = async (page: Page) => {
  await page.goto('/gm/dock');
  await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible({
    timeout: HYDRATE_TIMEOUT,
  });
};

/** Land on the dock with an enemy or ally acting, and return the pane locator.
 *  The pane IS the encounter-only element on a non-PC turn. Use this when the
 *  test drives the pane WITHOUT a foe kit (disposition tone, the order strip,
 *  the condition editor, the vitals controls). */
export const gotoNonPcDock = async (page: Page) => {
  await page.goto('/gm/dock');
  const pane = page.getByTestId('dock-enemy-pane');
  await expect(pane).toBeVisible({ timeout: HYDRATE_TIMEOUT });
  return pane;
};

/** As `gotoNonPcDock`, plus the second gate: the tab strip renders only when a
 *  `cnmh_foekit_global` matching this entryId has landed, and the pane draws
 *  before it does (until then it shows `dock-enemy-waiting`). Every strike,
 *  cast, skill and Move control hangs off that kit, so a test touching one must
 *  wait for the tabs, not just the pane. */
export const gotoFoeKitDock = async (page: Page) => {
  const pane = await gotoNonPcDock(page);
  await expect(pane.getByRole('tab', { name: /Strikes/ })).toBeVisible();
  return pane;
};

// ── Seed builders ────────────────────────────────────────────────────────────

/**
 * An in-progress encounter with the FIRST entry in `order` acting, plus an
 * armed turn state for each id in `armedPcIds`.
 *
 * The turnToken is the reason this is a builder and not two literals (#1131):
 * TurnTrackerPanel compares the persisted `turnState.turnToken` against
 * `${round}:${currentTurnIndex}` and, on a mismatch, treats the mount as the
 * START of that PC's turn and sweeps — resetting turnstate, clearing
 * `cnmh_readied_<id>`, zeroing minion granted-action pools. A hand-written
 * `readyTurnState()` with no token, or one naming the wrong round, therefore
 * silently erases exactly the state the spec seeded it to assert. Deriving it
 * from the same `round` the encounter carries makes that unmissable.
 *
 * `encounter` merges into the encounter record itself (`saveRequests`,
 * `foundryCombatId`); sibling sync keys are spread by the caller, so a seed
 * reads as `{ ...pcTurnSeed({...}), cnmh_summonpool_global: [...] }` and it
 * stays obvious which keys the test actually cares about.
 */
export const pcTurnSeed = ({
  order,
  armedPcIds = [],
  round = 1,
  encounter = {},
}: {
  order: Array<Record<string, unknown>>;
  armedPcIds?: string[];
  round?: number;
  encounter?: Record<string, unknown>;
}) => ({
  cnmh_encounter_global: {
    ...encounterState({ phase: 'in-progress', round, currentTurnIndex: 0, order }),
    ...encounter,
  },
  ...Object.fromEntries(
    armedPcIds.map((id) => [`cnmh_turnstate_${id}`, readyTurnState(`${round}:0`)]),
  ),
});

/**
 * An enemy order entry ENRICHED the way the bridge pushes it (#1531): vitals
 * and defenses ride the encounter payload, while the offensive kit rides
 * `cnmh_foekit_global` separately. A bare `enemyEntry()` gets you a name in the
 * order strip and an empty stat card — the pane's HP dial, defense block and
 * RK plumbing all read the fields below.
 *
 * `creatureKey` is load-bearing beyond display: it is what `rkKeyFor` picks, so
 * a reveal is shared by every creature of that kind. Entries without one fall
 * back to the per-encounter entryId, which encounter-end pruning drops.
 *
 * Defaults describe the E2E ghoul the dock specs all reach for; `defenses` and
 * `bestiary` are override bags for the fields a given spec actually varies.
 * HP rides `hpCurrent`/`hpMax` — don't restate it inside `bestiary`.
 *
 * There is deliberately no non-PC *seed* builder to pair with this: once the
 * foe entry is shared, the rest is `encounterState({ phase: 'in-progress', … })`
 * from helpers/encounter.ts, and wrapping that would hide which index is acting.
 */
export const foeEntry = ({
  name,
  initiative = null,
  actorId,
  creatureKey,
  hpCurrent,
  hpMax = 20,
  defenses = {},
  bestiary = {},
}: {
  name: string;
  initiative?: number | null;
  actorId?: string;
  creatureKey?: string;
  hpCurrent?: number;
  hpMax?: number;
  defenses?: Record<string, unknown>;
  bestiary?: Record<string, unknown>;
}) => ({
  ...enemyEntry(name, initiative),
  foundryActorId: actorId,
  creatureKey,
  defenses: {
    ac: 16,
    saves: { fortitude: 6, reflex: 8, will: 4 },
    immunities: [],
    resistances: [],
    weaknesses: [],
    ...defenses,
  },
  bestiary: {
    img: null,
    level: 1,
    rarity: 'common',
    traits: ['medium', 'undead'],
    perception: 7,
    speed: 30,
    description: '',
    creatureKey,
    hp: { current: hpCurrent ?? hpMax, max: hpMax },
    ...bestiary,
  },
});
