// Runestone (#800, R1 of the rune-shopping epic #799).
//
// A runestone is an inventory entry that represents an UNATTACHED rune: a blank
// etching stone (3 gp, Bulk L, Consumable/Magical — PF2e GM Core p.269) that
// holds a single rune. It surfaces the held rune's name and combined value for
// inventory + shop display, but grants NO mechanical effect — it carries no
// `runes`/`strikes` block, so strikeUtils/weaponRunes never see it. The rune
// stays inert until it is transferred onto a weapon (R4 #803), at which point
// the stone is destroyed.
//
// Entry shape (resolved by resolveInventoryItem when `ref === 'runestone'`):
//   { ref: 'runestone', runeRef?: <rune id>, uid?, quantity?, id? }
// A missing `runeRef` is a blank stone; a dangling one yields a visible,
// weightless-safe "unknown rune" marker so bulk math never breaks.
//
// Fundamental runestones (#832): potency/striking runes are not catalog docs —
// they live as fixed tier tables (utils/weaponRunes.js, surfaced as rune docs by
// data/fundamentalRunes.js). A fundamental descriptor replaces `runeRef`:
//   { ref: 'runestone', fundamental: 'potency', tier: 1|2|3 }
//   { ref: 'runestone', fundamental: 'striking', key: 'striking'|'greater'|'major' }
// resolveRunestone reads name/price/level from those tables when `fundamental`
// is set (no runeMap lookup).

import { weaponFundamentalFor } from '../data/fundamentalRunes';

export const RUNESTONE_BASE = {
  id: 'runestone',
  name: 'Runestone',
  price: 3,
  weight: 0.1, // Bulk L
  traits: ['Consumable', 'Magical'],
  description:
    'This flat piece of hard stone is specially prepared for etching a magical ' +
    'fundamental rune or property rune. You can etch only one rune upon a stone. ' +
    'When a rune is transferred from the runestone to another object, the ' +
    'runestone cracks and is destroyed. The Price listed is for an empty stone; ' +
    'a stone holding a rune adds the Price of the rune.',
};

// True when an inventory entry is a runestone (carries the runestone ref).
export const isRunestoneEntry = (entry) =>
  !!entry && typeof entry === 'object' && entry.ref === 'runestone';

const dedupe = (arr) => [...new Set(arr.filter(Boolean))];

// Resolve a runestone entry into a display item: the base stone with the held
// rune's name/value/traits folded in (value = stone price + rune price) and a
// `runestone: { runeRef, rune }` marker the UI reads. Never produces a `runes`
// or `strikes` block — a runestone grants no effect while unattached.
//
// `catalogMap` (optional) supplies the shared runestone artwork: the base stone
// lives in code (mechanics/price), but its image is carried by the `runestone`
// catalog doc so a GM can assign it through the image tools — mirrors the
// magic-scroll/magic-wand base-art inheritance (#812/#936). Every stone displays
// that image unless it authored its own.
export const resolveRunestone = (entry, runeMap, catalogMap) => {
  const quantity = entry && entry.quantity != null ? entry.quantity : 1;
  const fundamental = entry && entry.fundamental ? entry.fundamental : null;
  const runeRef = !fundamental && entry ? entry.runeRef : null;
  // A fundamental descriptor resolves against the fixed potency/striking tables
  // (#832) — never the property-rune catalog.
  const rune = fundamental
    ? weaponFundamentalFor(entry)
    : runeRef != null && runeMap ? runeMap.get(String(runeRef)) : null;

  const resolved = {
    ...RUNESTONE_BASE,
    quantity,
    id: (entry && entry.id)
      || (fundamental && rune ? `runestone-${rune.id}` : null)
      || (runeRef != null ? `runestone-${runeRef}` : RUNESTONE_BASE.id),
    runestone: fundamental
      ? {
        runeRef: null,
        fundamental,
        ...(fundamental === 'potency' ? { tier: entry.tier } : { key: entry.key }),
        rune: rune || null,
      }
      : { runeRef: runeRef != null ? runeRef : null, rune: rune || null },
  };
  if (entry && entry.uid != null) resolved.uid = entry.uid;

  const base = catalogMap && typeof catalogMap.get === 'function' ? catalogMap.get(RUNESTONE_BASE.id) : null;
  if (resolved.image == null && base && base.image != null) {
    resolved.image = base.image;
    if (resolved.imagePosition == null && base.imagePosition != null) resolved.imagePosition = base.imagePosition;
  }

  if (rune) {
    resolved.name = `${rune.name} Runestone`;
    resolved.price = (RUNESTONE_BASE.price || 0) + (Number(rune.price) || 0);
    resolved.traits = dedupe([
      ...RUNESTONE_BASE.traits,
      ...(Array.isArray(rune.traits) ? rune.traits : []),
    ]);
  } else if (fundamental) {
    // Unknown fundamental/tier: visible marker, weightless-safe (mirrors the
    // dangling-runeRef case).
    resolved.name = `Runestone (unknown ${fundamental} rune)`;
  } else if (runeRef != null) {
    resolved.name = `Runestone (unknown rune: ${runeRef})`;
  }
  return resolved;
};
