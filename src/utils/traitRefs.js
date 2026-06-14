// Helpers for connecting the comma-separated `traits` reference fields on
// content (items, spells, strikes/actions…) to the trait-definition catalog
// edited on the GmTraits page. Matching is by name, case-insensitive — names
// stay the key, no migration to ids (issue #376).

// Parse a comma-separated traits string into a trimmed, de-blanked list.
// Tolerant of non-string input (returns []), matching the old per-editor copies
// it replaces (GmItems / AbilitySubforms).
export const toList = (csv) =>
  String(csv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// Canonical form used for matching/dedup: trimmed + lower-cased.
export const normalizeTraitName = (name) => String(name || '').trim().toLowerCase();

// Find the trait definition whose name matches `name` (case-insensitive, exact).
// Returns the definition or undefined. `defs` is the `useContent().traits` array.
export const findTraitDef = (name, defs) => {
  const key = normalizeTraitName(name);
  if (!key) return undefined;
  return (Array.isArray(defs) ? defs : []).find((d) => normalizeTraitName(d && d.name) === key);
};

// Walk the catalog collections that carry trait references and aggregate them by
// normalized name. Returns a Map: normName -> { display, refs: [{ collection,
// id, name }] }, where `display` is the first spelling seen. Covered surfaces:
// items (+ a scroll/wand's inline spell), spells, and monsters/bestiary.
export const collectTraitReferences = (content) => {
  const map = new Map();
  const add = (name, ref) => {
    const key = normalizeTraitName(name);
    if (!key) return;
    if (!map.has(key)) map.set(key, { display: String(name).trim(), refs: [] });
    map.get(key).refs.push(ref);
  };
  const fromList = (arr, ref) => {
    (Array.isArray(arr) ? arr : []).forEach((t) => add(t, ref));
  };

  const c = content || {};
  (Array.isArray(c.items) ? c.items : []).forEach((it) => {
    const ref = { collection: 'item', id: it.id, name: it.name };
    fromList(it.traits, ref);
    // A scroll/wand's nested spell is the scroll/wand object itself; it may carry
    // its own traits (or be a bare spellRef, which has none).
    if (it.scroll) fromList(it.scroll.traits, { ...ref, name: `${it.name} (spell)` });
    if (it.wand) fromList(it.wand.traits, { ...ref, name: `${it.name} (spell)` });
  });
  (Array.isArray(c.spells) ? c.spells : []).forEach((sp) =>
    fromList(sp.traits, { collection: 'spell', id: sp.id, name: sp.name })
  );
  (Array.isArray(c.monsters) ? c.monsters : []).forEach((m) =>
    fromList(m.traits, { collection: 'monster', id: m.id, name: m.name })
  );

  return map;
};

// From a reference map (above) and the definition list, return the orphan
// references — names with no matching definition — sorted alphabetically.
export const orphanTraitReferences = (refMap, defs) =>
  [...refMap.values()]
    .filter((entry) => !findTraitDef(entry.display, defs))
    .sort((a, b) => a.display.toLowerCase().localeCompare(b.display.toLowerCase()));
