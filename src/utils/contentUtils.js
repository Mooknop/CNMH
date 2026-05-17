// Helpers shared by the content layer (ContentContext) and the GM editor.
// Bundled JSON entities (quests, etc.) have no stable id; we derive a kebab
// slug from the title so rows have a primary key and React keys are stable.

import {
  quests as defaultQuests,
  reputation as defaultReputation,
  loreEntries as defaultLoreEntries,
  sampleCharacters as defaultCharacters,
} from '../data';
import defaultCalendar from '../data/CalendarEvents.json';
import traitsData from '../data/traits.json';
import itemsData from '../data/items.json';

export const slugify = (str) =>
  String(str || '')
    .toLowerCase()
    .trim()
    .replace(/['’`]/g, '') // drop apostrophes so "Milton's" -> "miltons"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';

// Set of existing ids in a collection list, for slug-collision detection in
// the GM editors (creating an entry whose slug matches an existing id would
// silently overwrite it server-side).
export const existingIdSet = (list) =>
  new Set((Array.isArray(list) ? list : []).map((d) => String(d && d.id)));

// Ensure a quest has an `id`. Existing ids are preserved; otherwise derive
// from the title. Notes get index-stable ids for React keys.
export const withQuestId = (quest, index = 0) => {
  const id = quest.id || `${slugify(quest.title)}${index ? `-${index}` : ''}`;
  const notes = Array.isArray(quest.notes)
    ? quest.notes.map((n, i) => ({ id: n.id || `${id}-note-${i}`, content: n.content }))
    : [];
  return { ...quest, id, notes };
};

export const normalizeQuests = (arr) =>
  (Array.isArray(arr) ? arr : []).map((q, i) => withQuestId(q, i));

// Ensure a faction has an `id` (slug of its name) and index-stable rank ids.
export const withFactionId = (faction, index = 0) => {
  const id = faction.id || `${slugify(faction.name)}${index ? `-${index}` : ''}`;
  const ranks = Array.isArray(faction.ranks)
    ? faction.ranks.map((r, i) => ({
        id: r.id || `${id}-rank-${i}`,
        name: r.name,
        min: r.min,
        max: r.max,
        ...(r.effect != null ? { effect: r.effect } : {}),
      }))
    : [];
  return { ...faction, id, ranks };
};

export const normalizeFactions = (arr) =>
  (Array.isArray(arr) ? arr : []).map((f, i) => withFactionId(f, i));

// Calendar events vary: some carry `title`, some `name`; some have a fixed
// `date {year?,month,day}`, some only a `recurring` rule string. Preserve all
// original fields untouched — just stamp a stable id (slug of title|name).
export const withCalendarId = (event, index = 0) => {
  const label = event.title || event.name;
  const id = event.id || `${slugify(label)}${index ? `-${index}` : ''}`;
  return { ...event, id };
};

export const normalizeCalendar = (arr) =>
  (Array.isArray(arr) ? arr : []).map((e, i) => withCalendarId(e, i));

// Lore entries already carry an `id`; keep it (fall back to a slug of the
// title) and preserve every other field (category/summary/content/related/
// tags/createdAt) untouched.
export const withLoreId = (entry, index = 0) => ({
  ...entry,
  id: entry.id || `${slugify(entry.title)}${index ? `-${index}` : ''}`,
});

export const normalizeLore = (arr) =>
  (Array.isArray(arr) ? arr : []).map((e, i) => withLoreId(e, i));

// Traits are reference data ({ name, description }); id is a slug of the name.
export const withTraitId = (trait, index = 0) => ({
  ...trait,
  id: trait.id || `${slugify(trait.name)}${index ? `-${index}` : ''}`,
});

export const normalizeTraits = (arr) =>
  (Array.isArray(arr) ? arr : []).map((t, i) => withTraitId(t, i));

// Catalog items are the shared definitions (name/price/weight/traits/
// description + optional mechanical blocks: container{capacity,ignored},
// scroll, wand, strikes, potency, shield, actions). id is a slug of the name.
export const withItemId = (item, index = 0) => ({
  ...item,
  id: item.id || `${slugify(item.name)}${index ? `-${index}` : ''}`,
});

export const normalizeItems = (arr) =>
  (Array.isArray(arr) ? arr : []).map((it, i) => withItemId(it, i));

// id -> catalog item, for resolving inventory references.
export const itemCatalogMap = (items) => {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((it) => {
    if (it && it.id != null) map.set(String(it.id), it);
  });
  return map;
};

// Resolve one inventory entry into a fully-shaped item.
//
// An entry with no `ref` is a legacy inline item (back-compat): returned
// as-is, only recursing into a container's contents (which may themselves
// be refs). An entry with `ref` is merged over its catalog definition —
// the catalog object is spread FIRST so its mechanical blocks (.scroll,
// .wand, .strikes, .container) survive for InventoryUtils/SpellUtils, then
// the per-character scalars (quantity/invested/id) overlay it. A container
// ref keeps the catalog's intrinsic {capacity,ignored} and takes its
// contents from the reference. A dangling ref yields a visible, weightless
// stub so bulk math never breaks (NaN-free).
export const resolveInventoryItem = (entry, catalogMap) => {
  if (!entry || typeof entry !== 'object') return entry;

  if (entry.ref == null) {
    if (entry.container && Array.isArray(entry.container.contents)) {
      return {
        ...entry,
        container: {
          ...entry.container,
          contents: resolveInventory(entry.container.contents, catalogMap),
        },
      };
    }
    return entry;
  }

  const quantity = entry.quantity != null ? entry.quantity : 1;
  const cat = catalogMap.get(String(entry.ref));
  if (!cat) {
    return { name: `(unknown item: ${entry.ref})`, weight: 0, quantity };
  }

  const resolved = { ...cat, quantity, id: entry.id || cat.id };
  if (entry.invested != null) resolved.invested = entry.invested;
  if (cat.container) {
    resolved.container = {
      ...cat.container,
      contents: resolveInventory(
        entry.container && entry.container.contents,
        catalogMap
      ),
    };
  }
  return resolved;
};

export const resolveInventory = (list, catalogMap) =>
  (Array.isArray(list) ? list : []).map((e) =>
    resolveInventoryItem(e, catalogMap)
  );

// Resolve a character's inventory against the item catalog. Characters with
// no inventory array are returned untouched (shape preserved).
export const resolveCharacterItems = (character, items) => {
  if (!character || typeof character !== 'object') return character;
  if (!Array.isArray(character.inventory)) return character;
  return {
    ...character,
    inventory: resolveInventory(character.inventory, itemCatalogMap(items)),
  };
};

// Character sheets already carry an `id` (e.g. "Pellias"); keep it (fall back
// to a slug of the name) and preserve the entire deeply-nested sheet as-is.
export const withCharacterId = (character, index = 0) => ({
  ...character,
  id: character.id || `${slugify(character.name)}${index ? `-${index}` : ''}`,
});

export const normalizeCharacters = (arr) =>
  (Array.isArray(arr) ? arr : []).map((c, i) => withCharacterId(c, i));

// The default content shipped with the build, normalized for seeding/fallback.
export const defaultContent = () => ({
  quest: normalizeQuests(defaultQuests),
  faction: normalizeFactions(defaultReputation && defaultReputation.Factions),
  calendar: normalizeCalendar(defaultCalendar),
  lore: normalizeLore(defaultLoreEntries),
  trait: normalizeTraits(traitsData && traitsData.traits),
  character: normalizeCharacters(defaultCharacters),
  item: normalizeItems(itemsData && itemsData.items),
});

// Body for POST /api/gm/seed.
export const buildSeedPayload = (force = false) => ({
  force,
  collections: defaultContent(),
});
