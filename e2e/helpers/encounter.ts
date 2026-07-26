import { expect, type Page } from '@playwright/test';

// Build a minimal *active* encounter record (cnmh_encounter_global) for seeding
// via mockSession. An active encounter makes usePlayMode report mode==='encounter',
// which flips the sheet's mode-aware "play" tab to Encounter and renders the
// combat surface (HandsGlance, ActionsList → the Segmented Deck, TurnTrackerPanel).
//
// Shape mirrors src/utils/encounterUtils.js (defaultEncounter + makePcEntry).
//
// Position: round 1, currentTurnIndex 0 — so any turnstate seeded alongside it
// must carry turnToken '1:0' or the turn-begin sweep wipes it. See the
// `turnToken` comment on readyTurnState below for what the sweep clears.
export function activeEncounter(
  charId: string,
  name: string,
  extra: Record<string, unknown> = {},
) {
  return {
    active: true,
    phase: 'in-progress',
    round: 1,
    currentTurnIndex: 0,
    order: [{ entryId: `e2e-${charId}`, kind: 'pc', charId, name, initiative: 20 }],
    log: [],
    saveRequests: [],
    ...extra,
  };
}

// Order-entry builders mirroring makePcEntry/makeEnemyEntry (encounterUtils.js),
// with stable entryIds so tests can re-push a consistent order across turns.
export const pcEntry = (charId: string, name: string, initiative: number | null = null) => ({
  entryId: `e2e-pc-${charId}`,
  kind: 'pc' as const,
  charId,
  name,
  initiative,
});

export const enemyEntry = (name: string, initiative: number | null = null) => ({
  entryId: `e2e-enemy-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  kind: 'enemy' as const,
  name,
  initiative,
});

// Full encounter record at an arbitrary phase, for seeding/pushing via mockSession.
export const encounterState = ({
  phase,
  round = 1,
  currentTurnIndex = 0,
  order = [],
}: {
  phase: 'setup' | 'in-progress';
  round?: number;
  currentTurnIndex?: number;
  order?: Array<Record<string, unknown>>;
}) => ({
  active: true,
  phase,
  round,
  currentTurnIndex,
  order,
  log: [],
  saveRequests: [],
});

// Matches src/utils/encounterUtils.js defaultEncounter() — an ended/idle encounter.
export const idleEncounter = () => ({
  active: false,
  phase: 'idle',
  round: 0,
  currentTurnIndex: 0,
  order: [],
  log: [],
  saveRequests: [],
});

// A turn state with the reaction available — defaultTurnState (useTurnState.jsx)
// has the reaction unavailable until a first turn, so tests that exercise
// reaction-cost actions (Shield Block, reaction prompts) seed this.
//
// `turnToken` (#1131): TurnTrackerPanel's turn-begin effect compares the
// persisted turnState.turnToken against `${round}:${currentTurnIndex}`; on a
// mismatch it treats the mount as the START of the PC's turn and sweeps —
// resetting turnstate, clearing cnmh_readied_<id>, zeroing minion granted-action
// pools. Seeding a turn already in progress (a standing readied action, a
// Command-granted familiar pool) therefore MUST pass the matching token
// (activeEncounter's default position is '1:0') or the sweep wipes the seed.
export const readyTurnState = (turnToken?: string) => ({
  actionsSpent: 0,
  attacksMade: 0,
  reactionAvailable: true,
  reactionSpent: false,
  hasStartedFirstTurn: true,
  actionsLog: [], // spendReaction/spendActions spread this — must be present
  ...(turnToken ? { turnToken } : {}),
});

// ── Reading the encounter surface ───────────────────────────────────────────
// Everything above seeds an encounter; everything below reads the one the app
// rendered from it.

/**
 * The Segmented Deck's segment body (SegmentedDeck.jsx `.deck-body`) — the ONLY
 * correct scope for a segment-exclusivity assertion.
 *
 * The trap: the pinned "Right Now" shortlist (#413) sits ABOVE the segmented
 * control, inside the sticky block rather than the body, and it ranks over the
 * WHOLE action catalog. So a strike legitimately renders on screen while the
 * Spells tab is selected. An unscoped `getByRole('button', { name: 'X Strike' })
 * .toHaveCount(0)` is therefore asserting a promise the deck never made — it
 * will fail (or pass by luck of the ranking) for reasons that have nothing to
 * do with the segment under test. Scope to this, always.
 */
export const deckBody = (page: Page) => page.locator('.deck-body');

/**
 * The turn-budget meter in the always-on self-status bar (SelfStatusBar.jsx,
 * #1502 S3, `role="region"` name "Self status"): `role="meter"` with
 * `aria-valuenow` = actions REMAINING (not spent), max 3.
 *
 * The cleanest budget probe in the app — the pips it wraps are `aria-hidden`
 * presentation, so reading spend off their CSS classes is both fragile and
 * inverted. The name filter is what separates it from the deck's other meter
 * (a capacity weapon's "N chambers loaded" track); the minion/familiar granted
 * pool is `role="status"`, not a meter, so it never collides.
 *
 * The bar only renders the meter on the PC's own turn, so pair it with the
 * `End turn` hydration gate rather than using it as one.
 */
export const budget = (page: Page) => page.getByRole('meter', { name: /actions left/ });

/**
 * Off-turn hydration gate — the twin of waiting on `End turn` for an own-turn
 * test. EncounterStage (#471) replaces the action dial whenever someone else is
 * acting, so its region is the "encounter has landed on this device AND it is
 * not my turn" signal, and the only safe point to start interacting.
 *
 * Two concrete traps this solves, both recorded on #843:
 *  - The `Shield Block damage` input does not exist until this stage has
 *    mounted, so a bare `.fill()` after `goto` races the mount and either
 *    misses or types into a field that is about to be replaced.
 *  - `Shield Block` is disabled while that damage field is EMPTY — not only
 *    while the reaction is unavailable. Asserting `toBeEnabled()` before
 *    typing therefore waits on a condition that cannot come true yet, and the
 *    timeout blames the reaction for what is really an empty input.
 * Gate on the stage, then on the field, then type, then assert enabled.
 */
export const expectOffTurnLive = (page: Page) =>
  expect(page.getByRole('region', { name: 'Off-turn encounter stage' })).toBeVisible({
    timeout: 15_000,
  });
