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
