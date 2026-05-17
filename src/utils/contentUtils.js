// Helpers shared by the content layer (ContentContext) and the GM editor.
// Bundled JSON entities (quests, etc.) have no stable id; we derive a kebab
// slug from the title so rows have a primary key and React keys are stable.

import { quests as defaultQuests, reputation as defaultReputation } from '../data';

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

// The default content shipped with the build, normalized for seeding/fallback.
// Slices 3-5 extend this object with their collections.
export const defaultContent = () => ({
  quest: normalizeQuests(defaultQuests),
  faction: normalizeFactions(defaultReputation && defaultReputation.Factions),
});

// Body for POST /api/gm/seed.
export const buildSeedPayload = (force = false) => ({
  force,
  collections: defaultContent(),
});
