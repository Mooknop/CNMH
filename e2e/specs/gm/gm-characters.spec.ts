/**
 * GM character editor round-trip suite.
 *
 * Covers every CharacterForm subtab: identity/abilities/saves, skills (with
 * untrained-omission invariant), proficiencies (name re-sync), spellcasting
 * (full block: tradition/ability/focus/slots/spells), feats (managed scalars +
 * nested innate JSON), strikes/actions/reactions via master-detail, familiar
 * envelope, and inventory catalog references.
 *
 * Each test resets both DOs, creates a fresh character through the UI, and
 * asserts the saved shape via both the DOM flash and /api/content.
 *
 * Desktop-only: GM Tools has no responsive layout.
 */

import { test, expect } from '../../fixtures/gm';
import { fetchContent, findInCollection } from '../../helpers/content';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function expectSaved(page: import('@playwright/test').Page) {
  await expect(page.getByRole('status')).toContainText('Changes are live', { timeout: 10_000 });
}

/** Navigate to a named subtab within the active character form. */
async function goTab(form: import('@playwright/test').Locator, tabLabel: string) {
  await form.locator('[aria-label="character sections"]').getByRole('button', { name: tabLabel, exact: true }).click();
}

/** Add an entry to an array section via EntryListEditor and wait for the detail pane. */
async function addEntry(form: import('@playwright/test').Locator, sectionKey: string, addLabel: string) {
  await form.getByTestId(`${sectionKey}-add`).click();
  // The new entry is auto-selected; detail pane mounts.
  await expect(form.getByTestId(`${sectionKey}-detail`)).not.toContainText('Select a');
}

/** Click "Create character", wait for flash. Returns slug-derived id. */
async function createChar(form: import('@playwright/test').Locator, page: import('@playwright/test').Page, name: string) {
  await form.getByRole('button', { name: 'Create character' }).click();
  await expectSaved(page);
  // Derive expected id using the same slugify logic (lowercase, non-alnum→'-')
  return name
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Character editor', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  // -------------------------------------------------------------------------
  // 1. Identity, abilities, and saves
  // -------------------------------------------------------------------------

  test('identity fields, ability scores, and saves round-trip', async ({
    page,
    request,
  }) => {
    await page.goto('/gm/characters');
    await page.getByRole('button', { name: '+ New character' }).click();
    const form = page.getByTestId('character-form-new');

    // Stats tab is default; fill all managed scalar fields
    await form.getByLabel('name', { exact: true }).fill('E2E Char Stats');
    await form.getByLabel('ancestry').fill('Elf');
    await form.getByLabel('class').fill('Wizard');
    await form.getByLabel('level').fill('5');
    await form.getByLabel('maxHp').fill('50');
    await form.getByLabel('ac', { exact: true }).fill('18');
    await form.getByLabel('speed').fill('25');

    await form.getByLabel('strength').fill('10');
    await form.getByLabel('dexterity').fill('18');
    await form.getByLabel('constitution').fill('12');
    await form.getByLabel('intelligence').fill('20');
    await form.getByLabel('wisdom').fill('14');
    await form.getByLabel('charisma').fill('10');

    await form.getByLabel('fortitude').fill('10');
    await form.getByLabel('reflex').fill('12');
    await form.getByLabel('will').fill('14');

    const id = await createChar(form, page, 'E2E Char Stats');
    const payload = await fetchContent(request);
    const char = findInCollection(payload, 'character', id);

    expect(char).toMatchObject({
      name: 'E2E Char Stats',
      ancestry: 'Elf',
      class: 'Wizard',
      level: 5,
      maxHp: 50,
      ac: 18,
      speed: 25,
      abilities: { strength: 10, dexterity: 18, constitution: 12, intelligence: 20, wisdom: 14, charisma: 10 },
      saves: { fortitude: 10, reflex: 12, will: 14 },
    });
  });

  // -------------------------------------------------------------------------
  // 2. Skills: untrained entries are omitted; trained + lore persist
  // -------------------------------------------------------------------------

  test('skills omit untrained entries; trained skills and lore persist', async ({
    page,
    request,
  }) => {
    await page.goto('/gm/characters');
    await page.getByRole('button', { name: '+ New character' }).click();
    const form = page.getByTestId('character-form-new');

    await form.getByLabel('name', { exact: true }).fill('E2E Char Skills');

    // Set Acrobatics to Expert (tier 2) and leave all others at 0 (untrained)
    await form.getByLabel('acrobatics').selectOption('2');

    // Add one lore skill
    await form.getByRole('button', { name: 'Add lore' }).click();
    await form.getByLabel('lore-0-name').fill('Library Lore');
    await form.getByLabel('lore-0-proficiency').selectOption('1');

    const id = await createChar(form, page, 'E2E Char Skills');
    const payload = await fetchContent(request);
    const char = findInCollection(payload, 'character', id) as any;

    // Only trained skills appear (proficiency > 0)
    expect(char.skills).toHaveProperty('acrobatics');
    expect(char.skills.acrobatics).toMatchObject({ proficiency: 2 });

    // Untrained skills must be absent (not `{proficiency:0}`)
    expect(char.skills).not.toHaveProperty('athletics');
    expect(char.skills).not.toHaveProperty('perception');

    // Lore entry persists
    expect(char.skills.lore).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Library Lore', proficiency: 1 }),
      ]),
    );
  });

  // -------------------------------------------------------------------------
  // 3. Proficiencies: name is re-synced via getProficiencyLabel on save
  // -------------------------------------------------------------------------

  test('proficiencies block re-syncs name from getProficiencyLabel', async ({
    page,
    request,
  }) => {
    await page.goto('/gm/characters');
    await page.getByRole('button', { name: '+ New character' }).click();
    const form = page.getByTestId('character-form-new');

    await form.getByLabel('name', { exact: true }).fill('E2E Char Prof');
    await goTab(form, 'Proficiencies');

    // Set class proficiency to Expert (tier 2)
    await form.getByLabel('class-proficiency').selectOption('2');
    // Set martial weapons to Trained (tier 1)
    await form.getByLabel('martial').selectOption('1');
    // Set medium armor to Expert (tier 2)
    await form.getByLabel('medium').selectOption('2');

    const id = await createChar(form, page, 'E2E Char Prof');
    const payload = await fetchContent(request);
    const char = findInCollection(payload, 'character', id) as any;

    expect(char.proficiencies.class).toBe(2);
    // Weapons and armor entries carry the resync'd name label
    expect(char.proficiencies.weapons.martial).toMatchObject({ proficiency: 1, name: 'Trained' });
    expect(char.proficiencies.armor.medium).toMatchObject({ proficiency: 2, name: 'Expert' });
  });

  // -------------------------------------------------------------------------
  // 4. Spellcasting: full block (tradition/ability/proficiency/focus/slots/spells)
  // -------------------------------------------------------------------------

  test('spellcasting block saves with slots, focus, and a spell', async ({
    page,
    request,
  }) => {
    await page.goto('/gm/characters');
    await page.getByRole('button', { name: '+ New character' }).click();
    const form = page.getByTestId('character-form-new');

    await form.getByLabel('name', { exact: true }).fill('E2E Char Spells');
    await goTab(form, 'Spellcasting');

    await form.getByRole('button', { name: 'Add spellcasting' }).click();

    await form.getByLabel('sc-tradition').fill('arcane');
    await form.getByLabel('sc-ability').fill('intelligence');
    await form.getByLabel('sc-proficiency').selectOption('3'); // Master
    await form.getByLabel('sc-focus-max').fill('2');
    await form.getByLabel('sc-focus-current').fill('2');

    // Add one slot rank (rank 3, 4 slots)
    await form.getByRole('button', { name: 'Add slot rank' }).click();
    await form.getByLabel('slot-0-level').fill('3');
    await form.getByLabel('slot-0-count').fill('4');

    // Add one spell
    await form.getByRole('button', { name: 'Add spell' }).click();
    await form.getByLabel('spell-0-name').fill('Fireball');
    await form.getByLabel('spell-0-level').fill('3');
    await form.getByLabel('spell-0-range').fill('500 feet');
    await form.getByLabel('spell-0-traits').fill('Fire, Evocation');

    const id = await createChar(form, page, 'E2E Char Spells');
    const payload = await fetchContent(request);
    const char = findInCollection(payload, 'character', id) as any;

    expect(char.spellcasting).toMatchObject({
      tradition: 'arcane',
      ability: 'intelligence',
      proficiency: 3,
      focus: { max: 2, current: 2 },
      spell_slots: { '3': 4 },
    });
    const savedSpell = char.spellcasting.spells[0];
    expect(savedSpell).toMatchObject({ name: 'Fireball', level: 3, range: '500 feet' });
    expect(savedSpell.traits).toEqual(expect.arrayContaining(['Fire', 'Evocation']));
  });

  // -------------------------------------------------------------------------
  // 5. Feats: managed scalars + nested innate spell in raw-JSON body
  // -------------------------------------------------------------------------

  test('feat with innate spell in JSON body round-trips', async ({
    page,
    request,
  }) => {
    await page.goto('/gm/characters');
    await page.getByRole('button', { name: '+ New character' }).click();
    const form = page.getByTestId('character-form-new');

    await form.getByLabel('name', { exact: true }).fill('E2E Char Feats');
    await goTab(form, 'Feats');
    await addEntry(form, 'feats', 'Add feats entry');

    // FeatSubform fields (idPrefix="feats-0")
    await form.getByLabel('feats-0-name').fill('Sorcerous Bloodline');
    await form.getByLabel('feats-0-level').fill('1');
    await form.getByLabel('feats-0-source').fill('Pathfinder Core Rulebook');
    await form.getByLabel('feats-0-traits').fill('Bloodline, Magical');

    // Nested innate spell lives in the raw-JSON box
    const innateJson = JSON.stringify({
      innate: [{ name: 'Ray of Frost', level: 1, description: 'A cold ray.' }],
    });
    await form.getByLabel('feats-0-json').fill(innateJson);

    const id = await createChar(form, page, 'E2E Char Feats');
    const payload = await fetchContent(request);
    const char = findInCollection(payload, 'character', id) as any;

    const feat = char.feats[0];
    expect(feat).toMatchObject({
      name: 'Sorcerous Bloodline',
      level: 1,
      source: 'Pathfinder Core Rulebook',
      traits: expect.arrayContaining(['Bloodline', 'Magical']),
    });
    // Nested innate array from the JSON box must survive
    expect(feat.innate).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Ray of Frost', level: 1 })]),
    );
  });

  // -------------------------------------------------------------------------
  // 6. Strikes, Actions, and Reactions via master-detail
  // -------------------------------------------------------------------------

  test('strike, action, and reaction entries save with correct cost fields', async ({
    page,
    request,
  }) => {
    await page.goto('/gm/characters');
    await page.getByRole('button', { name: '+ New character' }).click();
    const form = page.getByTestId('character-form-new');

    await form.getByLabel('name', { exact: true }).fill('E2E Char Combat');

    // --- Strike (1-action cost) ---
    await goTab(form, 'Strikes');
    await addEntry(form, 'strikes', 'Add strikes entry');
    await form.getByLabel('strikes-0-name').fill('E2E Sword Strike');
    await form.getByLabel('strikes-0-cost').selectOption('1');
    await form.getByLabel('strikes-0-damage').fill('1d6 S');

    // --- Action (2-action cost) ---
    await goTab(form, 'Actions');
    await addEntry(form, 'actions', 'Add actions entry');
    await form.getByLabel('actions-0-name').fill('E2E Big Action');
    await form.getByLabel('actions-0-cost').selectOption('2');
    await form.getByLabel('actions-0-traits').fill('Manipulate');

    // --- Reaction (default cost is already R) ---
    await goTab(form, 'Reactions');
    await addEntry(form, 'reactions', 'Add reactions entry');
    await form.getByLabel('reactions-0-name').fill('E2E Counter');
    // Default cost is Reaction (R); check it saved that way without changing it
    await form.getByLabel('reactions-0-trigger').fill('An enemy attacks an ally adjacent to you.');

    const id = await createChar(form, page, 'E2E Char Combat');
    const payload = await fetchContent(request);
    const char = findInCollection(payload, 'character', id) as any;

    // Strike: costFromForm emits actionCount:1
    expect(char.strikes[0]).toMatchObject({ name: 'E2E Sword Strike', actionCount: 1, damage: '1d6 S' });

    // Action: costFromForm emits actionCount:2
    expect(char.actions[0]).toMatchObject({ name: 'E2E Big Action', actionCount: 2 });
    expect(char.actions[0].traits).toEqual(expect.arrayContaining(['Manipulate']));

    // Reaction: costFromForm emits actions:'Reaction'
    expect(char.reactions[0]).toMatchObject({
      name: 'E2E Counter',
      actions: 'Reaction',
      trigger: 'An enemy attacks an ally adjacent to you.',
    });
  });

  // -------------------------------------------------------------------------
  // 7. Familiar: managed envelope with one ability
  // -------------------------------------------------------------------------

  test('familiar envelope with ability row round-trips', async ({
    page,
    request,
  }) => {
    await page.goto('/gm/characters');
    await page.getByRole('button', { name: '+ New character' }).click();
    const form = page.getByTestId('character-form-new');

    await form.getByLabel('name', { exact: true }).fill('E2E Char Familiar');
    await goTab(form, 'Familiar');

    await form.getByRole('button', { name: 'Add familiar' }).click();
    await expect(form.getByTestId('familiar-familiar')).toBeVisible();

    await form.getByLabel('familiar-name').fill('Pip');
    await form.getByLabel('familiar-type').fill('Toad');
    await form.getByLabel('familiar-ac').fill('15');
    await form.getByLabel('familiar-hp').fill('5');
    await form.getByLabel('familiar-speed').fill('20');

    // Add an ability row
    await form.getByRole('button', { name: 'Add ability' }).click();
    await form.getByLabel('familiar-ability-0-name').fill('Darkvision');
    await form.getByLabel('familiar-ability-0-description').fill('See in the dark.');

    const id = await createChar(form, page, 'E2E Char Familiar');
    const payload = await fetchContent(request);
    const char = findInCollection(payload, 'character', id) as any;

    expect(char.familiar).toMatchObject({
      name: 'Pip',
      type: 'Toad',
      ac: 15,
      hp: 5,
      speed: '20',
    });
    expect(char.familiar.abilities[0]).toMatchObject({
      name: 'Darkvision',
      description: 'See in the dark.',
    });
  });

  // -------------------------------------------------------------------------
  // 8. Inventory: catalog reference saves as {ref, quantity}
  // -------------------------------------------------------------------------

  test('inventory catalog ref saves as {ref, quantity}', async ({
    page,
    request,
    seed,
  }) => {
    await seed({
      item: [{ id: 'e2e-longsword', name: 'E2E Longsword', weight: 1, price: 1 }],
    });

    await page.goto('/gm/characters');
    await page.getByRole('button', { name: '+ New character' }).click();
    const form = page.getByTestId('character-form-new');

    await form.getByLabel('name', { exact: true }).fill('E2E Char Inventory');
    await goTab(form, 'Inventory');

    // Open catalog picker
    await form.getByRole('button', { name: 'Add item' }).click();
    const picker = page.locator('.modal-container');
    await expect(picker).toBeVisible();

    // Select the seeded item
    await picker.locator('[aria-label="catalog results"]').getByRole('button', { name: 'E2E Longsword' }).click();
    await picker.getByRole('button', { name: 'Add selected' }).click();

    // Picker closes; item row appears
    await expect(form.getByTestId('item-0')).toBeVisible();

    const id = await createChar(form, page, 'E2E Char Inventory');
    const payload = await fetchContent(request);
    const char = findInCollection(payload, 'character', id) as any;

    expect(char.inventory[0]).toMatchObject({ ref: 'e2e-longsword', quantity: 1 });
    expect(char.inventory[0].uid).toBeTruthy(); // uid was minted on save
  });
});
