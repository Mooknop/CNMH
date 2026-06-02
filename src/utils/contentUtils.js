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
import spellsData from '../data/spells.json';
import defaultEffects from '../data/pf2eEffects';

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

// Spell catalog: shared spell definitions referenced by wand/scroll/staff
// blocks (`spellRef`, or a staff-spell entry's `ref`). id is a slug of the
// name — exactly like items. Mirrors withItemId/normalizeItems/itemCatalogMap.
export const withSpellId = (spell, index = 0) => ({
  ...spell,
  id: spell.id || `${slugify(spell.name)}${index ? `-${index}` : ''}`,
});

export const normalizeSpells = (arr) =>
  (Array.isArray(arr) ? arr : []).map((s, i) => withSpellId(s, i));

export const normalizeEffects = (arr) =>
  (Array.isArray(arr) ? arr : []).map((e) => ({
    ...e,
    id: e.id || slugify(e.name),
    modifiers: Array.isArray(e.modifiers) ? e.modifiers : [],
  }));

// id -> catalog spell, for resolving wand/scroll/staff spell references.
export const spellCatalogMap = (spells) => {
  const map = new Map();
  (Array.isArray(spells) ? spells : []).forEach((s) => {
    if (s && s.id != null) map.set(String(s.id), s);
  });
  return map;
};

// Resolve a focus/devotion/ki spell list. Each entry with a `spellRef` is
// replaced by the catalog spell (+ entry-local overrides); entries without
// `spellRef` pass through unchanged (inline back-compat). Same dangling-ref
// stub as resolveSpellBlock so organizeSpellsByRank / React keys never break.
export const resolveFocusSpells = (arr, spellMap) => {
  if (!Array.isArray(arr)) return arr;
  return arr.map((entry) => {
    if (!entry || typeof entry !== 'object' || entry.spellRef == null) return entry;
    const spell = spellMap && spellMap.get(String(entry.spellRef));
    if (!spell) return { name: `(unknown spell: ${entry.spellRef})`, level: 0 };
    const { spellRef, ...overrides } = entry;
    return { ...spell, ...overrides };
  });
};

// Resolve a wand/scroll spell block. With no `spellRef` it is a legacy inline
// spell (back-compat) — returned untouched, exactly like an inline inventory
// entry. With `spellRef` the catalog spell is spread FIRST so its full shape
// (name/level/traits/heightened) survives, then any sibling keys on the block
// (e.g. a wand overriding duration) overlay it. A dangling ref yields a
// visible, level-0 stub so organizeSpellsByRank / React keys never break —
// mirrors resolveInventoryItem's "(unknown item)" precedent.
const resolveSpellBlock = (block, spellMap) => {
  if (!block || typeof block !== 'object' || block.spellRef == null) return block;
  const spell = spellMap && spellMap.get(String(block.spellRef));
  if (!spell) return { name: `(unknown spell: ${block.spellRef})`, level: 0 };
  const { spellRef, ...overrides } = block;
  return { ...spell, ...overrides };
};

// Resolve a staff's spell list. Each entry with a `ref` is replaced by the
// catalog spell (+ entry-local overrides); entries with no `ref` pass through
// (inline back-compat). Same dangling-ref stub as resolveSpellBlock.
const resolveStaffSpells = (staff, spellMap) => {
  if (!staff || !Array.isArray(staff.spells)) return staff;
  return {
    ...staff,
    spells: staff.spells.map((s) => {
      if (!s || typeof s !== 'object' || s.ref == null) return s;
      const spell = spellMap && spellMap.get(String(s.ref));
      if (!spell) return { name: `(unknown spell: ${s.ref})`, level: 0 };
      const { ref, ...overrides } = s;
      return { ...spell, ...overrides };
    }),
  };
};

// An Artifact gains abilities as its owner levels. `artifact.tiers` is a list
// of { level, grants:[blockName,...] }; a tier is active when ownerLevel >=
// its level, and the union of active tiers' `grants` is the set of mechanical
// blocks currently unlocked. A block that SOME tier manages but isn't yet
// granted is stripped from the resolved item, so downstream utils never see
// it. Blocks no tier mentions are never touched — a plain weapon's strikes
// are safe. No `artifact` block (or no tiers) ⇒ identity.
const GATEABLE_BLOCKS = ['strikes', 'reactions', 'actions', 'freeActions', 'staff', 'scroll', 'wand'];

const applyArtifactGating = (item, ownerLevel) => {
  if (!item || !item.artifact || !Array.isArray(item.artifact.tiers)) return item;
  const lvl = ownerLevel || 1;
  const tiers = item.artifact.tiers;
  const granted = new Set();
  tiers.forEach((t) => {
    if (t && lvl >= (t.level || 1)) (t.grants || []).forEach((g) => granted.add(g));
  });
  const out = { ...item };
  GATEABLE_BLOCKS.forEach((k) => {
    const managed = tiers.some(
      (t) => t && Array.isArray(t.grants) && t.grants.includes(k)
    );
    if (managed && !granted.has(k) && out[k] != null) delete out[k];
  });
  return out;
};

// Final shaping shared by both resolution branches: gate artifact abilities by
// owner level FIRST (so a still-locked staff isn't spell-resolved), then inline
// any wand/scroll/staff spell refs. Identity-preserving when nothing applies,
// so legacy inline items pass through byte-for-byte.
const finishItem = (item, spellMap, ownerLevel) => {
  if (!item || typeof item !== 'object') return item;
  let out = applyArtifactGating(item, ownerLevel);
  if (out.scroll) {
    const r = resolveSpellBlock(out.scroll, spellMap);
    if (r !== out.scroll) out = { ...out, scroll: r };
  }
  if (out.wand) {
    const r = resolveSpellBlock(out.wand, spellMap);
    if (r !== out.wand) out = { ...out, wand: r };
  }
  if (out.staff) {
    const r = resolveStaffSpells(out.staff, spellMap);
    if (r !== out.staff) out = { ...out, staff: r };
  }
  return out;
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
//
// Optional catalog field `noHandRequired: true` marks an item whose granted
// abilities (strikes / item actions / scroll-wand-staff spells) work while
// merely worn — the escape hatch from the held-in-hand gate (see
// itemState.itemAbilitiesActive). It flows onto the effective entry for free:
// the catalog spread below carries it, and buildEffectiveInventory spreads
// the whole entry, so no special handling is needed here.
export const resolveInventoryItem = (entry, catalogMap, spellMap, ownerLevel) => {
  if (!entry || typeof entry !== 'object') return entry;

  if (entry.ref == null) {
    const inline =
      entry.container && Array.isArray(entry.container.contents)
        ? {
            ...entry,
            container: {
              ...entry.container,
              contents: resolveInventory(
                entry.container.contents,
                catalogMap,
                spellMap,
                ownerLevel
              ),
            },
          }
        : entry;
    return finishItem(inline, spellMap, ownerLevel);
  }

  const quantity = entry.quantity != null ? entry.quantity : 1;
  const cat = catalogMap.get(String(entry.ref));
  if (!cat) {
    const stub = { name: `(unknown item: ${entry.ref})`, weight: 0, quantity };
    if (entry.uid != null) stub.uid = entry.uid;
    return stub;
  }

  const resolved = { ...cat, quantity, id: entry.id || cat.id };
  // Stable per-entry id (Slice 1): carried through verbatim so the durable
  // live-loadout layer can target this specific entry. Inert when absent.
  if (entry.uid != null) resolved.uid = entry.uid;
  if (entry.invested != null) resolved.invested = entry.invested;
  if (cat.container) {
    resolved.container = {
      ...cat.container,
      contents: resolveInventory(
        entry.container && entry.container.contents,
        catalogMap,
        spellMap,
        ownerLevel
      ),
    };
  }
  // Gate artifact abilities by owner level, then inline wand/scroll/staff
  // spell refs — see finishItem.
  return finishItem(resolved, spellMap, ownerLevel);
};

export const resolveInventory = (list, catalogMap, spellMap, ownerLevel) =>
  (Array.isArray(list) ? list : []).map((e) =>
    resolveInventoryItem(e, catalogMap, spellMap, ownerLevel)
  );

// Resolve a character's inventory against the item catalog. Characters with
// no inventory array are returned untouched (shape preserved).
export const resolveCharacterItems = (character, items, spells) => {
  if (!character || typeof character !== 'object') return character;
  if (!Array.isArray(character.inventory)) return character;
  return {
    ...character,
    inventory: resolveInventory(
      character.inventory,
      itemCatalogMap(items),
      spellCatalogMap(spells),
      character.level
    ),
  };
};

// Image catalog: each entry is { id, name, folder, mimeType, createdAt }. The
// id is the R2 object key (img_<uuid>.<ext>) and is stable across renames.
export const withImageId = (img, index = 0) => ({
  ...img,
  id: img.id || `img-${index}`,
});

export const normalizeImages = (arr) =>
  (Array.isArray(arr) ? arr : []).map((img, i) => withImageId(img, i));

// Character sheets already carry an `id` (e.g. "Pellias"); keep it (fall back
// to a slug of the name) and preserve the entire deeply-nested sheet as-is.
export const withCharacterId = (character, index = 0) => ({
  ...character,
  id: character.id || `${slugify(character.name)}${index ? `-${index}` : ''}`,
});

export const normalizeCharacters = (arr) =>
  (Array.isArray(arr) ? arr : []).map((c, i) => withCharacterId(c, i));

export const DEFAULT_THEME = {
  id: 'campaign',
  preset: 'ember',
  palette: {
    accent: '#c0440e',
    accentMid: '#e85d1a',
    gold: '#c49a2e',
    arcane: '#7a54ba',
    verdant: '#3d9458',
    peril: '#ef5350',
    bg: '#12100e',
    surface: '#1a1612',
    surfaceCard: 'rgba(28, 24, 18, 0.82)',
    text: '#f5ede4',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    textTertiary: 'rgba(255, 255, 255, 0.45)',
    border: 'rgba(255, 255, 255, 0.07)',
    borderStrong: 'rgba(255, 255, 255, 0.12)',
  },
  accentOverrides: {},
};

export const normalizeTheme = (raw) => {
  const list = Array.isArray(raw) ? raw : [];
  const doc = list.find((d) => d.id === 'campaign');
  if (!doc) return DEFAULT_THEME;
  return {
    ...DEFAULT_THEME,
    ...doc,
    palette: { ...DEFAULT_THEME.palette, ...(doc.palette || {}) },
    accentOverrides: { ...(doc.accentOverrides || {}) },
  };
};

// The default content shipped with the build, normalized for seeding/fallback.
export const defaultContent = () => ({
  quest: normalizeQuests(defaultQuests),
  faction: normalizeFactions(defaultReputation && defaultReputation.Factions),
  calendar: normalizeCalendar(defaultCalendar),
  lore: normalizeLore(defaultLoreEntries),
  trait: normalizeTraits(traitsData && traitsData.traits),
  character: normalizeCharacters(defaultCharacters),
  item: normalizeItems(itemsData && itemsData.items),
  spell: normalizeSpells(spellsData && spellsData.spells),
  effect: normalizeEffects(defaultEffects),
  image: [],
  theme: [DEFAULT_THEME],
});

// Body for POST /api/gm/seed.
export const buildSeedPayload = (force = false) => ({
  force,
  collections: defaultContent(),
});
