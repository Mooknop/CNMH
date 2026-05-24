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
