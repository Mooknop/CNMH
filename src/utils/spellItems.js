// src/utils/spellItems.js
// Scroll / Wand base-template resolver spine (#812, Slice 1 / #813).
//
// There is exactly one Magic Scroll base and one Magic Wand base, so — like the
// fixed POTENCY / STRIKING tables in `weaponRunes.js`, NOT the open property-rune
// catalog — the base lives in code as a rank table. Folds a catalog spell plus
// its scroll/wand block into the effective item metadata (level, price, bulk,
// traits, usage, source, activate text, craft requirements, display name),
// keying level/price off the *cast rank*, not the spell's base level.
//
// Pure functions only — no UI, no catalog reads, no contentUtils import. The
// caller resolves `spellRef` → catalog spell (epic #622) and hands the spell in.

// Fixed level + price (gp) per spell rank. Magic Scroll, GM Core pg. 262.
export const SCROLL_BY_RANK = {
  1: { level: 1, price: 4 },
  2: { level: 3, price: 12 },
  3: { level: 5, price: 30 },
  4: { level: 7, price: 70 },
  5: { level: 9, price: 150 },
  6: { level: 11, price: 300 },
  7: { level: 13, price: 600 },
  8: { level: 15, price: 1300 },
  9: { level: 17, price: 3000 },
  10: { level: 19, price: 8000 },
};

// Fixed level + price (gp) per spell rank. Magic Wand, GM Core pg. 282.
// Wands top out at rank 9 (a rank-10 spell can't be put in a wand).
export const WAND_BY_RANK = {
  1: { level: 3, price: 60 },
  2: { level: 5, price: 160 },
  3: { level: 7, price: 360 },
  4: { level: 9, price: 700 },
  5: { level: 11, price: 1400 },
  6: { level: 13, price: 3000 },
  7: { level: 15, price: 6500 },
  8: { level: 17, price: 15000 },
  9: { level: 19, price: 40000 },
};

// Shared base metadata for each kind. Per-spell pieces (name, traits union with
// the spell's traditions, level, price) are layered on in the resolver.
const SCROLL_BASE = {
  kind: 'scroll',
  label: 'Scroll',
  bulk: 'L',
  usage: 'held in 1 hand',
  source: 'GM Core pg. 262',
  traits: ['Consumable', 'Magical', 'Scroll'],
  activate: 'Cast a Spell — You Cast the Spell at the indicated rank.',
  craftRequirements: 'You must be able to cast the spell the scroll contains at the listed rank.',
  table: SCROLL_BY_RANK,
};

const WAND_BASE = {
  kind: 'wand',
  label: 'Wand',
  bulk: 'L',
  usage: 'held in 1 hand',
  source: 'GM Core pg. 282',
  traits: ['Magical', 'Wand'],
  activate: 'Cast a Spell; Frequency once per day, plus overcharge.',
  craftRequirements: 'You must be able to cast the spell the wand contains at the listed rank.',
  table: WAND_BY_RANK,
};

// The cast rank a scroll/wand fires at: the block's explicit override (a
// heightened scroll), else the spell's own base level. Null when neither is a
// usable positive integer.
export const castRank = (spell, block) => {
  const raw = block && block.rank != null ? block.rank : spell && spell.level;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// "Scroll of Heal", plus a "(Rank 5)" suffix when the cast rank exceeds the
// spell's base level (a heightened casting baked into the item). A missing
// spell name degrades to "(unknown spell)" so React keys / displays never break.
const buildName = (base, spell, rank) => {
  const spellName = (spell && spell.name) || '(unknown spell)';
  const heightened = rank != null && spell && spell.level != null && rank > spell.level;
  return `${base.label} of ${spellName}${heightened ? ` (Rank ${rank})` : ''}`;
};

// Core resolver: fold a catalog spell + its scroll/wand block over a base
// template into effective item metadata. Out-of-range or missing rank falls
// back to null level/price (the row simply isn't priced) without throwing, so a
// dangling/heightened-too-far ref still renders a named, traited stub.
const resolve = (base, spell, block) => {
  const rank = castRank(spell, block);
  const row = rank != null ? base.table[rank] : null;
  return {
    kind: base.kind,
    name: buildName(base, spell, rank),
    rank,
    level: row ? row.level : null,
    price: row ? row.price : null,
    bulk: base.bulk,
    traits: [...base.traits],
    usage: base.usage,
    source: base.source,
    activate: base.activate,
    craftRequirements: base.craftRequirements,
  };
};

/**
 * Resolve a Magic Scroll from its embedded catalog spell + scroll block.
 * @param {Object} spell - Catalog spell ({ name, level, traditions, ... })
 * @param {Object} [block] - The item's `scroll` block ({ spellRef, rank? })
 * @returns {{ kind, name, rank, level, price, bulk, traits, usage, source, activate, craftRequirements }}
 */
export const resolveScroll = (spell, block) => resolve(SCROLL_BASE, spell, block);

/**
 * Resolve a Magic Wand from its embedded catalog spell + wand block.
 * @param {Object} spell - Catalog spell ({ name, level, traditions, ... })
 * @param {Object} [block] - The item's `wand` block ({ spellRef, rank? })
 * @returns {{ kind, name, rank, level, price, bulk, traits, usage, source, activate, craftRequirements }}
 */
export const resolveWand = (spell, block) => resolve(WAND_BASE, spell, block);
