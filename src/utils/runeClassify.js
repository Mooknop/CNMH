// Rune classification (#885). The canonical "what kind of rune is this" used by
// the GM catalog editors (GmRunes / GmArmorRunes / GmItems) and the player shop.
//
// Forward-compatible by design: a rune's slot is its explicit `target`
// (weapon | armor | ring | accessory | …) when set, so new rune kinds just carry
// `target`; the legacy `armorRune` boolean is the weapon/armor fallback for docs
// authored before the field existed. No content migration needed today — the
// classifier derives correctly from what's there.

// Buyable fundamental-rune ITEM-catalog entries (the +1 counterparts) whose ids
// don't carry `armorRune` — listed so isRuneItem still catches them.
export const FUNDAMENTAL_RUNE_ITEM_IDS = new Set(['weapon-potency', 'striking', 'armor-potency', 'resilient', 'reinforcing']);

// A rune's target slot: explicit `target` wins; else armor when `armorRune`, else
// weapon. Returns null for a non-object.
export const runeTarget = (rune) => {
  if (!rune || typeof rune !== 'object') return null;
  if (rune.target) return rune.target;
  return rune.armorRune ? 'armor' : 'weapon';
};

// A rune CATALOG doc — property or fundamental. (Fundamentals are table-derived
// and not authored in the property-rune editors; callers filter on type too.)
export const isRuneDoc = (doc) => !!doc && (doc.type === 'property' || doc.type === 'fundamental');

// An ITEM-catalog entry that is actually a rune, so it stays out of the general
// items list. Any of: the `armorRune` flag, a known fundamental rune-item id, an
// id present in the rune catalog (`runeIds`), or a 'Rune' trait.
export const isRuneItem = (item, runeIds) => {
  if (!item || typeof item !== 'object') return false;
  if (item.armorRune) return true;
  if (FUNDAMENTAL_RUNE_ITEM_IDS.has(item.id)) return true;
  if (runeIds && runeIds.has(String(item.id))) return true;
  return Array.isArray(item.traits) && item.traits.includes('Rune');
};
