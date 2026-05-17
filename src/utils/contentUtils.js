// Helpers shared by the content layer (ContentContext) and the GM editor.
// Bundled JSON entities (quests, etc.) have no stable id; we derive a kebab
// slug from the title so rows have a primary key and React keys are stable.

import {
  quests as defaultQuests,
  reputation as defaultReputation,
  loreEntries as defaultLoreEntries,
} from '../data';
import defaultCalendar from '../data/CalendarEvents.json';
import traitsData from '../data/traits.json';

export const slugify = (str) =>
  String(str || '')
    .toLowerCase()
    .trim()
    .replace(/['’`]/g, '') // drop apostrophes so "Milton's" -> "miltons"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';

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

// The default content shipped with the build, normalized for seeding/fallback.
// Slice 5 extends this object with the character collection.
export const defaultContent = () => ({
  quest: normalizeQuests(defaultQuests),
  faction: normalizeFactions(defaultReputation && defaultReputation.Factions),
  calendar: normalizeCalendar(defaultCalendar),
  lore: normalizeLore(defaultLoreEntries),
  trait: normalizeTraits(traitsData && traitsData.traits),
});

// Body for POST /api/gm/seed.
export const buildSeedPayload = (force = false) => ({
  force,
  collections: defaultContent(),
});
