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
  resolveInventoryItem,
  resolveInventory,
  resolveCharacterItems,
  existingIdSet,
  defaultContent,
  buildSeedPayload,
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
      const e = withLoreId({ id: 'sandpoint', title: 'Sandpoint', category: 'Location', tags: ['town'] });
      expect(e.id).toBe('sandpoint');
      expect(e.category).toBe('Location');
      expect(e.tags).toEqual(['town']);
    });
    it('derives an id from the title when missing and tolerates non-arrays', () => {
      expect(withLoreId({ title: 'The Lost Coast' }).id).toBe('the-lost-coast');
      expect(normalizeLore(null)).toEqual([]);
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
    it('exposes the item catalog (possibly empty pre-Slice-3) as an array of id-bearing docs', () => {
      const dc = defaultContent();
      expect(Array.isArray(dc.item)).toBe(true);
      expect(dc.item.every((d) => typeof d.id === 'string' && d.id.length > 0)).toBe(true);
      expect(Array.isArray(buildSeedPayload().collections.item)).toBe(true);
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
        scroll: { name: 'Friendfetch', level: 1, traits: ['Force'], description: 'Pull a creature.' },
      },
      {
        id: 'wand-cleanse',
        name: 'Wand of Cleanse Affliction',
        price: 160,
        weight: 0.1,
        wand: { name: 'Cleanse Affliction', level: 2, description: 'Reduce an affliction stage.' },
      },
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
      const scroll = resolveInventoryItem({ ref: 'scroll-friendfetch', quantity: 2 }, catalog);
      const wand = resolveInventoryItem({ ref: 'wand-cleanse' }, catalog);
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
  });
});
