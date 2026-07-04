// Generic Treasure Item.
//
// A single catalog base (`treasure-item`) stands in for every non-mechanical
// valuable the party finds — gems, jewelry, art objects, silver bowls, garnet
// beads. Rather than authoring one catalog doc per trinket, an inventory / loot
// entry references the shared base and overrides just the bits that vary:
//
//   { ref: 'treasure-item', name?, price?, value?, weight?, quantity?, image? }
//
// Worth reads `price`, falling back to `value` so a treasure-cache valuable
// ({ name, qty, value }) resolves without a rewrite. The shared base artwork is
// inherited from the `treasure-item` catalog doc (a GM assigns it through the
// image tools) unless the entry sets its own image — same base-art pattern as
// runestones (#800) and the magic-scroll/magic-wand bases (#812/#936). Grants no
// mechanical block, so strike/rune/effect resolvers never see it.

// Code fallback so a treasure entry still resolves before the catalog doc lands
// (or in tests). The catalog doc, when present, supplies name/description/art.
export const TREASURE_BASE = {
  id: 'treasure-item',
  name: 'Treasure',
  weight: 0,
  traits: ['Treasure'],
  description:
    'A valuable object with no mechanical use — gems, jewelry, art objects, and ' +
    'other miscellany. Its name, Bulk, and value are set per item.',
};

// True when an inventory/loot entry is a generic treasure (carries the base ref).
export const isTreasureEntry = (entry) =>
  !!entry && typeof entry === 'object' && entry.ref === 'treasure-item';

// Resolve a treasure entry into a display item: the shared base with per-instance
// overrides folded in. `catalogMap` (optional) supplies the authored base doc
// (name/description/traits/art); the code TREASURE_BASE is the fallback.
export const resolveTreasure = (entry, catalogMap) => {
  const base = catalogMap && typeof catalogMap.get === 'function' ? catalogMap.get(TREASURE_BASE.id) : null;
  const quantity = entry && entry.quantity != null ? entry.quantity : 1;

  const resolved = {
    ...TREASURE_BASE,
    ...(base || {}), // authored base doc wins for shared fields (name/desc/art)
    id: (entry && entry.id) || TREASURE_BASE.id,
    quantity,
  };

  if (entry) {
    if (entry.name != null) resolved.name = entry.name;
    const worth = entry.price != null ? entry.price : entry.value;
    if (worth != null) resolved.price = worth;
    if (entry.weight != null) resolved.weight = entry.weight;
    if (entry.image != null) {
      resolved.image = entry.image;
      if (entry.imagePosition != null) resolved.imagePosition = entry.imagePosition;
    }
    if (entry.uid != null) resolved.uid = entry.uid;
  }

  return resolved;
};
