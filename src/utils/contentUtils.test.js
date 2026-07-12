import {
  slugify,
  withQuestId,
  normalizeQuests,
  withFactionId,
  normalizeFactions,
  withCalendarId,
  normalizeCalendar,
  withLoreId,
  normalizeLore,
  withTraitId,
  normalizeTraits,
  withCharacterId,
  normalizeCharacters,
  withItemId,
  normalizeItems,
  itemCatalogMap,
  normalizeRunes,
  mergeArmorRunes,
  runeCatalogMap,
  withSpellId,
  normalizeSpells,
  spellCatalogMap,
  resolveFocusSpells,
  resolveRepertoireSpells,
  resolveInnateSpells,
  repointFocusSpells,
  applyVariant,
  resolveInventoryItem,
  resolveInventory,
  resolveCraftingRecipes,
  resolveCharacterItems,
  existingIdSet,
  defaultContent,
  buildSeedPayload,
  DEFAULT_THEME,
  normalizeTheme,
} from './contentUtils';
import { calculateItemsBulk } from './InventoryUtils';
import {
  findScrollItems,
  findWandItems,
  extractScrollSpells,
  extractWandSpells,
} from './SpellUtils';

describe('contentUtils', () => {
  describe('slugify', () => {
    it('kebab-cases and strips punctuation', () => {
      expect(slugify("Deliver Uncle Milton's Package")).toBe('deliver-uncle-miltons-package');
    });
    it('falls back to "untitled" for empty input', () => {
      expect(slugify('')).toBe('untitled');
      expect(slugify(null)).toBe('untitled');
      expect(slugify('   ***   ')).toBe('untitled');
    });
  });

  describe('existingIdSet', () => {
    it('builds a string Set of ids and tolerates non-arrays', () => {
      const s = existingIdSet([{ id: 'a' }, { id: 1 }]);
      expect(s.has('a')).toBe(true);
      expect(s.has('1')).toBe(true);
      expect(existingIdSet(null).size).toBe(0);
    });
  });

  describe('withQuestId', () => {
    it('derives an id from the title when missing and indexes notes', () => {
      const q = withQuestId({ title: 'Find the Orb', notes: [{ content: 'a' }, { content: 'b' }] });
      expect(q.id).toBe('find-the-orb');
      expect(q.notes).toEqual([
        { id: 'find-the-orb-note-0', content: 'a' },
        { id: 'find-the-orb-note-1', content: 'b' },
      ]);
    });
    it('preserves an existing id and suffixes by index for duplicates', () => {
      expect(withQuestId({ id: 'keep', title: 'X' }).id).toBe('keep');
      expect(withQuestId({ title: 'Dup' }, 2).id).toBe('dup-2');
    });
    it('tolerates a missing notes array', () => {
      expect(withQuestId({ title: 'No Notes' }).notes).toEqual([]);
    });
  });

  describe('normalizeQuests', () => {
    it('maps an array and tolerates non-arrays', () => {
      expect(normalizeQuests([{ title: 'A' }]).map((q) => q.id)).toEqual(['a']);
      expect(normalizeQuests(null)).toEqual([]);
    });
  });

  describe('withFactionId / normalizeFactions', () => {
    it('derives an id from the name and indexes ranks', () => {
      const f = withFactionId({
        name: 'The Bunyip Club',
        reputation: -4,
        ranks: [{ name: 'Liked', min: 5, max: 14, effect: '10% discount' }],
      });
      expect(f.id).toBe('the-bunyip-club');
      expect(f.ranks[0]).toEqual({
        id: 'the-bunyip-club-rank-0',
        name: 'Liked',
        min: 5,
        max: 14,
        effect: '10% discount',
      });
    });
    it('omits effect when absent and tolerates missing ranks / preserves id', () => {
      const f = withFactionId({ id: 'keep', name: 'X' });
      expect(f.id).toBe('keep');
      expect(f.ranks).toEqual([]);
      const r = withFactionId({ name: 'Y', ranks: [{ name: 'Z', min: 0, max: 1 }] }).ranks[0];
      expect(r.effect).toBeUndefined();
      expect(normalizeFactions(null)).toEqual([]);
    });
  });

  describe('withCalendarId / normalizeCalendar', () => {
    it('derives an id from title or name and preserves all other fields', () => {
      const fixed = withCalendarId({
        title: 'Xar-Azmak Defeated',
        date: { year: 4724, month: 8, day: 1 },
        type: 'campaign',
      });
      expect(fixed.id).toBe('xar-azmak-defeated');
      expect(fixed.date).toEqual({ year: 4724, month: 8, day: 1 });

      const named = withCalendarId({ name: 'Longnight', recurring: 'every new moon' });
      expect(named.id).toBe('longnight');
      expect(named.recurring).toBe('every new moon');
    });
    it('keeps an existing id and tolerates non-arrays', () => {
      expect(withCalendarId({ id: 'keep', title: 'X' }).id).toBe('keep');
      expect(normalizeCalendar(null)).toEqual([]);
    });
  });

  describe('withLoreId / normalizeLore', () => {
    it('keeps an existing id and preserves all fields', () => {
      const e = withLoreId({ id: 'sandpoint', title: 'Sandpoint', category: 'Location', related: ['magnimar'] });
      expect(e.id).toBe('sandpoint');
      expect(e.category).toBe('Location');
      expect(e.related).toEqual(['magnimar']);
    });
    it('derives an id from the title when missing and tolerates non-arrays', () => {
      expect(withLoreId({ title: 'The Lost Coast' }).id).toBe('the-lost-coast');
      expect(normalizeLore(null)).toEqual([]);
    });
    it('preserves the containment parent field', () => {
      expect(withLoreId({ id: 'cathedral', title: 'Cathedral', parent: 'sandpoint' }).parent).toBe('sandpoint');
    });
    it('defaults visibility to gm; only an explicit revealed passes through', () => {
      expect(withLoreId({ id: 'a', title: 'A' }).visibility).toBe('gm');
      expect(withLoreId({ id: 'b', title: 'B', visibility: 'revealed' }).visibility).toBe('revealed');
      expect(withLoreId({ id: 'c', title: 'C', visibility: 'public' }).visibility).toBe('gm');
    });
  });

  describe('withTraitId / normalizeTraits', () => {
    it('slugs the trait name and preserves description', () => {
      const t = withTraitId({ name: 'Agile', description: 'Lower MAP.' });
      expect(t.id).toBe('agile');
      expect(t.description).toBe('Lower MAP.');
      expect(normalizeTraits(null)).toEqual([]);
    });
  });

  describe('withCharacterId / normalizeCharacters', () => {
    it('keeps an existing id and preserves the whole nested sheet', () => {
      const c = withCharacterId({
        id: 'Pellias',
        name: 'Pellias',
        abilities: { strength: 18 },
        spells: { focus: [] },
      });
      expect(c.id).toBe('Pellias');
      expect(c.abilities).toEqual({ strength: 18 });
      expect(c.spells).toEqual({ focus: [] });
    });
    it('derives an id from the name when missing and tolerates non-arrays', () => {
      expect(withCharacterId({ name: 'New Hero' }).id).toBe('new-hero');
      expect(normalizeCharacters(null)).toEqual([]);
    });
  });

  describe('DEFAULT_THEME / normalizeTheme', () => {
    it('DEFAULT_THEME has the expected ember palette', () => {
      expect(DEFAULT_THEME.id).toBe('campaign');
      expect(DEFAULT_THEME.preset).toBe('ember');
      expect(DEFAULT_THEME.palette.accent).toBe('#c0440e');
      expect(DEFAULT_THEME.accentOverrides).toEqual({});
    });

    it('returns DEFAULT_THEME when the list is empty', () => {
      expect(normalizeTheme([])).toEqual(DEFAULT_THEME);
    });

    it('returns DEFAULT_THEME when the list is not an array', () => {
      expect(normalizeTheme(null)).toEqual(DEFAULT_THEME);
      expect(normalizeTheme(undefined)).toEqual(DEFAULT_THEME);
    });

    it('returns DEFAULT_THEME when no campaign doc is present', () => {
      expect(normalizeTheme([{ id: 'other' }])).toEqual(DEFAULT_THEME);
    });

    it('merges a partial palette over the defaults', () => {
      const theme = normalizeTheme([{
        id: 'campaign',
        preset: 'custom',
        palette: { accent: '#ff0000' },
      }]);
      expect(theme.palette.accent).toBe('#ff0000');
      expect(theme.palette.gold).toBe(DEFAULT_THEME.palette.gold);
      expect(theme.preset).toBe('custom');
    });

    it('merges accentOverrides', () => {
      const theme = normalizeTheme([{
        id: 'campaign',
        accentOverrides: { pellias: '#aabbcc' },
      }]);
      expect(theme.accentOverrides.pellias).toBe('#aabbcc');
    });

    it('defaults accentOverrides to {} when absent', () => {
      const theme = normalizeTheme([{ id: 'campaign' }]);
      expect(theme.accentOverrides).toEqual({});
    });
  });

  describe('defaultContent / buildSeedPayload', () => {
    const KEYS = ['quest', 'faction', 'calendar', 'lore', 'trait', 'character'];
    it('exposes every managed collection, all with ids', () => {
      const dc = defaultContent();
      for (const key of KEYS) {
        expect(dc[key].length).toBeGreaterThan(0);
        expect(dc[key].every((d) => typeof d.id === 'string' && d.id.length > 0)).toBe(true);
      }
    });
    it('wraps defaults with the force flag', () => {
      expect(buildSeedPayload().force).toBe(false);
      expect(buildSeedPayload(true).force).toBe(true);
      for (const key of KEYS) {
        expect(buildSeedPayload().collections[key].length).toBeGreaterThan(0);
      }
    });
    it('never seeds capture-only collections — a force reseed must not wipe the bestiary (#760)', () => {
      // defaultContent still exposes the shape, but the seed payload omits it so
      // a force reseed never asks the DO to touch the runtime-captured monsters.
      expect(defaultContent()).toHaveProperty('monster');
      expect(buildSeedPayload().collections).not.toHaveProperty('monster');
      expect(buildSeedPayload(true).collections).not.toHaveProperty('monster');
    });
    it('exposes the item catalog (possibly empty pre-Slice-3) as an array of id-bearing docs', () => {
      const dc = defaultContent();
      expect(Array.isArray(dc.item)).toBe(true);
      expect(dc.item.every((d) => typeof d.id === 'string' && d.id.length > 0)).toBe(true);
      expect(Array.isArray(buildSeedPayload().collections.item)).toBe(true);
    });
    it('exposes the spell catalog as an array of id-bearing docs', () => {
      const dc = defaultContent();
      expect(Array.isArray(dc.spell)).toBe(true);
      expect(dc.spell.length).toBeGreaterThan(0);
      expect(dc.spell.every((d) => typeof d.id === 'string' && d.id.length > 0)).toBe(true);
      expect(Array.isArray(buildSeedPayload().collections.spell)).toBe(true);
    });
    it('bootstrap-seeds the property-rune catalog with Vitalizing (#548)', () => {
      const dc = defaultContent();
      expect(Array.isArray(dc.rune)).toBe(true);
      expect(dc.rune.every((d) => typeof d.id === 'string' && d.id.length > 0)).toBe(true);
      expect(dc.rune.find((r) => r.id === 'vitalizing')).toMatchObject({ type: 'property', name: 'Vitalizing' });
      expect(Array.isArray(buildSeedPayload().collections.rune)).toBe(true);
    });
    it('normalizeRunes fills id + default type', () => {
      const [r] = normalizeRunes([{ name: 'Frost', rider: { persistent: '1d6', damageType: 'cold' } }]);
      expect(r.id).toBe('frost');
      expect(r.type).toBe('property');
    });
    it('mergeArmorRunes folds the armor-rune seed into the rune list', () => {
      const merged = mergeArmorRunes([{ id: 'vitalizing', type: 'property' }]);
      const ids = merged.map((r) => r.id);
      expect(ids).toContain('vitalizing'); // existing weapon rune kept
      expect(ids).toContain('slick'); // armor seed merged in
      expect(merged.find((r) => r.id === 'slick').armorRune).toBe(true);
    });
    it('mergeArmorRunes lets a DO-authored override win over the seed', () => {
      const override = { id: 'slick', name: 'Custom Slick', armorRune: true };
      const merged = mergeArmorRunes([override]);
      expect(merged.filter((r) => r.id === 'slick')).toHaveLength(1);
      expect(merged.find((r) => r.id === 'slick').name).toBe('Custom Slick');
    });
    it('defaultContent.rune carries the armor runes', () => {
      expect(defaultContent().rune.some((r) => r.id === 'shadow' && r.armorRune)).toBe(true);
    });
    it('includes the theme collection with the default campaign doc', () => {
      const dc = defaultContent();
      expect(Array.isArray(dc.theme)).toBe(true);
      expect(dc.theme.length).toBe(1);
      expect(dc.theme[0].id).toBe('campaign');
    });
  });

  describe('withItemId / normalizeItems', () => {
    it('slugs the item name and preserves the definition', () => {
      const it = withItemId({
        name: 'Minor Elixir of Life',
        price: 3,
        weight: 0.1,
        traits: ['Alchemical', 'Healing'],
      });
      expect(it.id).toBe('minor-elixir-of-life');
      expect(it.price).toBe(3);
      expect(it.traits).toEqual(['Alchemical', 'Healing']);
    });
    it('keeps an existing id, indexes duplicates, tolerates non-arrays', () => {
      expect(withItemId({ id: 'keep', name: 'X' }).id).toBe('keep');
      expect(withItemId({ name: 'Dup' }, 2).id).toBe('dup-2');
      expect(normalizeItems(null)).toEqual([]);
    });
  });

  describe('itemCatalogMap', () => {
    it('indexes by string id and tolerates non-arrays', () => {
      const m = itemCatalogMap([{ id: 'a', name: 'A' }, { id: 1, name: 'One' }]);
      expect(m.get('a').name).toBe('A');
      expect(m.get('1').name).toBe('One');
      expect(itemCatalogMap(null).size).toBe(0);
    });
  });

  describe('resolveInventoryItem', () => {
    const catalog = itemCatalogMap([
      { id: 'elixir', name: 'Minor Elixir of Life', price: 3, weight: 0.1, traits: ['Healing'] },
      { id: 'backpack', name: 'Backpack', weight: 0.1, container: { capacity: 4, ignored: 2 } },
      {
        id: 'scroll-friendfetch',
        name: 'Scroll of Friendfetch',
        price: 4,
        weight: 0,
        scroll: { spellRef: 'friendfetch' },
      },
      {
        id: 'wand-cleanse',
        name: 'Wand of Cleanse Affliction',
        price: 160,
        weight: 0.1,
        wand: { spellRef: 'cleanse-affliction' },
      },
    ]);
    const inventorySpellMap = spellCatalogMap([
      { id: 'friendfetch', name: 'Friendfetch', level: 1, traits: ['Force'], description: 'Pull a creature.' },
      { id: 'cleanse-affliction', name: 'Cleanse Affliction', level: 2, description: 'Reduce an affliction stage.' },
    ]);

    it('passes a legacy inline item through unchanged', () => {
      const inline = { name: 'Bespoke Sword', weight: 1, quantity: 1, runes: ['+1'] };
      expect(resolveInventoryItem(inline, catalog)).toEqual(inline);
    });

    it('recurses into an inline container, resolving refs nested inside it', () => {
      const inlineContainer = {
        name: 'Sack',
        weight: 0,
        container: { capacity: 2, ignored: 0, contents: [{ ref: 'elixir', quantity: 2 }] },
      };
      const out = resolveInventoryItem(inlineContainer, catalog);
      expect(out.container.contents[0].name).toBe('Minor Elixir of Life');
      expect(out.container.contents[0].quantity).toBe(2);
    });

    it('inlines runes.property ids against the rune catalog (#548)', () => {
      const vit = {
        id: 'vitalizing', name: 'Vitalizing', price: 150,
        rider: { vsTrait: 'undead', persistent: '1d6', damageType: 'vitality' },
      };
      const runeMap = runeCatalogMap([vit]);
      const weaponCatalog = itemCatalogMap([
        { id: 'axe', name: 'Greataxe', price: 35, strikes: { type: 'melee', damage: '1d12' }, runes: { potency: 2, property: ['vitalizing'] } },
      ]);
      const out = resolveInventoryItem({ ref: 'axe', quantity: 1 }, weaponCatalog, undefined, undefined, runeMap);
      expect(out.runes.property).toEqual([vit]);
      expect(out.runes.potency).toBe(2); // other rune keys preserved
    });

    it('overlays a rune block carried on the ENTRY onto the base item, then inlines it (#1138)', () => {
      // A Sale Shelf rune item lands as a minimal ref entry carrying its runes;
      // resolveInventoryItem overlays them so finishItem inlines the property ref.
      const flaming = { id: 'flaming', name: 'Flaming', type: 'property', target: 'weapon', price: 500 };
      const runeMap = runeCatalogMap([flaming]);
      const weaponCatalog = itemCatalogMap([{ id: 'longsword', name: 'Longsword', price: 15, strikes: { type: 'melee', damage: '1d8' } }]);
      const out = resolveInventoryItem(
        { ref: 'longsword', runes: { potency: 1, striking: 'striking', property: ['flaming'] }, uid: 'u1' },
        weaponCatalog, undefined, undefined, runeMap
      );
      expect(out.runes.potency).toBe(1);
      expect(out.runes.striking).toBe('striking');
      expect(out.runes.property).toEqual([flaming]); // inlined from the id
      expect(out.name).toBe('Longsword'); // base name kept — display derives the runed name
    });

    it('overlays a dragonbreath template carried on the ENTRY onto the base weapon (#1210 M4g)', () => {
      // A GM-looted / bought dragonbreath weapon lands as a lean ref entry
      // carrying only { tier, dragonType }; resolveInventoryItem must overlay it
      // onto the base so the resolver (isDragonbreath) fires downstream.
      const weaponCatalog = itemCatalogMap([{ id: 'longsword', name: 'Longsword', price: 15, strikes: { type: 'melee', damage: '1d8' } }]);
      const out = resolveInventoryItem(
        { ref: 'longsword', dragonbreath: { tier: 'greater', dragonType: 'Red' }, uid: 'u1' },
        weaponCatalog
      );
      expect(out.dragonbreath).toEqual({ tier: 'greater', dragonType: 'Red' });
      expect(out.name).toBe('Longsword'); // base name kept — display derives the templated name
      expect(out.uid).toBe('u1');
    });

    it('overlays entry runes onto a graded ring variant, keeping its grade name (#1138)', () => {
      const spellstoring = { id: 'spellstoring', name: 'Spellstoring', type: 'property', target: 'ring', price: 2700 };
      const runeMap = runeCatalogMap([spellstoring]);
      const ringCatalog = itemCatalogMap([{
        id: 'power-ring', name: 'Power Ring', powerRing: true,
        variants: [{ level: 5, name: 'Power Ring (Iron)', price: 125 }, { level: 11, name: 'Power Ring (Silver)', price: 1400 }],
      }]);
      const out = resolveInventoryItem(
        { ref: 'power-ring', level: 5, runes: { property: ['spellstoring'] }, uid: 'u1' },
        ringCatalog, undefined, undefined, runeMap
      );
      expect(out.name).toBe('Power Ring (Iron)'); // grade variant applied first
      expect(out.price).toBe(125);
      expect(out.runes.property).toEqual([spellstoring]); // then runes overlaid + inlined
    });

    it('drops a dangling rune ref (#548)', () => {
      const weaponCatalog = itemCatalogMap([
        { id: 'axe', name: 'Greataxe', runes: { property: ['nope'] } },
      ]);
      const out = resolveInventoryItem({ ref: 'axe' }, weaponCatalog, undefined, undefined, runeCatalogMap([]));
      expect(out.runes.property).toEqual([]);
    });

    it('inlines a runes.accessory id against the rune catalog (#1033)', () => {
      const menacing = {
        id: 'menacing', name: 'Menacing', type: 'property', target: 'accessory',
        price: 50, usage: ['clothing'],
        modifiers: [{ stat: 'intimidation', kind: 'item', amount: 1 }],
      };
      const runeMap = runeCatalogMap([menacing]);
      const cloakCatalog = itemCatalogMap([
        { id: 'cloak', name: 'Cloak', price: 2, accessoryTags: ['clothing'], runes: { accessory: 'menacing' } },
      ]);
      const out = resolveInventoryItem({ ref: 'cloak', quantity: 1 }, cloakCatalog, undefined, undefined, runeMap);
      expect(out.runes.accessory).toEqual(menacing);
    });

    it('leaves a dangling accessory ref as the string (slot occupied, no doc) (#1033)', () => {
      const cloakCatalog = itemCatalogMap([
        { id: 'cloak', name: 'Cloak', runes: { accessory: 'nope' } },
      ]);
      const out = resolveInventoryItem({ ref: 'cloak' }, cloakCatalog, undefined, undefined, runeCatalogMap([]));
      expect(out.runes.accessory).toBe('nope');
    });

    it('inlines an entry augmentation ref against the item catalog (#1202)', () => {
      const catalog = itemCatalogMap([
        { id: 'targe', name: 'Targe', shield: { bonus: 1 }, weight: 0.1 },
        { id: 'mirror', type: 'augmentation', augTarget: ['shield'], name: 'Mirror', price: 1, description: 'A simple hand mirror.' },
      ]);
      const out = resolveInventoryItem({ ref: 'targe', augmentation: { ref: 'mirror' }, uid: 'u1' }, catalog);
      expect(out.augmentation.name).toBe('Mirror');
      expect(out.augmentation.price).toBe(1);
      expect(out.name).toBe('Targe'); // host name unchanged
    });

    it('carries an augmentation choice through, and leaves a dangling ref intact (#1202)', () => {
      const catalog = itemCatalogMap([
        { id: 'targe', name: 'Targe', shield: { bonus: 1 }, weight: 0.1 },
        { id: 'ancestral-predator', type: 'augmentation', augTarget: ['shield'], name: 'Ancestral Predator' },
      ]);
      const chosen = resolveInventoryItem(
        { ref: 'targe', augmentation: { ref: 'ancestral-predator', choice: 'Dragon' } }, catalog);
      expect(chosen.augmentation.name).toBe('Ancestral Predator');
      expect(chosen.augmentation.choice).toBe('Dragon');
      const dangling = resolveInventoryItem({ ref: 'targe', augmentation: { ref: 'nope' } }, catalog);
      expect(dangling.augmentation).toEqual({ ref: 'nope' }); // unresolved ref stays as-is
    });

    it('routes a runestone ref through the rune catalog, inert (#800)', () => {
      const runeMap = runeCatalogMap([{ id: 'flaming', name: 'Flaming', price: 500 }]);
      const out = resolveInventoryItem(
        { ref: 'runestone', runeRef: 'flaming', uid: 'u1', quantity: 1 },
        itemCatalogMap([]), // not in the item catalog — resolved from the rune map
        undefined,
        undefined,
        runeMap,
      );
      expect(out.name).toBe('Flaming Runestone');
      expect(out.price).toBe(503);
      expect(out.runestone.rune.id).toBe('flaming');
      expect(out.strikes).toBeUndefined();
      expect(out.runes).toBeUndefined();
    });

    it('routes a treasure-item ref through the treasure resolver, overrides folded in', () => {
      const treasureCatalog = itemCatalogMap([
        { id: 'treasure-item', name: 'Treasure', weight: 0, image: 'img_t.jpg' },
      ]);
      const out = resolveInventoryItem(
        { ref: 'treasure-item', name: 'Garnet Beads', value: 5, quantity: 10 },
        treasureCatalog,
      );
      expect(out.name).toBe('Garnet Beads');
      expect(out.price).toBe(5); // value → price
      expect(out.quantity).toBe(10);
      expect(out.image).toBe('img_t.jpg'); // inherited base art
      expect(out.strikes).toBeUndefined();
    });

    it('merges a ref over its catalog definition with per-character scalars', () => {
      const out = resolveInventoryItem({ ref: 'elixir', quantity: 2, invested: true }, catalog);
      expect(out).toMatchObject({
        name: 'Minor Elixir of Life',
        price: 3,
        weight: 0.1,
        traits: ['Healing'],
        quantity: 2,
        invested: true,
        id: 'elixir',
      });
    });

    it('defaults quantity to 1 and id to the catalog id; omits invested when absent', () => {
      const out = resolveInventoryItem({ ref: 'elixir' }, catalog);
      expect(out.quantity).toBe(1);
      expect(out.id).toBe('elixir');
      expect('invested' in out).toBe(false);
    });

    it('honours an explicit per-character id over the catalog id', () => {
      expect(resolveInventoryItem({ ref: 'elixir', id: 'inv-7' }, catalog).id).toBe('inv-7');
    });

    it('yields a visible weightless stub for a dangling ref (bulk stays finite)', () => {
      const out = resolveInventoryItem({ ref: 'ghost', quantity: 3 }, catalog);
      expect(out).toEqual({ name: '(unknown item: ghost)', weight: 0, quantity: 3 });
      expect(Number.isFinite(calculateItemsBulk([out]))).toBe(true);
    });

    it('keeps a container catalog\'s intrinsic capacity/ignored and takes contents from the ref', () => {
      const out = resolveInventoryItem(
        { ref: 'backpack', container: { contents: [{ ref: 'elixir', quantity: 5 }] } },
        catalog
      );
      expect(out.container.capacity).toBe(4);
      expect(out.container.ignored).toBe(2);
      expect(out.container.contents).toHaveLength(1);
      expect(out.container.contents[0].name).toBe('Minor Elixir of Life');
      expect(out.container.contents[0].quantity).toBe(5);
    });

    it('treats a container ref with no contents as empty', () => {
      expect(resolveInventoryItem({ ref: 'backpack' }, catalog).container.contents).toEqual([]);
    });

    it('preserves nested scroll/wand spell blocks so SpellUtils still detects them', () => {
      const scroll = resolveInventoryItem({ ref: 'scroll-friendfetch', quantity: 2 }, catalog, inventorySpellMap);
      const wand = resolveInventoryItem({ ref: 'wand-cleanse' }, catalog, inventorySpellMap);
      expect(scroll.scroll.name).toBe('Friendfetch');
      expect(wand.wand.name).toBe('Cleanse Affliction');

      const character = { inventory: [scroll, wand] };
      expect(findScrollItems(character)).toHaveLength(1);
      expect(findWandItems(character)).toHaveLength(1); // name "Wand of ..." survives the heuristic
      expect(extractScrollSpells(findScrollItems(character))[0]).toMatchObject({
        name: 'Friendfetch',
        fromScroll: true,
        scrollName: 'Scroll of Friendfetch',
      });
      expect(extractWandSpells(findWandItems(character))[0]).toMatchObject({
        name: 'Cleanse Affliction',
        fromWand: true,
        wandName: 'Wand of Cleanse Affliction',
      });
    });

    // #936 — a resolved scroll/wand inherits the magic-scroll / magic-wand base
    // item's art when it authored none; an item's own image wins.
    it('inherits the base scroll/wand image, author image wins', () => {
      const artCatalog = itemCatalogMap([
        { id: 'magic-scroll', name: 'Magic Scroll', image: 'img_scroll.jpg', imagePosition: { x: 10, y: 20 } },
        { id: 'magic-wand', name: 'Magic Wand', image: 'img_wand.jpg' },
        { id: 'scroll-friendfetch', name: 'Scroll of Friendfetch', scroll: { spellRef: 'friendfetch' } },
        { id: 'wand-cleanse', name: 'Wand of Cleanse Affliction', wand: { spellRef: 'cleanse-affliction' } },
        { id: 'fancy-scroll', name: 'Fancy Scroll', image: 'img_own.jpg', scroll: { spellRef: 'friendfetch' } },
      ]);

      const scroll = resolveInventoryItem({ ref: 'scroll-friendfetch' }, artCatalog, inventorySpellMap);
      expect(scroll.image).toBe('img_scroll.jpg');
      expect(scroll.imagePosition).toEqual({ x: 10, y: 20 });

      const wand = resolveInventoryItem({ ref: 'wand-cleanse' }, artCatalog, inventorySpellMap);
      expect(wand.image).toBe('img_wand.jpg');
      expect(wand.imagePosition).toBeUndefined(); // base set none

      // Author override: the item's own image is kept, not the base's.
      const fancy = resolveInventoryItem({ ref: 'fancy-scroll' }, artCatalog, inventorySpellMap);
      expect(fancy.image).toBe('img_own.jpg');
    });

    it('leaves the image unset when no base item carries one', () => {
      const scroll = resolveInventoryItem({ ref: 'scroll-friendfetch' }, catalog, inventorySpellMap);
      expect(scroll.image).toBeUndefined();
    });
  });

  describe('resolveInventory / resolveCharacterItems', () => {
    const items = [
      { id: 'rope', name: 'Rope (50 ft.)', weight: 1 },
      { id: 'torch', name: 'Torch', weight: 0.1 },
      { id: 'backpack', name: 'Backpack', weight: 0.1, container: { capacity: 4, ignored: 2 } },
    ];

    it('maps a list and tolerates non-arrays', () => {
      expect(resolveInventory(null, itemCatalogMap(items))).toEqual([]);
      expect(resolveInventory([{ ref: 'rope' }], itemCatalogMap(items))[0].name).toBe('Rope (50 ft.)');
    });

    it('leaves a character with no inventory array untouched and passes non-objects through', () => {
      const noInv = { id: 'x', name: 'X', abilities: { strength: 10 } };
      expect(resolveCharacterItems(noInv, items)).toBe(noInv);
      expect(resolveCharacterItems(null, items)).toBe(null);
    });

    it('golden bulk parity: a ref inventory resolves to the same bulk as the equivalent inline inventory', () => {
      const inlineInventory = [
        { name: 'Torch', weight: 0.1, quantity: 3 },
        {
          name: 'Backpack',
          weight: 0.1,
          quantity: 1,
          container: {
            capacity: 4,
            ignored: 2,
            contents: [
              { name: 'Rope (50 ft.)', weight: 1, quantity: 1 },
              { name: 'Torch', weight: 0.1, quantity: 2 },
            ],
          },
        },
      ];
      const refInventory = [
        { ref: 'torch', quantity: 3 },
        {
          ref: 'backpack',
          quantity: 1,
          container: {
            contents: [
              { ref: 'rope', quantity: 1 },
              { ref: 'torch', quantity: 2 },
            ],
          },
        },
      ];
      const resolved = resolveCharacterItems({ inventory: refInventory }, items).inventory;
      expect(calculateItemsBulk(resolved)).toBe(calculateItemsBulk(inlineInventory));
    });

    describe('trained[] fold (#1191 S2)', () => {
      const stanceFeat = {
        name: 'Tiger Stance',
        level: 1,
        actions: [{ name: 'Tiger Stance', actionCount: 1, traits: ['Monk', 'Stance'] }],
        strikes: [{ name: 'Tiger Claw', damage: '1d8' }],
      };
      const blockReaction = { name: 'Shield Block', trigger: 'While raised…', description: '…' };

      it('folds feat-kind grants into feats and reaction-kind into reactions', () => {
        const doc = {
          id: 'c1',
          feats: [{ name: 'Authored Feat' }],
          reactions: [{ name: 'Authored Reaction' }],
          trained: [
            { kind: 'feat', feat: stanceFeat, vendorId: 'v', offeringId: 'o', grantedAt: 1 },
            { kind: 'reaction', reaction: blockReaction, vendorId: 'v', offeringId: 'o2', grantedAt: 2 },
          ],
        };
        const out = resolveCharacterItems(doc, items);
        expect(out.feats.map((f) => f.name)).toEqual(['Authored Feat', 'Tiger Stance']);
        expect(out.feats[1].strikes).toEqual(stanceFeat.strikes);
        expect(out.reactions.map((r) => r.name)).toEqual(['Authored Reaction', 'Shield Block']);
        // raw grants stay on the doc (GM editor reads rawCharacters anyway)
        expect(out.trained).toHaveLength(2);
      });

      it('creates the target arrays when the doc has none', () => {
        const out = resolveCharacterItems(
          { id: 'c1', trained: [{ kind: 'reaction', reaction: blockReaction }] },
          items,
        );
        expect(out.reactions).toEqual([blockReaction]);
        expect(out.feats).toBeUndefined();
      });

      it('ignores malformed entries and leaves a doc without trained untouched', () => {
        const out = resolveCharacterItems(
          { id: 'c1', reactions: [], trained: [{ kind: 'reaction' }, { kind: 'nope', reaction: blockReaction }] },
          items,
        );
        expect(out.reactions).toEqual([]);
        const plain = { id: 'c2', abilities: {} };
        expect(resolveCharacterItems(plain, items)).toBe(plain);
      });
    });
  });

  describe('applyVariant — variant overrides (#907 S1)', () => {
    it('merges descriptive fields and replaces base mechanics from overrides, dropping the overrides key', () => {
      const resolved = { name: 'Base', price: 90, bonus: ['diplomacy', 1] };
      applyVariant(resolved, {
        level: 9,
        label: 'Greater',
        name: 'Base (Greater)',
        price: 1300,
        effect: 'The item bonus is +2.',
        overrides: { bonus: ['diplomacy', 2] },
      });
      expect(resolved.name).toBe('Base (Greater)');
      expect(resolved.price).toBe(1300);
      expect(resolved.bonus).toEqual(['diplomacy', 2]);
      expect(resolved.overrides).toBeUndefined();
    });

    it('is a no-op on mechanics when the variant has no overrides', () => {
      const resolved = { name: 'Base', bonus: ['diplomacy', 1] };
      applyVariant(resolved, { level: 4, label: 'Standard', name: 'Base', price: 90 });
      expect(resolved.bonus).toEqual(['diplomacy', 1]);
    });

    it('replaces a container override and keeps it after contents resolution', () => {
      const catalog = [
        { id: 'rope', name: 'Rope', weight: 1 },
        {
          id: 'sleeves',
          name: 'Sleeves',
          container: { capacity: 10, ignored: 10 },
          variants: [
            { level: 4, label: 'Standard', name: 'Sleeves', price: 100 },
            { level: 9, label: 'Greater', name: 'Sleeves (Greater)', price: 600, overrides: { container: { capacity: 40, ignored: 40 } } },
          ],
        },
      ];
      const map = itemCatalogMap(catalog);
      const greater = resolveInventoryItem(
        { ref: 'sleeves', level: 9, container: { contents: [{ ref: 'rope' }] } }, map
      );
      expect(greater.container.capacity).toBe(40);
      expect(greater.container.ignored).toBe(40);
      expect(greater.container.contents[0].name).toBe('Rope');
      expect(greater.overrides).toBeUndefined();
      // Base catalog container object is untouched.
      expect(catalog[1].container).toEqual({ capacity: 10, ignored: 10 });
    });

    it('resolveInventoryItem applies a level-selected variant override without mutating the base catalog', () => {
      const catalog = [
        {
          id: 'cloak',
          name: 'Cloak',
          bonus: ['diplomacy', 1],
          variants: [
            { level: 4, label: 'Standard', name: 'Cloak', price: 90 },
            { level: 9, label: 'Greater', name: 'Cloak (Greater)', price: 1300, overrides: { bonus: ['diplomacy', 2] } },
          ],
        },
      ];
      const map = itemCatalogMap(catalog);
      const greater = resolveInventoryItem({ ref: 'cloak', level: 9 }, map);
      expect(greater.bonus).toEqual(['diplomacy', 2]);
      expect(greater.overrides).toBeUndefined();
      // Base level keeps the base bonus; the catalog item itself is untouched.
      const standard = resolveInventoryItem({ ref: 'cloak', level: 4 }, map);
      expect(standard.bonus).toEqual(['diplomacy', 1]);
      expect(catalog[0].bonus).toEqual(['diplomacy', 1]);
    });
  });

  describe('withSpellId / normalizeSpells / spellCatalogMap', () => {
    it('slugs the spell name, keeps an existing id, indexes dupes, tolerates non-arrays', () => {
      expect(withSpellId({ name: 'Cleanse Affliction', level: 2 }).id).toBe('cleanse-affliction');
      expect(withSpellId({ id: 'keep', name: 'X' }).id).toBe('keep');
      expect(withSpellId({ name: 'Dup' }, 2).id).toBe('dup-2');
      expect(normalizeSpells(null)).toEqual([]);
    });
    it('indexes by string id and tolerates non-arrays', () => {
      const m = spellCatalogMap([{ id: 'a', name: 'A' }, { id: 1, name: 'One' }]);
      expect(m.get('a').name).toBe('A');
      expect(m.get('1').name).toBe('One');
      expect(spellCatalogMap(null).size).toBe(0);
    });
  });

  describe('spell-ref resolution + artifact gating', () => {
    const spellMap = spellCatalogMap([
      { id: 'sleep', name: 'Sleep', level: 1, description: 'Zzz', traits: ['Mental'] },
      { id: 'figment', name: 'Figment', level: 0, description: 'Illusion' },
    ]);
    const catalog = itemCatalogMap([
      { id: 'scroll-of-sleep', name: 'Scroll of Sleep', weight: 0.1, scroll: { spellRef: 'sleep' } },
      { id: 'wand-of-sleep', name: 'Wand of Sleep', weight: 0.1, wand: { spellRef: 'sleep', duration: 'special' } },
      { id: 'broken-scroll', name: 'Broken Scroll', weight: 0.1, scroll: { spellRef: 'nope' } },
      {
        id: 'arti',
        name: 'Artifact Staff',
        weight: 1,
        strikes: { damage: '1d6' },
        staff: { name: 'Artifact Staff', spells: [{ ref: 'figment' }, { ref: 'sleep' }, { name: 'Inline', level: 3 }] },
        artifact: { tiers: [{ level: 1, grants: ['strikes'] }, { level: 5, grants: ['staff'] }] },
      },
    ]);

    it('inlines a scroll/wand spell ref (catalog spell + block overrides)', () => {
      const scroll = resolveInventoryItem({ ref: 'scroll-of-sleep' }, catalog, spellMap);
      expect(scroll.scroll).toEqual({ id: 'sleep', name: 'Sleep', level: 1, description: 'Zzz', traits: ['Mental'] });
      const wand = resolveInventoryItem({ ref: 'wand-of-sleep' }, catalog, spellMap);
      expect(wand.wand.name).toBe('Sleep');
      expect(wand.wand.duration).toBe('special'); // block-local override wins
    });

    it('yields a visible level-0 stub for a dangling spell ref', () => {
      const r = resolveInventoryItem({ ref: 'broken-scroll' }, catalog, spellMap);
      expect(r.scroll).toEqual({ name: '(unknown spell: nope)', level: 0 });
    });

    it('yields a stub for a scroll block with no spellRef (no inline back-compat, #622)', () => {
      const inlineCat = itemCatalogMap([
        { id: 'old', name: 'Old Scroll', weight: 0.1, scroll: { name: 'Heal', level: 1 } },
      ]);
      const r = resolveInventoryItem({ ref: 'old' }, inlineCat, spellMap);
      expect(r.scroll).toEqual({ name: '(unknown spell)', level: 0 });
    });

    it('resolves staff spell refs; an entry with no ref yields a stub (#622)', () => {
      const r = resolveInventoryItem({ ref: 'arti' }, catalog, spellMap, 10);
      expect(r.staff.spells).toHaveLength(3);
      expect(r.staff.spells[0]).toMatchObject({ id: 'figment', name: 'Figment' });
      expect(r.staff.spells[1]).toMatchObject({ id: 'sleep', name: 'Sleep' });
      expect(r.staff.spells[2]).toEqual({ name: '(unknown spell)', level: 0 });
    });

    it('gates artifact blocks by owner level (below / at / above tier)', () => {
      const lvl1 = resolveInventoryItem({ ref: 'arti' }, catalog, spellMap, 1);
      expect(lvl1.strikes).toBeTruthy();
      expect(lvl1.staff).toBeUndefined(); // staff tier is level 5
      const lvl5 = resolveInventoryItem({ ref: 'arti' }, catalog, spellMap, 5);
      expect(lvl5.strikes).toBeTruthy();
      expect(lvl5.staff).toBeTruthy();
      const lvl0 = resolveInventoryItem({ ref: 'arti' }, catalog, spellMap, undefined);
      expect(lvl0.strikes).toBeTruthy(); // defaults to level 1
      expect(lvl0.staff).toBeUndefined();
    });

    describe('scroll/wand base hydration (#814)', () => {
      const hydrSpells = spellCatalogMap([
        { id: 'sleep', name: 'Sleep', level: 1, traits: ['Mental'] },
        { id: 'heal', name: 'Heal', level: 1, traits: ['Healing'] },
        { id: 'wish', name: 'Wish', level: 10 },
      ]);
      const hydrCat = itemCatalogMap([
        // Bare entries — nothing authored but the block.
        { id: 'bare-scroll', scroll: { spellRef: 'sleep' } },
        { id: 'bare-wand', wand: { spellRef: 'heal' } },
        // Heightened cast rank baked into the block.
        { id: 'heightened-scroll', scroll: { spellRef: 'heal', rank: 5 } },
        // GM-priced / custom-named unique scroll: author values must win.
        { id: 'unique-scroll', name: 'Pristine Scroll of Sleep', price: 99, level: 4, scroll: { spellRef: 'sleep' } },
        // Out-of-range for a wand (rank 10): named but unpriced.
        { id: 'wish-wand', wand: { spellRef: 'wish' } },
        // Dangling ref: pass through, no hydration.
        { id: 'dangling', scroll: { spellRef: 'nope' } },
      ]);

      it('hydrates a bare scroll to a fully-priced, leveled, named, traited item', () => {
        const out = resolveInventoryItem({ ref: 'bare-scroll' }, hydrCat, hydrSpells);
        expect(out.name).toBe('Scroll of Sleep');
        expect(out.level).toBe(1);
        expect(out.price).toBe(4);
        expect(out.weight).toBe(0.1);
        expect(out.traits).toEqual(['Consumable', 'Magical', 'Scroll']);
        expect(out.usage).toBe('held in 1 hand');
      });

      it('hydrates a bare wand from the wand table', () => {
        const out = resolveInventoryItem({ ref: 'bare-wand' }, hydrCat, hydrSpells);
        expect(out.name).toBe('Wand of Heal');
        expect(out.level).toBe(3);
        expect(out.price).toBe(60);
        expect(out.traits).toEqual(['Magical', 'Wand']);
      });

      it('prices a heightened scroll off the cast rank, not the base level', () => {
        const out = resolveInventoryItem({ ref: 'heightened-scroll' }, hydrCat, hydrSpells);
        expect(out.name).toBe('Scroll of Heal (Rank 5)');
        expect(out.level).toBe(9);
        expect(out.price).toBe(150);
      });

      it('author overrides win (custom name/price/level preserved)', () => {
        const out = resolveInventoryItem({ ref: 'unique-scroll' }, hydrCat, hydrSpells);
        expect(out.name).toBe('Pristine Scroll of Sleep');
        expect(out.price).toBe(99);
        expect(out.level).toBe(4);
        // an unset field is still derived
        expect(out.traits).toEqual(['Consumable', 'Magical', 'Scroll']);
      });

      it('out-of-range rank: names the item but leaves price/level unpriced', () => {
        const out = resolveInventoryItem({ ref: 'wish-wand' }, hydrCat, hydrSpells);
        expect(out.name).toBe('Wand of Wish');
        expect(out.level).toBeUndefined();
        expect(out.price).toBeUndefined();
        expect(out.traits).toEqual(['Magical', 'Wand']);
      });

      it('dangling ref passes through with no hydration', () => {
        const out = resolveInventoryItem({ ref: 'dangling' }, hydrCat, hydrSpells);
        expect(out.scroll).toEqual({ name: '(unknown spell: nope)', level: 0 });
        expect(out.name).toBeUndefined();
        expect(out.price).toBeUndefined();
        expect(out.traits).toBeUndefined();
      });

      it('non-scroll/wand items are untouched', () => {
        const flatCat = itemCatalogMap([{ id: 'rope', name: 'Rope', weight: 1 }]);
        const out = resolveInventoryItem({ ref: 'rope' }, flatCat, hydrSpells);
        expect(out).toMatchObject({ name: 'Rope', weight: 1 });
        expect(out.usage).toBeUndefined();
      });
    });

    describe('variant selection', () => {
      const antidoteCat = itemCatalogMap([{
        id: 'antidote',
        name: 'Antidote',
        weight: 0.1,
        traits: ['Alchemical', 'Consumable', 'Elixir'],
        variants: [
          { level: 1, label: 'Lesser', price: 3, effect: '+2 bonus' },
          { level: 6, label: 'Moderate', price: 35, effect: '+3 bonus' },
        ],
      }]);

      it('merges the matching variant fields onto the resolved item', () => {
        const out = resolveInventoryItem({ ref: 'antidote', level: 6, uid: 'u1', quantity: 2 }, antidoteCat);
        expect(out.level).toBe(6);
        expect(out.label).toBe('Moderate');
        expect(out.price).toBe(35);
        expect(out.effect).toBe('+3 bonus');
        expect(out.name).toBe('Antidote');
        expect(out.weight).toBe(0.1);
        expect(out.quantity).toBe(2);
        expect(out.uid).toBe('u1');
      });

      it('resolves the base item unchanged when no level is specified on the entry', () => {
        const out = resolveInventoryItem({ ref: 'antidote', quantity: 1 }, antidoteCat);
        expect(out.level).toBeUndefined();
        expect(out.label).toBeUndefined();
        expect(out.name).toBe('Antidote');
        expect(out.variants).toBeDefined();
      });

      it('ignores an unmatched level (no variant applied)', () => {
        const out = resolveInventoryItem({ ref: 'antidote', level: 99 }, antidoteCat);
        expect(out.name).toBe('Antidote');
        expect(out.label).toBeUndefined();
        expect(out.level).toBeUndefined();
      });

      it('works for an item with no variants array (flat item, level on entry ignored)', () => {
        const flatCat = itemCatalogMap([{ id: 'sword', name: 'Sword', weight: 1 }]);
        const out = resolveInventoryItem({ ref: 'sword', level: 2 }, flatCat);
        expect(out.name).toBe('Sword');
        expect(out.level).toBeUndefined();
      });
    });

    it('resolveCharacterItems threads spells + level (3-arg) and stays back-compat (2-arg)', () => {
      const sheet = { level: 5, inventory: [{ uid: 'u1', ref: 'arti' }] };
      const r3 = resolveCharacterItems(sheet, [...catalog.values()], [...spellMap.values()]);
      expect(r3.inventory[0].staff.spells[0].name).toBe('Figment');
      expect(r3.inventory[0].uid).toBe('u1');
      // 2-arg (no spell catalog): refs become stubs, but resolution still works.
      const r2 = resolveCharacterItems(
        { level: 5, inventory: [{ ref: 'scroll-of-sleep' }] },
        [...catalog.values()]
      );
      expect(r2.inventory[0].scroll).toEqual({ name: '(unknown spell: sleep)', level: 0 });
    });

    describe('resolveCraftingRecipes / resolveCharacterItems crafting', () => {
      const recipeCatalog = itemCatalogMap([
        {
          id: 'antidote',
          name: 'Antidote',
          weight: 0.1,
          traits: ['Alchemical', 'Consumable', 'Elixir'],
          variants: [
            { level: 1, label: 'Lesser', price: 3, effect: '+2 bonus' },
            { level: 6, label: 'Moderate', price: 35, effect: '+3 bonus' },
          ],
        },
      ]);

      it('resolves ref entries to base item with full variants (ignores stored level)', () => {
        const entries = [{ ref: 'antidote', level: 1 }, { ref: 'antidote', level: 6 }];
        const resolved = resolveCraftingRecipes(entries, recipeCatalog);
        // Deduped to one entry; no variant fields merged in
        expect(resolved).toHaveLength(1);
        expect(resolved[0]).toMatchObject({ name: 'Antidote', weight: 0.1 });
        expect(resolved[0].label).toBeUndefined();
        expect(resolved[0].variants).toHaveLength(2);
      });

      it('deduplicates repeated refs to the first occurrence', () => {
        const entries = [{ ref: 'antidote' }, { ref: 'antidote' }];
        const resolved = resolveCraftingRecipes(entries, recipeCatalog);
        expect(resolved).toHaveLength(1);
        expect(resolved[0].name).toBe('Antidote');
      });

      it('passes through inline legacy recipes unchanged (back-compat)', () => {
        const inline = [{ name: 'Old Recipe', types: [{ level: 1, type: 'Lesser' }] }];
        const resolved = resolveCraftingRecipes(inline, recipeCatalog);
        expect(resolved[0]).toEqual(inline[0]);
      });

      it('resolveCharacterItems resolves crafting to base item + variants', () => {
        const itemList = [...recipeCatalog.values()];
        const sheet = {
          level: 3,
          inventory: [{ ref: 'antidote', level: 1, uid: 'inv1' }],
          crafting: [{ ref: 'antidote' }],
        };
        const out = resolveCharacterItems(sheet, itemList, []);
        // Inventory still resolves variant by level
        expect(out.inventory[0]).toMatchObject({ name: 'Antidote', level: 1, label: 'Lesser' });
        // Crafting gets base item with variants array
        expect(out.crafting[0]).toMatchObject({ name: 'Antidote' });
        expect(out.crafting[0].label).toBeUndefined();
        expect(out.crafting[0].variants).toHaveLength(2);
      });

      it('resolveCharacterItems returns character unchanged when no inventory or crafting', () => {
        const sheet = { level: 3, name: 'Bob' };
        expect(resolveCharacterItems(sheet, [], [])).toEqual(sheet);
      });
    });
  });
});

describe('resolveFocusSpells', () => {
  const focusMap = spellCatalogMap([
    { id: 'inspire-courage', name: 'Inspire Courage', level: 0, traits: ['Composition'] },
    { id: 'shields-of-the-spirit', name: 'Shields of the Spirit', level: 1, traits: ['Champion', 'Focus'] },
  ]);

  it('resolves a spellRef entry to the full catalog spell', () => {
    const result = resolveFocusSpells([{ spellRef: 'inspire-courage' }], focusMap);
    expect(result[0]).toMatchObject({ id: 'inspire-courage', name: 'Inspire Courage', level: 0 });
  });

  it('applies entry-local overrides on top of the catalog spell', () => {
    const result = resolveFocusSpells(
      [{ spellRef: 'inspire-courage', bloodline: true }],
      focusMap
    );
    expect(result[0].name).toBe('Inspire Courage');
    expect(result[0].bloodline).toBe(true);
  });

  it('yields a visible level-0 stub for a dangling spellRef', () => {
    const result = resolveFocusSpells([{ spellRef: 'nope' }], focusMap);
    expect(result[0]).toEqual({ name: '(unknown spell: nope)', level: 0 });
  });

  it('yields a stub for an entry with no spellRef (no inline back-compat, #622)', () => {
    const result = resolveFocusSpells([{ id: 'fs1', name: 'Divine Lance', level: 1 }], focusMap);
    expect(result[0]).toEqual({ name: '(unknown spell)', level: 0 });
  });

  it('resolves a ref array; an entry with no spellRef stubs', () => {
    const result = resolveFocusSpells(
      [{ id: 'fs1', name: 'Divine Lance', level: 1 }, { spellRef: 'inspire-courage' }, { spellRef: 'nope' }],
      focusMap
    );
    expect(result[0]).toEqual({ name: '(unknown spell)', level: 0 });
    expect(result[1].name).toBe('Inspire Courage');
    expect(result[2].name).toMatch(/unknown spell/);
  });

  it('returns the input unchanged when it is not an array', () => {
    expect(resolveFocusSpells(null, focusMap)).toBeNull();
    expect(resolveFocusSpells(undefined, focusMap)).toBeUndefined();
  });

  it('resolves with an empty map — all spellRefs become stubs', () => {
    const result = resolveFocusSpells([{ spellRef: 'any' }], new Map());
    expect(result[0]).toEqual({ name: '(unknown spell: any)', level: 0 });
  });

  it('bundled focus spells resolve correctly after migration', () => {
    const spells = require('../data/snapshot/spell.json');
    const bundledMap = spellCatalogMap(spells);
    const pelliasFocus = [
      { spellRef: 'serrate' },
      { spellRef: 'shields-of-the-spirit' },
    ];
    const resolved = resolveFocusSpells(pelliasFocus, bundledMap);
    expect(resolved[0].name).toBe('Serrate');
    expect(resolved[1].name).toBe('Shields of the Spirit');
    expect(resolved[1].traits).toContain('Champion');

    const izzyFocus = [
      { spellRef: 'inspire-courage' },
      { spellRef: 'counter-performance' },
      { spellRef: 'hymn-of-healing' },
      { spellRef: 'lingering-composition' },
    ];
    const izzyResolved = resolveFocusSpells(izzyFocus, bundledMap);
    expect(izzyResolved.map(s => s.name)).toEqual([
      'Inspire Courage', 'Counter Performance', 'Hymn of Healing', 'Lingering Composition',
    ]);

    const jadeFocus = [{ spellRef: 'ancestral-memories', bloodline: true }];
    const jadeResolved = resolveFocusSpells(jadeFocus, bundledMap);
    expect(jadeResolved[0].name).toBe('Ancestral Memories');
    expect(jadeResolved[0].bloodline).toBe(true);

    const bluFocus = [{ spellRef: 'inner-upheaval' }];
    expect(resolveFocusSpells(bluFocus, bundledMap)[0].name).toBe('Inner Upheaval');
  });
});

describe('resolveRepertoireSpells', () => {
  const repMap = spellCatalogMap([
    { id: 'fear', name: 'Fear', level: 1, traits: ['Emotion', 'Fear'] },
    { id: 'summon-undead', name: 'Summon Undead', level: 1, traits: ['Summon'] },
  ]);

  it('resolves a spellRef entry to the full catalog spell', () => {
    const result = resolveRepertoireSpells([{ spellRef: 'fear' }], repMap);
    expect(result[0]).toMatchObject({ id: 'fear', name: 'Fear', level: 1 });
  });

  it('applies a per-character override (e.g. signature) over the catalog spell', () => {
    const result = resolveRepertoireSpells([{ spellRef: 'summon-undead', signature: true }], repMap);
    expect(result[0].name).toBe('Summon Undead');
    expect(result[0].signature).toBe(true);
  });

  it('yields a visible level-0 stub for a dangling spellRef', () => {
    expect(resolveRepertoireSpells([{ spellRef: 'nope' }], repMap)[0]).toEqual({
      name: '(unknown spell: nope)',
      level: 0,
    });
  });

  it('yields a stub for an entry with no spellRef (no inline back-compat, #622)', () => {
    expect(resolveRepertoireSpells([{ id: 'r1', name: 'Daze', level: 0 }], repMap)[0]).toEqual({
      name: '(unknown spell)',
      level: 0,
    });
  });

  it('returns a non-array input unchanged', () => {
    expect(resolveRepertoireSpells(null, repMap)).toBeNull();
    expect(resolveRepertoireSpells(undefined, repMap)).toBeUndefined();
  });

  it('resolveCharacterItems resolves spellcasting.spells refs (and leaves other shape intact)', () => {
    const sheet = {
      id: 'caster',
      level: 5,
      spellcasting: { tradition: 'arcane', spells: [{ spellRef: 'fear' }, { spellRef: 'summon-undead', signature: true }] },
    };
    const out = resolveCharacterItems(sheet, [], [...repMap.values()]);
    expect(out.spellcasting.tradition).toBe('arcane');
    expect(out.spellcasting.spells[0]).toMatchObject({ id: 'fear', name: 'Fear' });
    expect(out.spellcasting.spells[1]).toMatchObject({ name: 'Summon Undead', signature: true });
  });
});

describe('resolveInnateSpells', () => {
  const innMap = spellCatalogMap([
    { id: 'electric-arc', name: 'Electric Arc', level: 0, defense: 'Reflex' },
    { id: 'guidance', name: 'Guidance', level: 0 },
    { id: 'murmured-prayer-plus', name: 'Murmured Prayer (+2 Guidance)', level: 0 },
  ]);

  it('resolves a spellRef entry to the full catalog spell', () => {
    const result = resolveInnateSpells([{ spellRef: 'electric-arc' }], innMap);
    expect(result[0]).toMatchObject({ id: 'electric-arc', name: 'Electric Arc', defense: 'Reflex' });
  });

  it('applies an entry-local override (e.g. a frequency variant) over the catalog spell', () => {
    const result = resolveInnateSpells(
      [{ spellRef: 'murmured-prayer-plus', frequencyRule: { per: 'day', uses: 1 } }],
      innMap,
    );
    expect(result[0].name).toBe('Murmured Prayer (+2 Guidance)');
    expect(result[0].frequencyRule).toEqual({ per: 'day', uses: 1 });
  });

  it('yields a visible level-0 stub for a dangling spellRef', () => {
    expect(resolveInnateSpells([{ spellRef: 'nope' }], innMap)[0]).toEqual({
      name: '(unknown spell: nope)',
      level: 0,
    });
  });

  it('yields a stub for an entry with no spellRef (no inline back-compat, #622)', () => {
    expect(resolveInnateSpells([{ id: 'spell-3', name: 'Guidance', level: 0 }], innMap)[0]).toEqual({
      name: '(unknown spell)',
      level: 0,
    });
  });

  it('returns a non-array input unchanged', () => {
    expect(resolveInnateSpells(null, innMap)).toBeNull();
    expect(resolveInnateSpells(undefined, innMap)).toBeUndefined();
  });

  it('resolveCharacterItems resolves feats[].innate and ancestry_spells refs', () => {
    const sheet = {
      id: 'caster',
      level: 5,
      feats: [
        { id: 'feat-1', name: 'Dragon Spit', innate: [{ spellRef: 'electric-arc' }] },
        { id: 'feat-2', name: 'No Spells Here' },
      ],
      ancestry_spells: [{ spellRef: 'guidance' }],
    };
    const out = resolveCharacterItems(sheet, [], [...innMap.values()]);
    expect(out.feats[0].name).toBe('Dragon Spit'); // feat shape preserved
    expect(out.feats[0].innate[0]).toMatchObject({ id: 'electric-arc', name: 'Electric Arc' });
    expect(out.feats[1]).toEqual({ id: 'feat-2', name: 'No Spells Here' }); // innate-less feat untouched
    expect(out.ancestry_spells[0]).toMatchObject({ id: 'guidance', name: 'Guidance' });
  });
});

describe('repointFocusSpells', () => {
  const REF_SPELLS = [{ spellRef: 'inspire-courage' }, { spellRef: 'counter-performance' }];

  it('patches focus_spells when bundled has spellRef entries', () => {
    const live    = { id: 'Izzy', name: 'Izzy', focus_spells: [{ id: 'spell-1', name: 'Inspire Courage' }] };
    const bundled = { id: 'Izzy', focus_spells: REF_SPELLS };
    const out = repointFocusSpells(live, bundled);
    expect(out.focus_spells).toEqual(REF_SPELLS);
    expect(out.name).toBe('Izzy'); // other fields preserved
  });

  it('patches champion.devotion_spells', () => {
    const live    = { id: 'Pellias', champion: { devotion_spells: [{ id: 's1', name: 'Serrate' }], focus_points: 2 } };
    const bundled = { id: 'Pellias', champion: { devotion_spells: [{ spellRef: 'serrate' }] } };
    const out = repointFocusSpells(live, bundled);
    expect(out.champion.devotion_spells).toEqual([{ spellRef: 'serrate' }]);
    expect(out.champion.focus_points).toBe(2); // sibling fields untouched
  });

  it('patches nested spellcasting.bloodline.focus_spells', () => {
    const live    = { id: 'Jade', spellcasting: { bloodline: { name: 'Imperial', focus_spells: [{ id: 'f1', name: 'Ancestral' }] } } };
    const bundled = { id: 'Jade', spellcasting: { bloodline: { focus_spells: [{ spellRef: 'ancestral-memories', bloodline: true }] } } };
    const out = repointFocusSpells(live, bundled);
    expect(out.spellcasting.bloodline.focus_spells).toEqual([{ spellRef: 'ancestral-memories', bloodline: true }]);
    expect(out.spellcasting.bloodline.name).toBe('Imperial'); // sibling preserved
  });

  it('patches monk.ki_spells', () => {
    const live    = { id: 'Blu', monk: { ki_spells: [{ id: 'k1', name: 'Inner Upheaval' }], focus_points: 1 } };
    const bundled = { id: 'Blu', monk: { ki_spells: [{ spellRef: 'inner-upheaval' }] } };
    const out = repointFocusSpells(live, bundled);
    expect(out.monk.ki_spells).toEqual([{ spellRef: 'inner-upheaval' }]);
    expect(out.monk.focus_points).toBe(1);
  });

  it('is idempotent — already-patched doc returns equal result (same reference)', () => {
    const live    = { id: 'Izzy', focus_spells: REF_SPELLS };
    const bundled = { id: 'Izzy', focus_spells: REF_SPELLS };
    const out = repointFocusSpells(live, bundled);
    expect(out).toBe(live); // identical reference when nothing changed
  });

  it('is a no-op when bundled has no spellRef arrays', () => {
    const live    = { id: 'NoFocus', feats: [{ name: 'Toughness' }] };
    const bundled = { id: 'NoFocus', feats: [{ name: 'Toughness' }] };
    expect(repointFocusSpells(live, bundled)).toBe(live);
  });

  it('is a no-op when bundled focus array is inline (no spellRef)', () => {
    const live    = { id: 'Old', focus_spells: [{ id: 'x', name: 'X' }] };
    const bundled = { id: 'Old', focus_spells: [{ id: 'x', name: 'X' }] }; // inline, no spellRef
    expect(repointFocusSpells(live, bundled)).toBe(live);
  });

  it('applies to all 4 bundled characters that were migrated in Slice C', () => {
    const bundled = defaultContent().character;
    const charNames = ['Pellias', 'IzzyUncut', 'JadeInferno', 'Blu-Kakke'];
    for (const id of charNames) {
      const bChar = bundled.find((c) => c.id === id);
      expect(bChar).toBeTruthy();
      // Simulate a "live" doc that still has inline spells (pre-Slice C).
      const fakeInline = { ...bChar };
      const out = repointFocusSpells(fakeInline, bChar);
      // Result must equal bChar (same spellRef arrays), even if reference differs.
      expect(JSON.stringify(out)).toBe(JSON.stringify(bChar));
    }
  });
});
