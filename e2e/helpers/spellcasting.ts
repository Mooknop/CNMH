import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { expectOnSheet } from './sheet';

/**
 * Spell cast-flow harness (#1133). Everything a spec needs to drive the Magic
 * panel → CastSpellModal (or its routed per-spell resolver) through the real
 * UI with real resources seeded:
 *
 *   - `snapshotSpells(...)`  — real catalog docs from the bundled seed, so the
 *     ids the cast flow routes on (`lingering-composition`, `hymn-of-healing`)
 *     can never drift from production content.
 *   - `casterCharacter(...)` — a caster doc with a working spellcasting entry:
 *     focus pool (`spellcasting.focus`), slot totals (`spell_slots`),
 *     repertoire + focus spells as catalog `spellRef`s (epic #622).
 *   - `gotoSheet` / `openMagic` / `openMagicCategory` / `castSpell` — the
 *     multi-level modal nav: sheet → Encounter tab → Magic → category →
 *     spell card → detail modal → Cast chip.
 *
 * Cast buttons only render on the caster's turn, so specs must seed an active
 * in-progress encounter with the caster up (helpers/encounter.ts
 * `activeEncounter`) through `mockSession` — which is also where the synced
 * writes the flow produces (`cnmh_slots_*`, `cnmh_focus_*`, `cnmh_lingering_*`,
 * `cnmh_playing_*`) get asserted via `expectSent`.
 */

const SNAPSHOT_SPELLS = path.resolve(__dirname, '../../src/data/snapshot/spell.json');
const SNAPSHOT_ITEMS = path.resolve(__dirname, '../../src/data/snapshot/item.json');

// Pull real spell docs out of the bundled seed by id. Seeding these (instead of
// hand-written stubs) keeps id-routed flows honest: if the catalog doc a modal
// routes on ever changes shape, the spec sees exactly what production sees.
export function snapshotSpells(...ids: string[]): Array<Record<string, unknown> & { id: string }> {
  const all = JSON.parse(fs.readFileSync(SNAPSHOT_SPELLS, 'utf8')) as Array<
    Record<string, unknown> & { id: string }
  >;
  return ids.map((id) => {
    const doc = all.find((s) => s.id === id);
    if (!doc) throw new Error(`snapshotSpells: "${id}" not found in src/data/snapshot/spell.json`);
    return doc;
  });
}

// Pull real item docs out of the bundled seed by id — the item-catalog analogue
// of snapshotSpells. Seeding an item and referencing it from inventory (rather
// than inlining a hand-written stub) keeps action-derivation honest: the real
// authored `chain`/`transform` block is what drives the spellshape cast flow, so
// a spec can never silently drift from the production scepter it exercises.
export function snapshotItems(...ids: string[]): Array<Record<string, unknown> & { id: string }> {
  const all = JSON.parse(fs.readFileSync(SNAPSHOT_ITEMS, 'utf8')) as Array<
    Record<string, unknown> & { id: string }
  >;
  return ids.map((id) => {
    const doc = all.find((s) => s.id === id);
    if (!doc) throw new Error(`snapshotItems: "${id}" not found in src/data/snapshot/item.json`);
    return doc;
  });
}

export type CasterOptions = {
  id?: string;
  name?: string;
  level?: number;
  /** PF2e class name — 'Bard' relabels the focus category to "Compositions". */
  charClass?: string;
  abilities?: Record<string, number>;
  skills?: Record<string, { proficiency: number }>;
  /** Spell-slot totals by rank, e.g. { '1': 3, '2': 2 } → spellcasting.spell_slots. */
  slots?: Record<string, number>;
  /** Catalog spell ids → spellcasting.spells [{ spellRef }] (repertoire). */
  repertoire?: string[];
  /** Focus pool → spellcasting.focus { max, current } (drives getFocusInfo). */
  focus?: { max: number; current?: number };
  /** Catalog spell ids → focus_spells [{ spellRef }]. */
  focusSpells?: string[];
  /** Extra top-level fields spread onto the doc (inventory, feats, …). */
  extra?: Record<string, unknown>;
};

/**
 * Build a caster character doc for `seed({ character: [...] })`. Defaults to a
 * level-5 occult caster with Cha 16 + Performance trained (Performance mod
 * +10 = +3 ability, +2 trained, +5 level) so Performance-rolling resolvers
 * (Lingering Composition) get a stable, precomputable modifier.
 */
export function casterCharacter({
  id = 'e2e-caster',
  name = 'E2E Caster',
  level = 5,
  charClass,
  abilities = { charisma: 16 },
  skills = { performance: { proficiency: 1 } },
  slots,
  repertoire = [],
  focus,
  focusSpells,
  extra = {},
}: CasterOptions = {}) {
  return {
    id,
    name,
    level,
    ...(charClass ? { class: charClass } : {}),
    abilities,
    skills,
    spellcasting: {
      tradition: 'occult',
      ability: 'charisma',
      proficiency: 2,
      spells: repertoire.map((spellRef) => ({ spellRef })),
      ...(slots ? { spell_slots: slots } : {}),
      ...(focus ? { focus } : {}),
    },
    ...(focusSpells ? { focus_spells: focusSpells.map((spellRef) => ({ spellRef })) } : {}),
    ...extra,
  };
}

/** Navigate to the character sheet, failing fast on the redirect-to-'/' mode. */
export async function gotoSheet(page: Page, charId: string, charName: string) {
  await page.goto(`/character/${charId}`);
  await expectOnSheet(page, charId);
  await expect(page.getByRole('heading', { name: charName, level: 1 })).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Open the Magic modal (level 1: category grid). The "Cast a Spell" launcher
 * lives in the Segmented Deck's Spells segment, so this switches the sheet's
 * play tab to Encounter and selects the Spells tab first — the seeded active
 * encounter exposes it.
 */
export async function openMagic(page: Page) {
  await page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Encounter', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Spells' }).click();
  await page.getByRole('button', { name: 'Cast a Spell' }).click();
}

/**
 * Level 1 → level 2: pick a category from the grid. The label is what the
 * player sees — 'Spells', 'Focus', a bard's 'Compositions', a staff's name.
 */
export async function openMagicCategory(page: Page, label: string) {
  await page.locator('.magic-category-btn', { hasText: label }).click();
}

/**
 * Level 2 → cast: open the spell's card (data-testid="spell-card"), then press
 * the Cast chip (aria-label "Cast <name>") in the detail modal. Leaves
 * CastSpellModal — or the resolver it routes to by spell id — open; the spec
 * asserts on that modal's own surface.
 */
export async function castSpell(page: Page, spellName: string) {
  // Click the spell NAME, not the card: a center-of-card click can land on a
  // TraitTag chip, which stacks its trait-info modal over the detail modal and
  // intercepts the Cast click. The name bubbles to the card button cleanly.
  await page
    .getByTestId('spell-card')
    .filter({ has: page.locator('.spell-name', { hasText: spellName }) })
    .locator('.spell-name')
    .click();
  await page.getByRole('button', { name: `Cast ${spellName}`, exact: true }).click();
}
