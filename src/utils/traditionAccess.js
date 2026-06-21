// src/utils/traditionAccess.js
// Tradition gating for item-activated spells (epic #645).
//
// Activating a wand, scroll, or staff via Cast a Spell requires the spell to
// share a tradition with the caster. This module is the single source of truth
// for that check.
//
// SCOPE: only wand/scroll/staff (and other item/chained spell sources) pass
// through here. INNATE spells are exempt by GM ruling and must NOT be filtered
// with this resolver. Repertoire spells are the caster's own list and match by
// construction, so gating them is a no-op.

export const TRADITIONS = ['arcane', 'divine', 'occult', 'primal'];

const norm = (t) => String(t == null ? '' : t).trim().toLowerCase();

/**
 * A character's casting traditions, lowercased. Accepts either the singular
 * `spellcasting.tradition` (current data shape, e.g. "Occult") or a future
 * `spellcasting.traditions` array. Returns [] for non-casters.
 * @param {Object} character
 * @returns {string[]}
 */
export const getCasterTraditions = (character) => {
  const sc = (character && character.spellcasting) || {};
  const raw = Array.isArray(sc.traditions)
    ? sc.traditions
    : sc.tradition != null
      ? [sc.tradition]
      : [];
  return raw.map(norm).filter(Boolean);
};

const spellTraditions = (spell) =>
  (Array.isArray(spell && spell.traditions) ? spell.traditions : []).map(norm).filter(Boolean);

/**
 * Whether `character` can activate `spell` from a wand/scroll/staff.
 *
 * @param {Object} character
 * @param {Object} spell - catalog-resolved spell (expects a `traditions` array)
 * @param {{ itemType?: 'scroll'|'wand'|'staff' }} [opts] - source kind; reserved
 *   for the scroll-only override (Ashka, S5 #650). Unused here.
 * @returns {boolean}
 */
export const canActivateSpellItem = (character, spell, opts = {}) => {
  void opts; // itemType is consumed by the S5 override; accepted now for callers.

  // Data fallback: a spell carrying no tradition data is allowed rather than
  // silently hidden. Post-S1 backfill every non-focus catalog spell has
  // traditions; focus spells are traditionless but never item-activated.
  const spellTrads = spellTraditions(spell);
  if (spellTrads.length === 0) return true;

  const casterTrads = getCasterTraditions(character);
  if (casterTrads.length === 0) return false;

  const casterSet = new Set(casterTrads);
  return spellTrads.some((t) => casterSet.has(t));
};
