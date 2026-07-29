/**
 * The Segmented Deck shell (#1598, part of epic #1589) — the encounter action UI
 * the redesign PRs #1482–#1488 built: a tabbed deck (Strikes · Spells · Actions ·
 * React · Items) under a sticky control, with a confirm/resolve sheet in front of
 * every resolver.
 *
 * Eleven player specs *navigate* this deck through `helpers/encounter.ts` — it is
 * load-bearing for the whole suite — but until now nothing asserted the deck
 * itself, so a deck regression surfaced as eleven unrelated specs failing for
 * reasons none of them named. This file is that spec, so the assertions are
 * deliberately shallow and segment-local ("the Spells tab shows spells and no
 * strikes") rather than deep end-to-end flows the other specs already cover.
 *
 * Runs on both desktop (chromium) and mobile (mobile-chromium): the deck is the
 * mobile-first surface of the app, so the phone viewport is the primary one here.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { expectMyTurnLive, expectOnSheet, expectSheet, openPlayTab } from '../../helpers/sheet';
import { activeEncounter, budget, deckBody, readyTurnState } from '../../helpers/encounter';
import { applyDamage, commitRoll, openEdit, rollDamage } from '../../helpers/rollSheet';

const CHAR_ID = 'e2e-deckhand';
const CHAR_NAME = 'E2E Deckhand';

const BLADE_UID = 'uid-deck-blade';
const CROSS_UID = 'uid-deck-cross';

// PC order entry matching activeEncounter()'s default position ('1:0').
const pcOrderEntry = { entryId: `e2e-${CHAR_ID}`, kind: 'pc', charId: CHAR_ID, name: CHAR_NAME, initiative: 20 };

// An enemy the strike resolver can read an AC off. AC 5 so any d20 face hits —
// the deck spec cares about the chamber write, not the degree math (attack-rolls
// .spec owns that).
const enemy = (name: string, ac: number) => ({
  entryId: `e2e-enemy-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  kind: 'enemy' as const,
  name,
  initiative: 10,
  defenses: { ac },
});

// ── Catalog content ──────────────────────────────────────────────────────────

const BLADE_ITEM = {
  id: 'e2e-deck-blade',
  name: 'E2E Deck Blade',
  weight: 1,
  price: 1,
  strikes: {
    name: 'E2E Blade Strike',
    type: 'melee',
    damage: '1d8',
    damageType: 'slashing',
    traits: ['Attack', 'Melee'],
    actionCount: 1,
  },
};

const DRAUGHT_ITEM = {
  id: 'e2e-deck-draught',
  name: 'E2E Deck Draught',
  weight: 0,
  price: 1,
  traits: ['Potion'],
  // `consumable` metadata is what makes buildActionCatalog emit a Consumables
  // tile (Items segment) rather than plain inventory.
  consumable: { kind: 'effect', note: 'A test draught.' },
};

// A capacity weapon modelled on the Crescent Cross (capacity/reload/ammoType on
// the ranged strike is what `isCapacityWeapon` keys off), plus its melee sibling
// so the card's "no chamber" grouping has something to group.
const CROSS_ITEM = {
  id: 'e2e-deck-cross',
  name: 'E2E Deck Cross',
  weight: 1,
  price: 4,
  strikes: [
    {
      name: 'E2E Cross Bolt',
      type: 'ranged',
      capacity: 2,
      reload: 1,
      ammoType: 'bolt',
      damage: '1d6',
      damageType: 'piercing',
      traits: ['Attack', 'Capacity 2', 'Ranged'],
      actionCount: 1,
    },
    {
      name: 'E2E Cross Blade',
      type: 'melee',
      damage: '1d4',
      damageType: 'slashing',
      traits: ['Attack', 'Melee'],
      actionCount: 1,
    },
  ],
};

const CANTRIP = { id: 'e2e-deck-spark', name: 'E2E Deck Spark', level: 0, range: '30 feet', description: 'A test cantrip.' };
const RANK1 = { id: 'e2e-deck-bolt', name: 'E2E Deck Bolt', level: 1, range: '60 feet', description: 'A test rank-1 spell.' };

// The house character: a held blade (Strikes), a stance (Actions), a draught
// (Items) and a small repertoire (Spells) — one of everything, so a single
// character can prove every segment shows its own material and nothing else.
const deckCharacter = (extra: Record<string, unknown> = {}) => ({
  id: CHAR_ID,
  name: CHAR_NAME,
  level: 5,
  class: 'Fighter',
  ancestry: 'Human',
  background: 'Soldier',
  maxHp: 50,
  ac: 18,
  abilities: { strength: 18, intelligence: 16 },
  actions: [{ name: 'E2E Deck Stance', actions: '1', traits: ['Stance'], description: 'Enter the test stance.' }],
  spellcasting: {
    tradition: 'arcane',
    ability: 'intelligence',
    proficiency: 2,
    spells: [{ spellRef: CANTRIP.id }, { spellRef: RANK1.id }],
    spell_slots: { 1: 2 },
    focus: { max: 2, current: 2 },
  },
  inventory: [
    { ref: BLADE_ITEM.id, quantity: 1, uid: BLADE_UID },
    { ref: DRAUGHT_ITEM.id, quantity: 1, uid: 'uid-deck-draught' },
  ],
  ...extra,
});

// ── Navigation ───────────────────────────────────────────────────────────────

/**
 * Sheet → Encounter tab → deck ready ("End turn" via `expectMyTurnLive` — the
 * gate against the pre-hydration render where the deck exists but its tiles do
 * not). Stays local: it closes over this spec's CHAR_ID/CHAR_NAME and is just
 * four shared-helper calls in a row.
 */
async function gotoDeck(page: Page) {
  await page.goto(`/character/${CHAR_ID}`);
  await expectOnSheet(page, CHAR_ID);
  await expectSheet(page, CHAR_NAME);
  await openPlayTab(page, 'Encounter');
  await expectMyTurnLive(page);
}

const segment = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });

// `deckBody` (the only correct scope for the exclusivity assertions below) and
// `budget` (the self-status action meter) both live in helpers/encounter.ts —
// see the comments there for the traps each one encodes.

test.describe('Segmented Deck shell', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('each segment shows its own actions and only its own', async ({ page, seed }) => {
    await seed({
      spell: [CANTRIP, RANK1],
      item: [BLADE_ITEM, DRAUGHT_ITEM],
      character: [deckCharacter()],
    });
    await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
        // Blade in hand → its strike lands in the Strikes segment's "In hand".
        [`cnmh_loadout_${CHAR_ID}`]: { [BLADE_UID]: { state: 'held1' } },
      },
    });

    await gotoDeck(page);
    const body = deckBody(page);

    // Strikes: the held weapon's strike, nothing from the other segments.
    await segment(page, 'Strikes').click();
    await expect(body.getByRole('button', { name: 'E2E Blade Strike', exact: true })).toBeVisible();
    await expect(body.getByRole('button', { name: 'E2E Deck Stance', exact: true })).toHaveCount(0);
    await expect(body.getByRole('button', { name: 'E2E Deck Draught', exact: true })).toHaveCount(0);

    // Spells: the repertoire renders in-tab (#1487) — no strikes, no items.
    await segment(page, 'Spells').click();
    await expect(body.locator('.spell-name', { hasText: 'E2E Deck Bolt' })).toBeVisible();
    await expect(body.getByRole('button', { name: 'E2E Blade Strike', exact: true })).toHaveCount(0);
    await expect(body.getByRole('button', { name: 'E2E Deck Draught', exact: true })).toHaveCount(0);

    // Actions: character/feat actions + the basics; no strikes.
    await segment(page, 'Actions').click();
    await expect(body.getByRole('button', { name: 'E2E Deck Stance', exact: true })).toBeVisible();
    await expect(body.getByRole('button', { name: 'E2E Blade Strike', exact: true })).toHaveCount(0);
    await expect(body.locator('.spell-name', { hasText: 'E2E Deck Bolt' })).toHaveCount(0);

    // React: the availability banner + free actions; nothing spendable.
    await segment(page, 'React').click();
    await expect(body.locator('.deck-react-banner')).toContainText('Reaction');
    await expect(body.getByRole('button', { name: 'E2E Blade Strike', exact: true })).toHaveCount(0);
    await expect(body.getByRole('button', { name: 'E2E Deck Stance', exact: true })).toHaveCount(0);

    // Items: the consumable (+ the Hands group); no strikes, no stance.
    await segment(page, 'Items').click();
    await expect(body.getByRole('button', { name: 'E2E Deck Draught', exact: true })).toBeVisible();
    await expect(body.getByRole('button', { name: 'E2E Blade Strike', exact: true })).toHaveCount(0);
    await expect(body.getByRole('button', { name: 'E2E Deck Stance', exact: true })).toHaveCount(0);
  });

  test('the sticky control stays pinned while the segment body scrolls', async ({ page, seed }) => {
    await seed({
      // 24 filler actions make the Actions body taller than any viewport. Without
      // them the deck is the last tall thing on the page: parking it at the top
      // IS the document's maximum scroll, so stickiness can never engage and the
      // test would pass/fail on page height rather than on `position: sticky`.
      character: [deckCharacter({
        actions: Array.from({ length: 24 }, (_, i) => ({
          name: `E2E Deck Filler ${i + 1}`,
          actions: '1',
          traits: ['Concentrate'],
          description: 'Filler so the segment body outgrows the viewport.',
        })),
        inventory: [],
        spellcasting: undefined,
      })],
    });
    await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
      },
    });

    await gotoDeck(page);
    await segment(page, 'Actions').click();

    // The turn budget itself moved out of the deck header into the always-on
    // SelfStatusBar (#1502 S3 superseded #1483's Row A), so it is pinned by
    // being outside the scrolling deck rather than by `position: sticky` —
    // assert it is there, and assert the pinning on what actually pins today.
    await expect(budget(page)).toBeVisible();

    // Park the deck at the top of the viewport, then scroll on: the sticky block
    // stays put while its body slides under it.
    await page.locator('.deck-root').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    const sticky = page.locator('.deck-sticky');
    const before = await sticky.boundingBox();
    const bodyBefore = await deckBody(page).boundingBox();

    // The sheet scrolls in its own container (.character-sheet-page), not the
    // window — `window.scrollBy` is a silent no-op here — so walk up to whichever
    // ancestor actually overflows rather than hard-coding the shell's class.
    const SCROLL = 200;
    await deckBody(page).evaluate((el, dy) => {
      let n: HTMLElement | null = el.parentElement;
      while (n) {
        const s = getComputedStyle(n);
        if (/(auto|scroll|overlay)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) {
          n.scrollTop += dy;
          return;
        }
        n = n.parentElement;
      }
      (document.scrollingElement as HTMLElement).scrollTop += dy;
    }, SCROLL);
    // scrollBy settles asynchronously; wait until the body has actually moved.
    await expect
      .poll(async () => Math.round((await deckBody(page).boundingBox())!.y))
      .toBeLessThanOrEqual(Math.round(bodyBefore!.y) - SCROLL + 4);

    const after = await sticky.boundingBox();
    // Pinned: the control did not travel with the scroll (a non-sticky block
    // would now sit ~200px higher, i.e. off the top of the viewport).
    expect(after!.y).toBeGreaterThan(before!.y - SCROLL + 8);
    expect(after!.y).toBeGreaterThanOrEqual(-1);
    await expect(page.getByRole('tablist', { name: 'Action segments' })).toBeInViewport();
  });

  test('tapping an action previews it before the resolver; backing out spends nothing', async ({ page, seed }) => {
    await seed({
      spell: [CANTRIP, RANK1],
      item: [BLADE_ITEM, DRAUGHT_ITEM],
      character: [deckCharacter()],
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        // '1:0' matches activeEncounter's position — without the token the
        // turn-begin sweep rewrites turnstate mid-test and races the budget.
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
      },
    });

    await gotoDeck(page);
    await segment(page, 'Actions').click();
    await expect(budget(page)).toHaveAttribute('aria-valuenow', '3');

    // Tap → the confirm sheet previews the action (#1484). `exact` matters: the
    // sheet's own confirm button is named "Confirm E2E Deck Stance", which the
    // tile's non-exact name would also match once the sheet is open.
    const tile = deckBody(page).getByRole('button', { name: 'E2E Deck Stance', exact: true });
    await tile.click();
    const sheet = page.getByRole('dialog', { name: 'Confirm E2E Deck Stance' });
    await expect(sheet).toBeVisible();
    // The preview is a readout, not the resolver: the contextual verb for a
    // Stance-trait action is "Enter stance".
    await expect(sheet.getByRole('button', { name: 'Confirm E2E Deck Stance' })).toHaveText('Enter stance');
    await expect(sheet).toContainText('Enter the test stance.');

    // Back out.
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet).toBeHidden();
    await expect(budget(page)).toHaveAttribute('aria-valuenow', '3');

    // Anchored absence: confirm the SAME action for real, wait for the write
    // that only happens past the spend point, then assert the budget shows ONE
    // action gone — i.e. the cancelled preview spent nothing.
    await tile.click();
    await page.getByRole('button', { name: 'Confirm E2E Deck Stance' }).click();
    await session.expectSent(`cnmh_stance_${CHAR_ID}`, (v) => v?.name === 'E2E Deck Stance');
    await session.expectSent(`cnmh_turnstate_${CHAR_ID}`, (v) => v?.actionsSpent === 1);
    await expect(budget(page)).toHaveAttribute('aria-valuenow', '2');
    // And no turnstate write ever carried a second spend.
    expect(
      session.sent.filter((m) => m.stateType === 'turnstate' && (m.value as any)?.actionsSpent > 1),
    ).toHaveLength(0);
  });

  test('a held capacity weapon shows its chamber track; firing advances cnmh_chambers', async ({ page, seed }) => {
    await seed({
      item: [CROSS_ITEM],
      character: [{
        id: CHAR_ID,
        name: CHAR_NAME,
        level: 5,
        class: 'Fighter',
        maxHp: 50,
        ac: 18,
        abilities: { dexterity: 18 },
        inventory: [{ ref: CROSS_ITEM.id, quantity: 1, uid: CROSS_UID }],
      }],
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, {
          order: [pcOrderEntry, enemy('E2E Goblin', 5)],
        }),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
        // Held → the card renders at all (capacityWeaponCards gates on
        // itemAbilitiesActive); 1 of 2 chambers loaded → the ranged strike is
        // fireable AND the inline Reload is still offered.
        [`cnmh_loadout_${CHAR_ID}`]: { [CROSS_UID]: { state: 'held1' } },
        [`cnmh_chambers_${CHAR_ID}`]: {
          [CROSS_UID]: {
            chambers: [{ name: 'E2E Bolt', default: true, infinite: true, activate: 0, onHit: false }, null],
            pointer: 0,
          },
        },
      },
    });

    await gotoDeck(page);
    await segment(page, 'Strikes').click();

    // The card: name + capacity pill + the chamber meter (aria-valuenow = loaded).
    const card = page.locator('.deck-cap-card').filter({ hasText: 'E2E Deck Cross' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Capacity 2');
    const chambers = card.getByRole('meter', { name: /chambers loaded/ });
    await expect(chambers).toHaveAttribute('aria-valuenow', '1');
    await expect(chambers).toHaveAttribute('aria-valuemax', '2');
    // A chamber is empty, so the inline Reload is offered rather than "Loaded".
    await expect(card.getByRole('button', { name: /^Reload / })).toBeVisible();
    // The weapon's strikes group under the track, annotated with chamber use.
    await expect(card.getByRole('button', { name: 'E2E Cross Bolt', exact: true })).toContainText('spends 1 chamber');
    await expect(card.getByRole('button', { name: 'E2E Cross Blade', exact: true })).toContainText('no chamber');

    // Fire it: tile → confirm sheet → target → roll sheet → commit.
    await card.getByRole('button', { name: 'E2E Cross Bolt', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm E2E Cross Bolt' }).click();
    await page.getByRole('button', { name: 'Target E2E Goblin' }).click();
    // The chamber picker only renders for a chambered fire — proof the deck
    // handed the resolver the weaponUid + capacity off the card's strike. It
    // lives in RollSheet's edit disclosure since #1687.
    await openEdit(page);
    await expect(page.getByRole('radiogroup', { name: 'Chamber to fire' })).toContainText('Chamber 1');
    await commitRoll(page, 15);
    await rollDamage(page);
    await page.getByLabel('rolled damage total').fill('6');
    await applyDamage(page);

    // The discharge empties chamber 1 and auto-advances the pointer.
    await session.expectSent(
      `cnmh_chambers_${CHAR_ID}`,
      (v) => v?.[CROSS_UID]?.chambers?.[0] === null && v[CROSS_UID].pointer === 1,
    );
    // …and the track re-reads the overlay it just wrote.
    await expect(chambers).toHaveAttribute('aria-valuenow', '0');
  });

  test('the Spells segment renders casting resources and rank groups', async ({ page, seed }) => {
    await seed({
      spell: [CANTRIP, RANK1],
      item: [BLADE_ITEM, DRAUGHT_ITEM],
      character: [deckCharacter()],
    });
    await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
      },
    });

    await gotoDeck(page);
    await segment(page, 'Spells').click();
    const body = deckBody(page);

    // The pinned resource bar: focus pool + remaining slots per rank (#1487).
    const bar = body.getByRole('group', { name: 'Casting resources' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('img', { name: 'Focus points: 2 of 2 remaining' })).toBeVisible();
    await expect(bar.getByRole('img', { name: 'Rank 1 slots: 2 of 2 remaining' })).toBeVisible();

    // Rank groups, each holding its own spells.
    await expect(body.locator('section[aria-label="Cantrips"] .spell-name')).toHaveText('E2E Deck Spark');
    await expect(body.locator('section[aria-label="Rank 1"] .spell-name')).toHaveText('E2E Deck Bolt');

    // The full spellbook (MagicModal) stays one tap away — and keeps the
    // "Cast a Spell" accessible name every spellcasting helper enters through.
    await expect(body.getByRole('button', { name: 'Cast a Spell' })).toBeVisible();
  });

  test('a hand set from the Items segment shows in the at-a-glance strip', async ({ page, seed }) => {
    await seed({
      spell: [CANTRIP, RANK1],
      item: [BLADE_ITEM, DRAUGHT_ITEM],
      character: [deckCharacter()],
    });
    await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
      },
    });

    await gotoDeck(page);

    // Nothing is held, so the blade's strike sits under "Not in hand".
    await segment(page, 'Strikes').click();
    await expect(
      page.locator('section[aria-label="Not in hand"]').getByRole('button', { name: 'E2E Blade Strike', exact: true }),
    ).toBeVisible();

    // hands.spec owns the Swap → Held → Drop loop; what this asserts is the
    // DECK wiring: the Items-segment hand-setter (#1488) feeding the strip and
    // the Strikes segment.
    await segment(page, 'Items').click();
    await page.getByRole('button', { name: 'Swap E2E Deck Blade' }).click();
    await page.getByTestId(`hands-place-${BLADE_UID}`).click();
    await page.getByTestId('hands-confirm').click();

    await expect(page.getByTestId('hands-glance-slot-1')).toContainText('E2E Deck Blade');

    // …and the strike moves out of "Not in hand" into the held group.
    await segment(page, 'Strikes').click();
    await expect(
      page.locator('section[aria-label="In hand"]').getByRole('button', { name: 'E2E Blade Strike', exact: true }),
    ).toBeVisible();
    await expect(page.locator('section[aria-label="Not in hand"]')).toHaveCount(0);
  });

  test('Exploit Vulnerability and Command live in the deck, not a separate strip', async ({ page, seed }) => {
    await seed({
      character: [{
        id: CHAR_ID,
        name: CHAR_NAME,
        level: 5,
        // isThaumaturge = class 'Thaumaturge' && a truthy `thaumaturge` block.
        class: 'Thaumaturge',
        thaumaturge: {},
        maxHp: 50,
        ac: 18,
        familiar: { name: 'E2E Imp' },
      }],
    });
    await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, {
          order: [pcOrderEntry, enemy('E2E Goblin', 15)],
        }),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
      },
    });

    await gotoDeck(page);

    // #1485 retired the standalone Exploits strip: with the Strikes segment up,
    // the encounter surface holds no Exploit Vulnerability launcher at all.
    await segment(page, 'Strikes').click();
    await expect(page.getByRole('button', { name: 'Exploit Vulnerability', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Command E2E Imp', exact: true })).toHaveCount(0);

    // They live in the deck's Class & Signature group — exactly one tile each.
    await segment(page, 'Actions').click();
    const signature = deckBody(page).locator('section[aria-label="Class & Signature"]');
    await expect(signature.getByRole('button', { name: 'Exploit Vulnerability', exact: true })).toHaveCount(1);
    await expect(signature.getByRole('button', { name: 'Command E2E Imp', exact: true })).toHaveCount(1);

    // And they preview through the same confirm sheet as any other tile, with
    // their bespoke verb, instead of launching their resolver on tap.
    await signature.getByRole('button', { name: 'Exploit Vulnerability', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Confirm Exploit Vulnerability' });
    await expect(sheet.getByRole('button', { name: 'Confirm Exploit Vulnerability' })).toHaveText('Exploit');
  });
});
