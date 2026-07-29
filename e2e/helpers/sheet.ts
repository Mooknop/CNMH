import { expect, type Page } from '@playwright/test';

// Assert the browser is still on the character sheet URL — i.e., CharacterSheet
// did NOT redirect to '/'. If the seeded character isn't visible to
// ContentContext yet (the Slice 4 player-test failure mode), the useEffect in
// CharacterSheet pushes us to '/' immediately on mount. Without this check the
// test sits in a 15s `waitForSheet` timeout that produces a generic
// "h1 not found" error; with it, we fail in ~2s with the actual diagnosis.
export async function expectOnSheet(page: Page, charId: string) {
  await expect(page).toHaveURL(new RegExp(`/character/${charId}$`), { timeout: 2000 });
}

/**
 * The sheet has mounted: its `<h1>` carries the character's name. The 15s
 * budget absorbs a cold local-stack render (content fetch + first paint), not a
 * data race — pair with `expectOnSheet` first when the redirect-to-'/' failure
 * mode (seed not visible to ContentContext yet) is a live risk, so THAT fails
 * in ~2s with the real diagnosis instead of timing out here.
 */
export const expectSheet = (page: Page, charName: string) =>
  expect(page.getByRole('heading', { name: charName, level: 1 })).toBeVisible({
    timeout: 15_000,
  });

/**
 * A tab on the sheet's bottom nav — fixed tabs (Stats, Inventory, …) and the
 * mode-aware play tab alike.
 *
 * The nav carries ONE tab whose label follows `usePlayMode`: it reads
 * "Encounter" only while an active encounter is synced, "Downtime" only once
 * `cnmh_playmode_global` is 'downtime' with no active encounter, and
 * "Exploration" otherwise. Clicking it therefore doubles as the hydration gate
 * (#1366) for everything the tab renders: if the synced state hasn't landed yet
 * the button still says Exploration and the click retries until it does,
 * instead of the spec racing ahead to assert on an unmounted surface.
 */
export const openPlayTab = (page: Page, tabName: string) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: tabName, exact: true })
    .click();

/**
 * Own-turn hydration gate — the twin of `expectOffTurnLive` in
 * helpers/encounter.ts. The self-status bar's `End turn` button renders only
 * once an ACTIVE, in-progress encounter has hydrated on this device AND it is
 * this PC's turn, so it is the cheapest gate against the pre-hydration render
 * where the deck exists but its tiles do not. `cnmh_encounter_global` is a
 * global key and can land a beat late; assert this before touching anything
 * the encounter surface renders.
 */
export const expectMyTurnLive = (page: Page) =>
  expect(page.getByRole('button', { name: 'End turn' })).toBeVisible({ timeout: 15_000 });
