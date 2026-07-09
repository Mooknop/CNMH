// Helpers shared by the content layer (ContentContext) and the GM editor.
// Bundled JSON entities (quests, etc.) have no stable id; we derive a kebab
// slug from the title so rows have a primary key and React keys are stable.

import {
  quests as defaultQuests,
  reputation as defaultReputation,
  loreEntries as defaultLoreEntries,
  sampleCharacters as defaultCharacters,
  calendarEvents as defaultCalendar,
  traits as defaultTraits,
  items as defaultItems,
  spells as defaultSpells,
  images as defaultImages,
  themeDocs as defaultThemeDocs,
  effects as snapshotEffects,
  runes as snapshotRunes,
} from '../data';
import bootstrapEffects from '../data/pf2eEffects';
import bootstrapRunes from '../data/pf2eRunes';
import bootstrapArmorRunes from '../data/armorRunes';
import { FUNDAMENTAL_RUNES } from '../data/fundamentalRunes';
import { isRunestoneEntry, resolveRunestone } from './runestone';
import { isTreasureEntry, resolveTreasure } from './treasure';
import { resolveScroll, resolveWand } from './spellItems';
import { baseSpellItemArt } from './InventoryUtils';

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

// Shared collection plumbing (#1319): every collection stamps a stable id the
// same way (keep an existing id, else slug a label field, index-suffixed so
// accidental duplicates stay distinct) and normalizes via the same list walk.
// The per-collection withXId helpers keep only their genuinely bespoke bits
// (quest notes, faction ranks, lore visibility, rune type defaults, ...).
const stampId = (doc, index, label) =>
  doc.id || `${slugify(label)}${index ? `-${index}` : ''}`;

const normalizeList = (arr, fn) => (Array.isArray(arr) ? arr : []).map(fn);

// Ensure a quest has an `id`. Existing ids are preserved; otherwise derive
// from the title. Notes get index-stable ids for React keys.
export const withQuestId = (quest, index = 0) => {
  const id = stampId(quest, index, quest.title);
  const notes = Array.isArray(quest.notes)
    ? quest.notes.map((n, i) => ({ id: n.id || `${id}-note-${i}`, content: n.content }))
    : [];
  return { ...quest, id, notes };
};

export const normalizeQuests = (arr) => normalizeList(arr, withQuestId);

// Ensure a faction has an `id` (slug of its name) and index-stable rank ids.
export const withFactionId = (faction, index = 0) => {
  const id = stampId(faction, index, faction.name);
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

export const normalizeFactions = (arr) => normalizeList(arr, withFactionId);

// Calendar events vary: some carry `title`, some `name`; some have a fixed
// `date {year?,month,day}`, some only a `recurring` rule string. Preserve all
// original fields untouched — just stamp a stable id (slug of title|name).
export const withCalendarId = (event, index = 0) => ({
  ...event,
  id: stampId(event, index, event.title || event.name),
});

export const normalizeCalendar = (arr) => normalizeList(arr, withCalendarId);

// Lore entries already carry an `id`; keep it (fall back to a slug of the
// title) and preserve every other field (category/summary/content/related/
// createdAt) untouched. `visibility` gates player-facing surfaces:
// anything other than an explicit 'revealed' (including legacy entries with
// no field at all) stays GM-only until the GM reveals it.
export const withLoreId = (entry, index = 0) => ({
  ...entry,
  id: stampId(entry, index, entry.title),
  visibility: entry.visibility === 'revealed' ? 'revealed' : 'gm',
});

export const normalizeLore = (arr) => normalizeList(arr, withLoreId);

// Traits are reference data ({ name, description }); id is a slug of the name.
export const withTraitId = (trait, index = 0) => ({
  ...trait,
  id: stampId(trait, index, trait.name),
});

export const normalizeTraits = (arr) => normalizeList(arr, withTraitId);

// Catalog items are the shared definitions (name/price/weight/traits/
// description + optional mechanical blocks: container{capacity,ignored},
// scroll, wand, strikes, potency, shield, actions). id is a slug of the name.
export const withItemId = (item, index = 0) => ({
  ...item,
  id: stampId(item, index, item.name),
});

export const normalizeItems = (arr) => normalizeList(arr, withItemId);

// id -> doc, for resolving catalog references. One builder backs the item,
// spell, and rune maps (kept as distinct named exports for their importers).
const catalogMap = (list) => {
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach((d) => {
    if (d && d.id != null) map.set(String(d.id), d);
  });
  return map;
};

// id -> catalog item, for resolving inventory references.
export const itemCatalogMap = catalogMap;

// Spell catalog: shared spell definitions referenced by wand/scroll/staff
// blocks (`spellRef`, or a staff-spell entry's `ref`). id is a slug of the
// name — exactly like items. Mirrors withItemId/normalizeItems/itemCatalogMap.
export const withSpellId = (spell, index = 0) => ({
  ...spell,
  id: stampId(spell, index, spell.name),
});

export const normalizeSpells = (arr) => normalizeList(arr, withSpellId);

export const normalizeEffects = (arr) =>
  normalizeList(arr, (e) => ({
    ...e,
    id: e.id || slugify(e.name),
    modifiers: Array.isArray(e.modifiers) ? e.modifiers : [],
  }));

// Property runes (#548 Slice 3) — id-keyed like effects, referenced from an
// item's `runes.property` array.
export const normalizeRunes = (arr) =>
  normalizeList(arr, (r) => ({
    ...r,
    id: r.id || slugify(r.name),
    type: r.type || 'property',
  }));

// Armor property runes (#727) share the `rune` collection — flagged
// armorRune:true — but ship as a code seed (src/data/armorRunes.js) rather than
// the snapshot, so they resolve without a content reseed. Always fold the seed
// into the rune list; an entry of the same id already present (a DO-authored
// override from GmArmorRunes) wins, so the GM can still edit them.
export const mergeArmorRunes = (runes) => {
  const list = Array.isArray(runes) ? runes : [];
  const present = new Set(list.map((r) => r && r.id).filter(Boolean));
  const extras = bootstrapArmorRunes.filter((r) => !present.has(r.id));
  return extras.length ? [...list, ...extras] : list;
};

// Merge the code-seeded fundamental runes (#857 S6a) into a rune list, skipping
// ids already present. Like mergeArmorRunes, these always merge in so the
// runesmith can stock + apply Potency/Striking/Resilient regardless of the DO —
// the rune catalog itself only carries property runes.
export const mergeFundamentalRunes = (runes) => {
  const list = Array.isArray(runes) ? runes : [];
  const present = new Set(list.map((r) => r && r.id).filter(Boolean));
  const extras = FUNDAMENTAL_RUNES.filter((r) => !present.has(r.id));
  return extras.length ? [...list, ...extras] : list;
};

// id -> property-rune doc, for resolving an item's runes.property references.
export const runeCatalogMap = catalogMap;

// id -> catalog spell, for resolving wand/scroll/staff spell references.
export const spellCatalogMap = catalogMap;

// Resolve a focus/devotion/ki spell list. Each entry references a catalog spell
// by `spellRef` (epic #622 — no inline spells), replaced by the catalog spell
// (+ entry-local overrides). A missing or dangling ref yields the same level-0
// stub as resolveSpellBlock so organizeSpellsByRank / React keys never break.
export const resolveFocusSpells = (arr, spellMap) => {
  if (!Array.isArray(arr)) return arr;
  return arr.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    if (entry.spellRef == null) return { name: '(unknown spell)', level: 0 };
    const spell = spellMap && spellMap.get(String(entry.spellRef));
    if (!spell) return { name: `(unknown spell: ${entry.spellRef})`, level: 0 };
    const { spellRef, ...overrides } = entry;
    return { ...spell, ...overrides };
  });
};

// Resolve a character's prepared/known repertoire (`spellcasting.spells`). Each
// entry references a catalog spell by `spellRef` (epic #622), replaced by the
// catalog spell + entry-local overrides (e.g. a per-character `signature` flag).
// A missing or dangling ref yields the same level-0 stub as the other resolvers.
export const resolveRepertoireSpells = (arr, spellMap) => {
  if (!Array.isArray(arr)) return arr;
  return arr.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    if (entry.spellRef == null) return { name: '(unknown spell)', level: 0 };
    const spell = spellMap && spellMap.get(String(entry.spellRef));
    if (!spell) return { name: `(unknown spell: ${entry.spellRef})`, level: 0 };
    const { spellRef, ...overrides } = entry;
    return { ...spell, ...overrides };
  });
};

// Resolve a feat/ancestry innate spell list (`feats[].innate`, `ancestry_spells`).
// Each entry references a catalog spell by `spellRef` (epic #622), replaced by the
// catalog spell + entry-local overrides (e.g. a once-per-day frequency variant).
// A missing or dangling ref yields the same level-0 stub as the other resolvers.
export const resolveInnateSpells = (arr, spellMap) => {
  if (!Array.isArray(arr)) return arr;
  return arr.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    if (entry.spellRef == null) return { name: '(unknown spell)', level: 0 };
    const spell = spellMap && spellMap.get(String(entry.spellRef));
    if (!spell) return { name: `(unknown spell: ${entry.spellRef})`, level: 0 };
    const { spellRef, ...overrides } = entry;
    return { ...spell, ...overrides };
  });
};

// All known locations of a focus/devotion/ki/bloodline spell list inside a
// character document. Each path is an array of string keys (deep-get / deep-set).
// Mirrors FocusSpellsList.getFocusSpells()'s priority order.
export const FOCUS_SPELL_PATHS = [
  ['focus_spells'],
  ['champion', 'devotion_spells'],
  ['monk', 'ki_spells'],
  ['spellcasting', 'bloodline', 'focus_spells'],
  ['witchwarper', 'warpSpells'],
];

// Deep-get a value along a key path, or undefined when any segment is absent.
const deepGet = (obj, path) =>
  path.reduce((cur, k) => (cur != null && typeof cur === 'object' ? cur[k] : undefined), obj);

// Return a clone of obj with value set at path, creating intermediate objects
// only when they already exist one level up (never inserts missing containers).
const deepSet = (obj, path, value) => {
  if (!path.length) return obj;
  const [head, ...rest] = path;
  if (rest.length === 0) return { ...obj, [head]: value };
  if (obj[head] == null || typeof obj[head] !== 'object') return obj;
  return { ...obj, [head]: deepSet(obj[head], rest, value) };
};

// Returns a clone of liveDoc with focus-spell arrays replaced by the spellRef
// form found in bundledDoc, for each FOCUS_SPELL_PATH where bundledDoc has an
// array containing at least one spellRef entry. Leaves liveDoc unchanged when no
// path applies (e.g., the bundled character has no focus spells). Idempotent:
// if the live array already contains only spellRef entries, the result is equal.
//
// Used by the dashboard backfill action to re-point seeded character docs that
// were created before Slice C. The read-modify-write pattern preserves any
// live GM edits to other fields (inventory, feats, etc.).
export const repointFocusSpells = (liveDoc, bundledDoc) => {
  let out = liveDoc;
  for (const path of FOCUS_SPELL_PATHS) {
    const bundledArr = deepGet(bundledDoc, path);
    if (!Array.isArray(bundledArr)) continue;
    const hasRef = bundledArr.some((e) => e && typeof e === 'object' && e.spellRef != null);
    if (!hasRef) continue;
    // Skip if the live array is already content-equal (idempotent).
    if (JSON.stringify(deepGet(out, path)) === JSON.stringify(bundledArr)) continue;
    out = deepSet(out, path, bundledArr);
  }
  return out;
};

// Resolve a wand/scroll spell block. A spell exists ONLY as a catalog entry
// referenced by `spellRef` (epic #622 — no inline spells): the catalog spell is
// spread FIRST so its full shape (name/level/traits/heightened) survives, then
// any sibling keys on the block (e.g. a wand overriding duration) overlay it. A
// missing or dangling ref yields a visible, level-0 stub so organizeSpellsByRank
// / React keys never break — mirrors resolveInventoryItem's "(unknown item)".
const resolveSpellBlock = (block, spellMap) => {
  if (!block || typeof block !== 'object') return block;
  if (block.spellRef == null) return { name: '(unknown spell)', level: 0 };
  const spell = spellMap && spellMap.get(String(block.spellRef));
  if (!spell) return { name: `(unknown spell: ${block.spellRef})`, level: 0 };
  const { spellRef, ...overrides } = block;
  return { ...spell, ...overrides };
};

// Resolve a staff's spell list. Each entry references a catalog spell by `ref`
// (epic #622 — no inline spells), replaced by the catalog spell (+ entry-local
// overrides). A missing or dangling ref yields the same level-0 stub as
// resolveSpellBlock.
const resolveStaffSpells = (staff, spellMap) => {
  if (!staff || !Array.isArray(staff.spells)) return staff;
  return {
    ...staff,
    spells: staff.spells.map((s) => {
      if (!s || typeof s !== 'object') return s;
      if (s.ref == null) return { name: '(unknown spell)', level: 0 };
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

// Bulk L (a scroll/wand) is stored as 0.1 weight units (formatBulk renders any
// 0 < weight < 1 as "L").
const BULK_L_WEIGHT = 0.1;

// A resolved scroll/wand block is a real catalog spell unless it's the
// '(unknown spell…)' stub resolveSpellBlock emits for a missing/dangling ref.
const isResolvedSpell = (block) =>
  !!(block && typeof block === 'object' && typeof block.name === 'string'
    && !block.name.startsWith('(unknown'));

// Overlay the S1 base-template fields (#812) derived from the embedded spell's
// cast rank onto a scroll/wand item. AUTHOR OVERRIDES WIN: each field is filled
// only when the authored item/catalog entry left it unset, so a GM-priced
// unique scroll or a custom-named item keeps its values. A null-priced
// (out-of-range) derivation leaves price/level untouched rather than nulling an
// authored value. No-ops when the block didn't resolve to a real spell.
const hydrateSpellItem = (item, kind, resolveFn, catalogMap) => {
  const block = item[kind];
  if (!isResolvedSpell(block)) return item;
  const derived = resolveFn(block, block);
  const out = { ...item };
  if (out.name == null) out.name = derived.name;
  if (out.level == null && derived.level != null) out.level = derived.level;
  if (out.price == null && derived.price != null) out.price = derived.price;
  if (out.weight == null) out.weight = BULK_L_WEIGHT;
  if (out.traits == null) out.traits = derived.traits;
  if (out.usage == null) out.usage = derived.usage;
  if (out.source == null) out.source = derived.source;
  // Inherit the shared base scroll/wand art (#936) when the item authored none —
  // author override wins, like every other hydrated field. No-op until the GM
  // sets the magic-scroll / magic-wand base image.
  if (out.image == null) {
    const art = baseSpellItemArt(kind, catalogMap);
    if (art) {
      out.image = art.image;
      if (out.imagePosition == null && art.imagePosition != null) out.imagePosition = art.imagePosition;
    }
  }
  return out;
};

// Final shaping shared by both resolution branches: gate artifact abilities by
// owner level FIRST (so a still-locked staff isn't spell-resolved), then inline
// any wand/scroll/staff spell refs and hydrate scroll/wand base-template fields.
// Identity-preserving when nothing applies, so legacy inline items pass through
// byte-for-byte.
const finishItem = (item, spellMap, ownerLevel, runeMap, catalogMap) => {
  if (!item || typeof item !== 'object') return item;
  let out = applyArtifactGating(item, ownerLevel);
  if (out.scroll) {
    const r = resolveSpellBlock(out.scroll, spellMap);
    if (r !== out.scroll) out = { ...out, scroll: r };
    out = hydrateSpellItem(out, 'scroll', resolveScroll, catalogMap);
  }
  if (out.wand) {
    const r = resolveSpellBlock(out.wand, spellMap);
    if (r !== out.wand) out = { ...out, wand: r };
    out = hydrateSpellItem(out, 'wand', resolveWand, catalogMap);
  }
  if (out.staff) {
    const r = resolveStaffSpells(out.staff, spellMap);
    if (r !== out.staff) out = { ...out, staff: r };
  }
  // Inline a weapon's property-rune references (#548 Slice 3): runes.property
  // is authored as an array of rune ids; resolve each against the catalog so
  // weaponRunes/strikeUtils consume full rune docs (id strings that don't
  // resolve are dropped; already-inlined objects pass through untouched).
  if (runeMap && out.runes && Array.isArray(out.runes.property) && out.runes.property.length) {
    const resolved = out.runes.property
      .map((ref) => {
        if (typeof ref === 'string') return runeMap.get(String(ref));
        // A choice-bearing socket ref { id, choice } (Energy-Resistant, #1196 G2):
        // resolve the doc and carry the chosen value through. A fully-inlined
        // property doc (has its own name) passes through untouched.
        if (ref && typeof ref === 'object' && ref.id != null && ref.name == null) {
          const doc = runeMap.get(String(ref.id));
          return doc ? { ...doc, choice: ref.choice } : null;
        }
        return ref;
      })
      .filter(Boolean);
    out = { ...out, runes: { ...out.runes, property: resolved } };
  }
  // Inline an accessory-rune reference (#1033 S1): runes.accessory is stored
  // as a rune id; resolve it to the full doc so the worn-gear spine and the
  // item modal read modifiers/riders without a catalog lookup. An id that
  // doesn't resolve stays a string, which accessoryRuneOf treats as "no doc"
  // (the slot still reads as occupied).
  if (runeMap && out.runes && typeof out.runes.accessory === 'string') {
    const doc = runeMap.get(out.runes.accessory);
    if (doc) out = { ...out, runes: { ...out.runes, accessory: doc } };
  }
  return out;
};

// #907 S1: merge a matched variant onto the resolved item. Descriptive fields
// (name/price/label/effect) overwrite the base as before. A variant may also
// carry an `overrides` object holding variant-specific *mechanical* values —
// currently just `bonus` — that replace the base item's so non-base tiers read
// correctly downstream (e.g. getItemBonus sees the Greater tier's higher bonus).
// The `overrides` key itself is dropped from the resolved item; the authored
// allowlist of mergeable keys is enforced by the itemCatalog.bundled test.
export const applyVariant = (resolved, variant) => {
  Object.assign(resolved, variant);
  if (variant.overrides && typeof variant.overrides === 'object') {
    Object.assign(resolved, variant.overrides);
    delete resolved.overrides;
  }
  return resolved;
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
export const resolveInventoryItem = (entry, catalogMap, spellMap, ownerLevel, runeMap) => {
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
                ownerLevel,
                runeMap
              ),
            },
          }
        : entry;
    return finishItem(inline, spellMap, ownerLevel, runeMap, catalogMap);
  }

  // A runestone is an unattached rune (#800): resolve it from the rune catalog
  // into an inert display item (no strikes/runes), bypassing the item catalog.
  // catalogMap supplies the shared runestone base artwork.
  if (isRunestoneEntry(entry)) return resolveRunestone(entry, runeMap, catalogMap);

  // A generic Treasure Item: fold per-instance name/worth/Bulk/image overrides
  // onto the shared base (inherits its art), bypassing normal catalog lookup.
  if (isTreasureEntry(entry)) return resolveTreasure(entry, catalogMap);

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
  // Multi-level items: when the entry carries a `level`, select the matching
  // variant and merge its fields (price, label, effect, …) onto the resolved
  // item. A dangling level (no variant matches) leaves the base item intact.
  if (entry.level != null && Array.isArray(cat.variants) && cat.variants.length > 0) {
    const variant = cat.variants.find((v) => v.level === entry.level);
    if (variant) applyVariant(resolved, variant);
  }
  // A runed item bought from a Sale Shelf (#1138) lands as a minimal ref entry
  // carrying its rune block (ids); overlay it onto the resolved base — applied
  // AFTER the grade variant so a ring's socketed runes ride its chosen tier — so
  // finishItem inlines the rune refs and the display re-derives the runed name,
  // mirroring the etch flow's inline entry. (Ordinary catalog refs never carry a
  // rune block, so this is inert for them.)
  if (entry.runes && typeof entry.runes === 'object') resolved.runes = entry.runes;
  // A dragonbreath weapon (#1210 M4): the template block rides the ref entry — GM
  // loot (M4f) or a bought shop ware (M4g) — carrying only `{ tier, dragonType }`.
  // Overlay it onto the resolved base weapon so isDragonbreath fires and the
  // resolver derives the display name, Strike dice, breath, and sockets; the base
  // weapon has no template of its own, so nothing is lost by re-deriving.
  if (entry.dragonbreath && typeof entry.dragonbreath === 'object') resolved.dragonbreath = entry.dragonbreath;
  // Read `resolved.container` (not `cat.container`) so a variant's
  // `overrides.container` (#907 S2 — e.g. Sleeves of Storage Greater's larger
  // capacity) is honored; it equals the catalog's container when no override.
  if (resolved.container) {
    resolved.container = {
      ...resolved.container,
      contents: resolveInventory(
        entry.container && entry.container.contents,
        catalogMap,
        spellMap,
        ownerLevel,
        runeMap
      ),
    };
  }
  // Gate artifact abilities by owner level, then inline wand/scroll/staff
  // spell refs and property-rune refs — see finishItem.
  return finishItem(resolved, spellMap, ownerLevel, runeMap, catalogMap);
};

export const resolveInventory = (list, catalogMap, spellMap, ownerLevel, runeMap) =>
  (Array.isArray(list) ? list : []).map((e) =>
    resolveInventoryItem(e, catalogMap, spellMap, ownerLevel, runeMap)
  );

// Resolve a character's crafting recipes against the item catalog.
// Recipes are per-item (not per-variant): level is stripped before resolution
// so the resolved entry carries the base item + full variants array.
// Duplicates (same ref) are collapsed to the first occurrence, making legacy
// per-variant data render correctly without a migration. Inline entries (no
// ref) pass through for back-compat.
export const resolveCraftingRecipes = (crafting, catalogMap, spellMap, ownerLevel, runeMap) => {
  const seen = new Set();
  const deduped = (Array.isArray(crafting) ? crafting : []).filter((e) => {
    if (!e || typeof e !== 'object' || e.ref == null) return true;
    if (seen.has(e.ref)) return false;
    seen.add(e.ref);
    return true;
  });
  return resolveInventory(
    deduped.map((e) => (e && e.ref != null ? { ...e, level: undefined } : e)),
    catalogMap,
    spellMap,
    ownerLevel,
    runeMap,
  );
};

// Resolve a character's inventory (and crafting recipes) against the item
// catalog. Characters with neither are returned untouched (shape preserved).
export const resolveCharacterItems = (character, items, spells, runes) => {
  if (!character || typeof character !== 'object') return character;
  const catalogMap = itemCatalogMap(items);
  const spMap = spellCatalogMap(spells);
  const runeMap = runeCatalogMap(runes);
  let out = character;
  if (Array.isArray(character.inventory)) {
    out = { ...out, inventory: resolveInventory(out.inventory, catalogMap, spMap, character.level, runeMap) };
  }
  if (Array.isArray(character.crafting)) {
    out = { ...out, crafting: resolveCraftingRecipes(out.crafting, catalogMap, spMap, character.level, runeMap) };
  }
  // Repertoire (`spellcasting.spells`) entries are catalog refs (epic #622);
  // resolve them here so every player-facing consumer (SpellsList, the cast
  // flow, encounter) sees full spell data. The GM editor reads rawCharacters,
  // so the authored refs are never clobbered.
  if (out.spellcasting && Array.isArray(out.spellcasting.spells)) {
    out = {
      ...out,
      spellcasting: { ...out.spellcasting, spells: resolveRepertoireSpells(out.spellcasting.spells, spMap) },
    };
  }
  // Innate spells (feats[].innate and ancestry_spells) are catalog refs (epic
  // #622); resolve them here so extractInnateSpells / InnateCastingList / the
  // cast flow see full spell data. The GM editor reads rawCharacters, so the
  // authored refs are never clobbered.
  if (Array.isArray(out.feats)) {
    out = {
      ...out,
      feats: out.feats.map((feat) =>
        feat && Array.isArray(feat.innate)
          ? { ...feat, innate: resolveInnateSpells(feat.innate, spMap) }
          : feat,
      ),
    };
  }
  if (Array.isArray(out.ancestry_spells)) {
    out = { ...out, ancestry_spells: resolveInnateSpells(out.ancestry_spells, spMap) };
  }
  return out;
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
  calendar: normalizeCalendar(defaultCalendar || []),
  lore: normalizeLore(defaultLoreEntries),
  trait: normalizeTraits(defaultTraits || []),
  character: normalizeCharacters(defaultCharacters),
  item: normalizeItems(defaultItems || []),
  spell: normalizeSpells(defaultSpells || []),
  // Effects migrated to the DO (issue #263): the snapshot is canonical once it
  // carries an effect collection; pf2eEffects.js only bootstraps the first seed.
  effect: normalizeEffects(snapshotEffects.length ? snapshotEffects : bootstrapEffects),
  // Property runes (#548): brand-new collection, bootstrap-seeded until the
  // snapshot carries a `rune` array (same pattern as effects).
  rune: mergeFundamentalRunes(mergeArmorRunes(normalizeRunes(snapshotRunes.length ? snapshotRunes : bootstrapRunes))),
  image: normalizeImages(defaultImages || []),
  theme: (defaultThemeDocs && defaultThemeDocs.length) ? defaultThemeDocs : [DEFAULT_THEME],
  monster: [],
});

// Collections written at runtime by the app (persistent bestiary), never
// bundled — the seed must never send them, or a force reseed would wipe the
// captured creatures. The server also guards this, but we never ask (#760).
export const CAPTURE_ONLY_COLLECTIONS = ['monster'];

// Body for POST /api/gm/seed.
export const buildSeedPayload = (force = false) => {
  const collections = defaultContent();
  for (const c of CAPTURE_ONLY_COLLECTIONS) delete collections[c];
  return { force, collections };
};
