import type { Page, Locator } from '@playwright/test';

/**
 * RollSheet interaction helpers (#1685 / #1687 — the Roll Resolution redesign).
 *
 * Before the redesign an attack roll was a text input whose degree recomputed
 * per keystroke, so a spec could `fill('15')` and assert on `.trr-result-degree`
 * straight away. RollSheet replaces that with a 1–20 TAP PAD and a single
 * commit: nothing is resolved (and nothing is logged, spent or toasted) until
 * the commit pill, and the damage total is only asked for afterwards.
 *
 * The arc every attack spec now walks:
 *   pick target → [Edit for MAP / toggles / gates] → tap face → commit
 *                → result degrees → Roll damage → total → Apply damage
 *
 * In Foundry dice mode (bridge hello ≥ ROLL_PROTOCOL and no table-dice pref)
 * the pad is replaced by ONE pill — `Roll d20 in Foundry` — whose ack both fills
 * the face and commits, so `commitRoll` is not used there. DamageEntry's pill
 * keeps the original `Roll in Foundry` name; only the d20 one is renamed.
 *
 * Like every other file under e2e/, this imports nothing from src/.
 */

/** RollEntry's 1–20 tap pad (table mode / no bridge / after a nack). */
export const rollPad = (page: Page): Locator => page.getByRole('group', { name: 'raw d20' });

/** The die ring readout — `—` before a face, the face after. */
export const dieRing = (page: Page): Locator => page.getByRole('status', { name: 'your d20 roll' });

/** Tap one face. `exact` matters: a loose `1` also matches 10–19. */
export const tapFace = (page: Page, face: number): Promise<void> =>
  rollPad(page).getByRole('button', { name: String(face), exact: true }).click();

/** The single primary pill of whichever phase is on screen. */
export const sheetPill = (page: Page): Locator => page.locator('.rs-pill');

/** Tap a face and commit — the one moment the confirm sequence fires. */
export const commitRoll = async (page: Page, face: number): Promise<void> => {
  await tapFace(page, face);
  await sheetPill(page).click();
};

/**
 * Commit a TARGET-SAVE cast (#1689). The caster rolls no die — the targets do —
 * so `hasD20` is false and the single pill is the whole gesture. The sheet then
 * parks on `waiting` until the GM's degrees land on the encounter rail.
 */
export const commitSave = (page: Page): Promise<void> => sheetPill(page).click();

/** The pulsing "waiting on the GM" caption. */
export const waitingCaption = (page: Page): Locator =>
  page.getByText('Waiting on the GM to roll saves…');

/** The gold advisory: a refused close, or a bail (dismissed / encounter ended). */
export const guardNotice = (page: Page): Locator => page.locator('.rs-guard');

/** The settled receipt lines. */
export const receipt = (page: Page): Locator => page.locator('.rs-receipt');

/** The caller's edit disclosure: targets, MAP row, situational toggles, gates. */
export const openEdit = (page: Page): Promise<void> =>
  page.getByRole('button', { name: 'Edit', exact: true }).click();

/** The summary strip's context line (targets · cost · bonus · MAP). */
export const summaryLine = (page: Page): Locator => page.locator('.rs-summary-line');

/** The hard-block line that also disables the commit pill. */
export const blockLine = (page: Page): Locator => page.locator('.rs-block');

/** Frozen per-target degree labels on the result card. */
export const degrees = (page: Page): Locator => page.locator('.rs-row-degree');

/** The frozen die face in the result headline. */
export const resultFace = (page: Page): Locator => page.locator('.rs-headline-face');

/** Result → amount. */
export const rollDamage = (page: Page): Promise<void> =>
  page.getByRole('button', { name: 'Roll damage' }).click();

/** Amount → done: the damage appliers (relay, IWR reveal, persistent) run here. */
export const applyDamage = (page: Page): Promise<void> =>
  page.getByRole('button', { name: 'Apply damage' }).click();

/**
 * One DamageEntry row, picked by its dice expression — multi-instance entry
 * (#1019) renders several rows and DamageEntry gives them all the same
 * `rolled damage total` accessible name.
 */
export const damageRow = (page: Page, expression: string): Locator =>
  page.locator('.de-row').filter({ hasText: expression });

/** The per-target damage breakdown line on the amount screen. */
export const breakdown = (page: Page): Locator => page.locator('.rs-breakdown');

/**
 * Sequential per-ray/per-member driver (#1691, SequentialAttackSteps) — the
 * multi-ray attack path (MultiRayResolver, mounted through RollSheet's
 * `dieSlot`) and the chained-strike/chained-spell sections' own inline roll
 * widget both render this. One d20 tap pad + one commit pill PER STEP; a
 * compact receipt chip appears for each step already committed, and a
 * grouped `DamageEntry` row per hit step once every step has rolled.
 */

/** The current step's own d20 pad + commit pill container. */
export const currentStep = (page: Page): Locator => page.locator('.sas-step');

/** The current step's heading ("Ray 2 of 3", "Strike 2 (MAP -5)", …). */
export const currentStepLabel = (page: Page): Locator => page.locator('.sas-step-label');

/** One receipt chip per already-committed step. */
export const stepReceipts = (page: Page): Locator => page.locator('.sas-receipt');

/** The current step's own commit pill (distinct from the sheet's outer `.rs-pill`). */
export const stepPill = (page: Page): Locator => page.locator('.sas-pill');

/** Tap a face and commit the CURRENT sequential step (one ray / chain member). */
export const commitStep = async (page: Page, face: number): Promise<void> => {
  await tapFace(page, face);
  await stepPill(page).click();
};

/** The grouped damage-entry rows, shown once every step has rolled. */
export const stepAmount = (page: Page): Locator => page.locator('.sas-amount');
