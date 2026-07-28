/**
 * Signature automations (#1647, part of epic #1589) — the three character-specific
 * encounter rails that nobody but their one owner ever exercises, so they rot
 * quietly: the **spellgun host** (Arcane Duelist's Gloves), the **Blade Byrnie**
 * transient dagger, and **Harmless Bystander**.
 *
 * Keys under test — all four are `APP.*`, NOT `RELAY.*` (the issue's table says
 * RELAY; `src/sync/keys.js` disagrees, and the app-only channels are what the
 * writers actually use):
 *
 *   cnmh_absorbed_<charId>    utils/spellgunHost.js  (via inventory/ItemModal.jsx)
 *   cnmh_spellgunatk_<charId> components/encounter/SpellgunAttackModal.jsx
 *   cnmh_blade_<charId>       hooks/useBladeByrnie.jsx + hooks/useBladeCleanup.jsx
 *   cnmh_bystander_<charId>   hooks/useBystander.jsx, hooks/useEncounter.jsx,
 *                             utils/dailyPrep.js
 *
 * The cleanup halves are the point: `useBladeCleanup` (the end-of-turn backstop
 * for "drew a blade, never Struck") and the Bystander reset are the parts most
 * likely to have rotted, so each gets both a positive box AND a negative one
 * proving it does *not* fire at the wrong boundary.
 *
 * Everything is seeded through mockSession (#293); the spellgun content is
 * bespoke so the spec owns its own numbers, but the Blade Byrnie boxes run the
 * REAL shipped catalog doc (#1672): seeding no items leaves the item collection
 * empty, so ContentContext falls back to the bundled snapshot and the
 * character's `ref: 'blade-byrnie'` resolves against the doc players actually
 * get. Seeding around missing content is exactly how a dead feature stays green.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { expectOnSheet } from '../../helpers/sheet';
import { applyDamage, blockLine, openEdit, rollDamage, tapFace } from '../../helpers/rollSheet';
import {
  deckBody,
  encounterState,
  pcEntry,
  enemyEntry,
  expectOffTurnLive,
  readyTurnState,
} from '../../helpers/encounter';

const CHAR_ID = 'e2e-signatory';
const CHAR_NAME = 'E2E Signatory';

const GUN_UID = 'uid-sig-spellgun';
const GLOVE_UID = 'uid-sig-gloves';
const BYRNIE_UID = 'uid-sig-byrnie';

const ABSORBED_KEY = `cnmh_absorbed_${CHAR_ID}`;
const SPELLGUNATK_KEY = `cnmh_spellgunatk_${CHAR_ID}`;
const BLADE_KEY = `cnmh_blade_${CHAR_ID}`;
const BYSTANDER_KEY = `cnmh_bystander_${CHAR_ID}`;
const TURNSTATE_KEY = `cnmh_turnstate_${CHAR_ID}`;
const INITROLL_KEY = `cnmh_initroll_${CHAR_ID}`;

// ── Content ──────────────────────────────────────────────────────────────────

// A spellgun is any item carrying a `spellgun` block (utils/spellgun.isSpellgun).
// `dice` gives it a damage profile; `actions` is what puts an "Activate a
// Spellgun" tile in the deck (getActions stamps `source` = the item name, which
// is how ActionsList routes the tile to the attack modal).
const SPELLGUN = {
  id: 'e2e-sig-spellgun',
  name: 'E2E Frost Spellgun',
  level: 3,
  price: 1,
  weight: 0.1,
  traits: ['Attack', 'Cold', 'Consumable', 'Magical', 'Spellgun'],
  dice: '2d6',
  spellgun: {
    rangeIncrement: 30,
    against: 'ac',
    damageType: 'cold',
    actionCount: 2,
    attackChoice: true,
  },
  description: 'A one-shot cold spellgun.',
};

// `spellgunHost.capacity` is what makes an item a host (utils/spellgunHost).
// Capacity 1 = the base Arcane Duelist's Gloves.
const GLOVES = {
  id: 'e2e-sig-gloves',
  name: 'E2E Duelist Gloves',
  level: 5,
  price: 1,
  weight: 0.1,
  traits: ['Magical', 'Invested'],
  spellgunHost: { capacity: 1 },
  description: 'Gloves that absorb a spellgun.',
};

// Blade Byrnie: the SHIPPED catalog doc (src/data/snapshot/item.json). The
// `bladeByrnie` block is what utils/bladeByrnie.findBladeByrnie keys off,
// `controller: 'blade-byrnie'` on its action is what ActionsList branches on,
// and `noHandRequired` keeps the item action ACTIVE while the armor is merely
// worn — all three shipped inert-free as of #1672, so these boxes reference the
// real doc by id instead of seeding a stand-in.
const BYRNIE_ID = 'blade-byrnie';

const BYSTANDER_FEAT = {
  name: 'Harmless Bystander',
  level: 4,
  description: 'Roll Deception for initiative and pretend you are not part of the fight.',
};

// Deterministic Deception: Charisma 18 (+4) at level 5, proficiency rank 2 =
// Expert (+4) → 4 + 4 + 5 = +13. Perception stays untrained so the two skills
// can never be confused for one another in the breakdown text.
const signatory = (extra: Record<string, unknown> = {}) => ({
  id: CHAR_ID,
  name: CHAR_NAME,
  level: 5,
  class: 'Rogue',
  ancestry: 'Human',
  background: 'Charlatan',
  maxHp: 50,
  ac: 18,
  abilities: { strength: 12, dexterity: 18, charisma: 18, intelligence: 10 },
  proficiencies: { weapons: { simple: { proficiency: 2 } } },
  skills: { deception: { proficiency: 2 }, stealth: { proficiency: 2 } },
  ...extra,
});

// ── Navigation / gates ───────────────────────────────────────────────────────

const nav = (page: Page) =>
  page.getByRole('navigation', { name: 'Character sheet sections' });

const openTab = (page: Page, name: string) =>
  nav(page).getByRole('button', { name, exact: true }).click();

const expectSheet = async (page: Page) => {
  await expectOnSheet(page, CHAR_ID);
  await expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({
    timeout: 15_000,
  });
};

/** Own-turn hydration gate — the deck's tiles do not exist before this. */
const expectMyTurnLive = (page: Page) =>
  expect(page.getByRole('button', { name: 'End turn' })).toBeVisible({ timeout: 15_000 });

/**
 * Setup-phase gate. Neither `End turn` nor the off-turn stage exists during
 * setup (gm-dock-initiative.spec.ts gates the GM twin on `initiative-setup-panel`);
 * the player twin is InitiativeEntry's own region.
 */
const initiativeEntry = (page: Page) =>
  page.getByRole('region', { name: 'Initiative entry' });

/**
 * RollEntry's 1-20 tap pad (#1686 — replaced InitiativeEntry's `d20-input`
 * text field). Scoped inside the initiative region so it can't collide with
 * any other RollEntry/FoundryDiceInput control elsewhere on the sheet. Face
 * names need `exact: true` — non-exact '1' also matches 10-19.
 */
const d20Pad = (page: Page) =>
  initiativeEntry(page).getByRole('group', { name: 'raw d20' });

const tapD20Face = (page: Page, face: number) =>
  d20Pad(page).getByRole('button', { name: String(face), exact: true }).click();

/**
 * The derived Blade Byrnie dagger's Strike tile. `deriveBladeDagger` names the
 * weapon "Dagger" and `resolveItemStrikes` prefixes the resolved runes, so the
 * tile reads "+1 Striking Dagger Melee Strike" — the armor's own potency (1)
 * plus the default `striking`.
 */
const daggerTile = (page: Page) =>
  deckBody(page).getByRole('button', { name: /\+1 Striking Dagger Melee Strike/ });

// A PC-turn encounter at '1:0' — every turnstate seed must carry the matching
// turnToken or TurnTrackerPanel's turn-begin sweep rewrites it mid-test.
const ORDER = [pcEntry(CHAR_ID, CHAR_NAME, 20), enemyEntry('E2E Goblin', 15)];
const myTurn = () =>
  encounterState({ phase: 'in-progress', round: 1, currentTurnIndex: 0, order: ORDER });

// An enemy the resolver can read an AC off. AC 5 so the degree never depends on
// the character's derived attack bonus — the boxes here are about the writes.
const goblin = { ...enemyEntry('E2E Goblin', 15), defenses: { ac: 5 } };
const orderWithDefenses = [pcEntry(CHAR_ID, CHAR_NAME, 20), goblin];

const logHas = (...needles: string[]) => (v: any) =>
  Array.isArray(v?.log) && v.log.some((e: any) => needles.every((n) => String(e.text).includes(n)));

test.describe('Signature automations', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  // ── Spellgun host ──────────────────────────────────────────────────────────

  test('absorb: the gloves record what they hold, and retrieval gives it back intact', async ({
    page,
    seed,
  }) => {
    await seed({
      item: [SPELLGUN, GLOVES],
      character: [
        signatory({
          inventory: [
            { ref: SPELLGUN.id, quantity: 1, uid: GUN_UID },
            { ref: GLOVES.id, quantity: 1, uid: GLOVE_UID },
          ],
        }),
      ],
    });

    // No encounter: absorbing is a 10-minute activity, done out of combat.
    const session = await mockSession(page);

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openTab(page, 'Inventory');

    // The spellgun's own card offers the host gloves.
    await page.getByTestId(`grid-cell-${GUN_UID}`).click();
    const absorbPanel = page.getByTestId('item-absorb');
    await expect(absorbPanel).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`absorb-host-${GLOVE_UID}`).click();

    // The overlay is the record of what the gloves hold: spellgun uid → glove uid.
    await session.expectSent(ABSORBED_KEY, (v) => v?.[GUN_UID] === GLOVE_UID);

    // An absorbed spellgun loses its own tile — it lives on the glove's card now.
    await expect(page.getByTestId(`grid-cell-${GUN_UID}`)).toHaveCount(0);

    // …where it is listed against the glove's capacity.
    await page.getByTestId(`grid-cell-${GLOVE_UID}`).click();
    const hosted = page.getByTestId('absorbed-spellguns');
    await expect(hosted).toContainText('1 / 1');
    await expect(hosted).toContainText(SPELLGUN.name);

    // Retrieval is NOT consumption (utils/spellgunHost header): the binding
    // clears and the spellgun comes back to the bag whole.
    await page.getByTestId(`absorbed-retrieve-${GUN_UID}`).click();
    await session.expectSent(ABSORBED_KEY, (v) => v && v[GUN_UID] === undefined);
    await expect(page.getByTestId(`grid-cell-${GUN_UID}`)).toBeVisible();
  });

  test('fire: the attack resolves, the proficiency choice persists, and the absorbed charge is released', async ({
    page,
    seed,
  }) => {
    await seed({
      item: [SPELLGUN, GLOVES],
      character: [
        signatory({
          inventory: [
            { ref: SPELLGUN.id, quantity: 1, uid: GUN_UID },
            { ref: GLOVES.id, quantity: 1, uid: GLOVE_UID },
          ],
        }),
      ],
    });

    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: {
          ...encounterState({
            phase: 'in-progress',
            round: 1,
            currentTurnIndex: 0,
            order: orderWithDefenses,
          }),
        },
        [TURNSTATE_KEY]: readyTurnState('1:0'),
        // Already absorbed — this box is about firing, not binding.
        [ABSORBED_KEY]: { [GUN_UID]: GLOVE_UID },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openTab(page, 'Inventory');

    // Fire it off the glove card — the designed launch surface for an absorbed
    // spellgun (it has no tile of its own while bound).
    await page.getByTestId(`grid-cell-${GLOVE_UID}`).click();
    await expect(page.getByTestId('absorbed-spellguns')).toContainText(SPELLGUN.name);
    await page.getByTestId(`absorbed-fire-${GUN_UID}`).click();

    // The attack sheet (RollSheet migration, successor arc to #1680): the
    // proficiency options live in the edit disclosure now. Both are offered
    // (RAW: the wielder chooses spell attack or firearm attack); picking one
    // persists it.
    await openEdit(page);
    const profs = page.getByRole('radiogroup', { name: 'Attack roll type' });
    await expect(profs).toBeVisible({ timeout: 10_000 });
    await profs.getByRole('button', { name: /Firearm attack/ }).click();
    await session.expectSent(SPELLGUNATK_KEY, (v) => v === 'firearm');

    // Pick the target, roll, fire — the commit pill; the consume + action
    // spend fire here, the log waits for the amount step.
    await page.getByRole('button', { name: 'E2E Goblin', exact: true }).click();
    await tapFace(page, 15);
    const fire = page.getByRole('button', { name: /^Fire \(/ });
    await expect(fire).toBeEnabled();
    await fire.click();

    // A hit with a damage profile defers the log line to the finish — walk the
    // amount step with no total so the text matches the pre-redesign line.
    await rollDamage(page);
    await applyDamage(page);

    // The attack lands in the encounter log with the spellgun's own phrasing.
    await session.expectSent(
      'cnmh_encounter_global',
      logHas(`fires ${SPELLGUN.name}`, 'vs E2E Goblin', 'AC 5'),
    );

    // Firing frees the glove slot: the binding is dropped from the overlay.
    await session.expectSent(ABSORBED_KEY, (v) => v && v[GUN_UID] === undefined);

    // The sheet settles into the receipt — the same charge can't be spent twice.
    await expect(page.getByText('Resolved ✓')).toBeVisible();
  });

  /**
   * REGRESSION BOX for #1652 (filed from #1647, fixed in the same-named PR).
   *
   * `SpellgunAttackModal.handleConfirm` writes `cnmh_consumed_<charId>` with
   * `{ [itemUid]: n+1 }` (name-keyed until #1659), but the ONLY reader of that
   * overlay is
   * `InventoryUtils.applyConsumedOverlay`, which used to gate on
   * `isConsumable(item) === !!(item.scroll || item.consumable)`. No shipped
   * spellgun carries a `scroll` or `consumable` block — the five in
   * `src/data/snapshot/item.json` (howl-of-winter, moonlit-, sparking-,
   * torrent-spellgun, verdant-bola) declare only a `spellgun` block plus the
   * "Consumable" TRAIT, which nothing read. So the count never decremented and
   * a fired spellgun stayed in the bag at full quantity, ready to fire again.
   *
   * `isConsumable` now honours the Consumable trait, so the write lands: the
   * one-shot device leaves the bag. This box shipped skipped with #1647 and is
   * live as of #1652.
   */
  test('firing consumes the spellgun — the one-shot device leaves the bag (#1652)', async ({
    page,
    seed,
  }) => {
    await seed({
      item: [SPELLGUN, GLOVES],
      character: [
        signatory({
          inventory: [
            { ref: SPELLGUN.id, quantity: 1, uid: GUN_UID },
            { ref: GLOVES.id, quantity: 1, uid: GLOVE_UID },
          ],
        }),
      ],
    });

    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: encounterState({
          phase: 'in-progress',
          round: 1,
          currentTurnIndex: 0,
          order: orderWithDefenses,
        }),
        [TURNSTATE_KEY]: readyTurnState('1:0'),
        [ABSORBED_KEY]: { [GUN_UID]: GLOVE_UID },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openTab(page, 'Inventory');
    await page.getByTestId(`grid-cell-${GLOVE_UID}`).click();
    await page.getByTestId(`absorbed-fire-${GUN_UID}`).click();
    await openEdit(page);
    await page.getByRole('button', { name: 'E2E Goblin', exact: true }).click();
    await tapFace(page, 15);
    // The commit pill — the consume write is commit-time, so the deferred
    // amount step never gates this box's asserts.
    await page.getByRole('button', { name: /^Fire \(/ }).click();

    // The consumption write goes out — keyed by the inventory entry's uid since
    // #1659, so a second spellgun of the same name keeps its own charge…
    await session.expectSent('cnmh_consumed_' + CHAR_ID, (v) => v?.[GUN_UID] === 1);
    // …and is honoured: quantity 1 minus one burn is 0, so the tile is gone.
    await expect(page.getByTestId(`grid-cell-${GUN_UID}`)).toHaveCount(0);
  });

  test('an unpicked spellgun refuses to fire rather than firing blank', async ({ page, seed }) => {
    await seed({
      item: [SPELLGUN, GLOVES],
      character: [
        signatory({
          inventory: [
            { ref: SPELLGUN.id, quantity: 1, uid: GUN_UID },
            { ref: GLOVES.id, quantity: 1, uid: GLOVE_UID },
          ],
        }),
      ],
    });

    // An encounter with NO enemies in the order — nothing for the modal to
    // target, which is the same gate as "opened the modal and picked nobody".
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: encounterState({
          phase: 'in-progress',
          round: 1,
          currentTurnIndex: 0,
          order: [pcEntry(CHAR_ID, CHAR_NAME, 20)],
        }),
        [TURNSTATE_KEY]: readyTurnState('1:0'),
        [ABSORBED_KEY]: { [GUN_UID]: GLOVE_UID },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openTab(page, 'Inventory');
    await page.getByTestId(`grid-cell-${GLOVE_UID}`).click();
    await page.getByTestId(`absorbed-fire-${GUN_UID}`).click();

    // The sheet is up and hard-blocked — the anchor for the absence assertions.
    // No target ⇒ the block line freezes the die entry and the Fire pill.
    await expect(blockLine(page)).toHaveText('Pick a target first — open Edit.', {
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: /^Fire \(/ })).toBeDisabled();

    // The remaining count + empty-target note live in the edit disclosure.
    await openEdit(page);
    await expect(page.getByLabel('remaining count')).toBeVisible();
    await expect(page.locator('.sgm-empty')).toContainText('No enemies in the encounter.');

    // Anchored absence: the proficiency pick DOES write, so waiting for that
    // write proves the app processed a click after the modal opened — and the
    // absorbed binding is still intact, i.e. nothing was spent.
    await page
      .getByRole('radiogroup', { name: 'Attack roll type' })
      .getByRole('button', { name: /Firearm attack/ })
      .click();
    await session.expectSent(SPELLGUNATK_KEY, (v) => v === 'firearm');
    expect(session.sent.filter((m) => m.stateType === 'absorbed')).toHaveLength(0);
    expect(session.sent.filter((m) => m.stateType === 'consumed')).toHaveLength(0);
  });

  // ── Blade Byrnie ───────────────────────────────────────────────────────────

  test('Draw a Blade puts the transient dagger on the deck; the overlay is the switch', async ({
    page,
    seed,
  }) => {
    // No `item` seeding: an empty item collection makes ContentContext fall
    // back to the bundled snapshot, so the ref resolves the shipped doc.
    await seed({
      character: [signatory({ inventory: [{ ref: BYRNIE_ID, quantity: 1, uid: BYRNIE_UID }] })],
    });

    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: myTurn(),
        [TURNSTATE_KEY]: readyTurnState('1:0'),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openTab(page, 'Encounter');
    await expectMyTurnLive(page);

    // No dagger before the draw — the armor alone grants nothing.
    await page.getByRole('tab', { name: 'Strikes' }).click();
    await expect(daggerTile(page))
      .toHaveCount(0);

    // The armor's item action lands in the Actions segment (origin 'custom' →
    // segmentTiles' `signature` group).
    await page.getByRole('tab', { name: 'Actions' }).click();
    await deckBody(page).getByRole('button', { name: 'Draw a Blade', exact: true }).click();
    // The confirm sheet's accessible name is "Confirm <tile>" (its visible text
    // is the contextual verb, "Use Draw a Blade").
    await page.getByRole('button', { name: 'Confirm Draw a Blade', exact: true }).click();

    await session.expectSent(BLADE_KEY, (v) => v?.active === true);

    // The overlay is what injects the derived strike (useCharacter → bladeStrikes).
    await page.getByRole('tab', { name: 'Strikes' }).click();
    await expect(daggerTile(page))
      .toBeVisible();
  });

  test('cleanup: a still-drawn blade returns to the armor when the wearer\'s turn ends', async ({
    page,
    seed,
  }) => {
    // No `item` seeding: an empty item collection makes ContentContext fall
    // back to the bundled snapshot, so the ref resolves the shipped doc.
    await seed({
      character: [signatory({ inventory: [{ ref: BYRNIE_ID, quantity: 1, uid: BYRNIE_UID }] })],
    });

    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: myTurn(),
        [TURNSTATE_KEY]: readyTurnState('1:0'),
        // Drawn and never Struck with — exactly the case useBladeCleanup exists for.
        [BLADE_KEY]: { active: true, hand: 1, ts: 1 },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openTab(page, 'Encounter');
    await expectMyTurnLive(page);

    await page.getByRole('tab', { name: 'Strikes' }).click();
    await expect(daggerTile(page))
      .toBeVisible();

    // Hand the turn to the goblin — the wearer's turn just ENDED.
    await session.push(
      'cnmh_encounter_global',
      encounterState({ phase: 'in-progress', round: 1, currentTurnIndex: 1, order: ORDER }),
    );
    await expectOffTurnLive(page);

    await session.expectSent(BLADE_KEY, (v) => v?.active === false);
  });

  test('cleanup stays put across an enemy turn boundary — only the wearer\'s own turn end clears it', async ({
    page,
    seed,
  }) => {
    // No `item` seeding: an empty item collection makes ContentContext fall
    // back to the bundled snapshot, so the ref resolves the shipped doc.
    await seed({
      character: [signatory({ inventory: [{ ref: BYRNIE_ID, quantity: 1, uid: BYRNIE_UID }] })],
    });

    const session = await mockSession(page, {
      seed: {
        // Start on the GOBLIN's turn, so the first boundary the sweep sees has
        // an ENEMY as the outgoing combatant.
        cnmh_encounter_global: encounterState({
          phase: 'in-progress',
          round: 1,
          currentTurnIndex: 1,
          order: ORDER,
        }),
        [TURNSTATE_KEY]: readyTurnState('1:0'),
        [BLADE_KEY]: { active: true, hand: 1, ts: 1 },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openTab(page, 'Encounter');
    await expectOffTurnLive(page);

    // Round 2 begins with the wearer: the goblin's turn ended, not theirs.
    await session.push(
      'cnmh_encounter_global',
      encounterState({ phase: 'in-progress', round: 2, currentTurnIndex: 0, order: ORDER }),
    );
    // Anchor: the wearer's own turn is live again, so the transition HAS been
    // processed — anything the sweep meant to write would have been written.
    await expectMyTurnLive(page);

    expect(session.sent.filter((m) => m.stateType === 'blade')).toHaveLength(0);
    // …and the dagger is still on the deck.
    await page.getByRole('tab', { name: 'Strikes' }).click();
    await expect(daggerTile(page))
      .toBeVisible();
  });

  // ── Harmless Bystander ─────────────────────────────────────────────────────

  test('bystander (Foundry-linked): the roll goes out as Deception instead of the selected skill', async ({
    page,
    seed,
  }) => {
    await seed({
      character: [signatory({ feats: [BYSTANDER_FEAT] })],
    });

    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: {
          ...encounterState({ phase: 'setup', order: [pcEntry(CHAR_ID, CHAR_NAME)] }),
          foundryCombatId: 'e2e-sig-combat',
        },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openTab(page, 'Encounter');
    await expect(initiativeEntry(page)).toBeVisible({ timeout: 15_000 });

    // Pick a NON-Deception skill first, so "instead of the selected skill" is a
    // real substitution rather than a default.
    const skillSelect = page.getByLabel('initiative-skill-select');
    await skillSelect.selectOption('stealth');
    await expect(page.getByLabel('initiative-breakdown')).toContainText('Stealth');

    // Declaring the feat records the state and forces the skill.
    await page.getByLabel('harmless-bystander-toggle').check();
    await session.expectSent(
      BYSTANDER_KEY,
      (v) => v?.active === true && v?.mod === 'deception',
    );
    await expect(skillSelect).toHaveValue('deception');
    await expect(skillSelect).toBeDisabled();
    await expect(page.getByLabel('initiative-breakdown')).toContainText('Deception +13');

    // The submitted roll carries Deception, not the stealth pick: d20 12 + 13.
    await tapD20Face(page, 12);
    await page.getByLabel('submit-initiative').click();
    const roll = await session.expectSent(INITROLL_KEY, (v) => v?.d20 === 12);
    expect(roll.skill).toBe('deception');
    expect(roll.mod).toBe(13);
    expect(roll.total).toBe(25);
  });

  test('bystander (app-only encounter): the declaration seeds the order with a Deception total, and undeclaring clears it', async ({
    page,
    seed,
  }) => {
    await seed({
      character: [signatory({ feats: [BYSTANDER_FEAT] })],
    });

    const session = await mockSession(page, {
      seed: {
        // No foundryCombatId → the app-only path, which writes the total
        // straight into cnmh_encounter_global's order.
        cnmh_encounter_global: encounterState({
          phase: 'setup',
          order: [pcEntry(CHAR_ID, CHAR_NAME)],
        }),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openTab(page, 'Encounter');
    await expect(initiativeEntry(page)).toBeVisible({ timeout: 15_000 });

    // Undeclared: a plain manual-total field, no d20 breakdown.
    await expect(page.getByLabel('initiative-input')).toBeVisible();

    await page.getByLabel('harmless-bystander-toggle').check();
    await session.expectSent(BYSTANDER_KEY, (v) => v?.active === true && v?.mod === 'deception');

    // The entry swaps to "roll a d20, we add Deception".
    await expect(page.getByLabel('initiative-breakdown')).toContainText('Deception +13');
    await tapD20Face(page, 9);
    await expect(page.getByLabel('initiative-breakdown')).toContainText('= 22');
    await session.expectSent(
      'cnmh_encounter_global',
      (v: any) => (v?.order || []).some((e: any) => e.charId === CHAR_ID && e.initiative === 22),
    );

    // Undeclaring is the other half: the flag clears and the manual field is back.
    await page.getByLabel('harmless-bystander-toggle').uncheck();
    await session.expectSent(BYSTANDER_KEY, (v) => v?.active === false && v?.mod === null);
    await expect(page.getByLabel('initiative-input')).toBeVisible();
  });

  test('bystander clears at daily preparations', async ({ page, seed }) => {
    await seed({
      character: [signatory({ feats: [BYSTANDER_FEAT] })],
    });

    const session = await mockSession(page, {
      seed: {
        // A declaration that outlived its fight — the leftover dailyPrep.js
        // sweeps (computeResets → { type:'bystander' }).
        [BYSTANDER_KEY]: { active: true, mod: 'deception', ts: 1 },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openTab(page, 'Stats');

    await page.getByRole('button', { name: /Daily Preparations/ }).click();
    const modal = page.getByRole('dialog', { name: 'Daily Preparations' });
    await expect(modal).toBeVisible({ timeout: 10_000 });
    // The plan names it before it is performed.
    await expect(modal.locator('.dp-reset-list')).toContainText('Harmless Bystander');

    await modal.getByRole('button', { name: 'Prepare' }).click();
    await session.expectSent(
      BYSTANDER_KEY,
      (v) => v?.active === false && v?.mod === null,
    );
  });
});
