// src/utils/InventoryUtils.js
// Utility functions for inventory and container calculations

/**
 * Format Bulk for display
 * @param {number} bulk - Bulk value
 * @returns {string} - Formatted bulk string
 */
export const formatBulk = (bulk) => {
if (bulk === 0) return '—'; // Negligible
if (bulk < 1) return 'L'; // Light Bulk
return parseFloat(bulk.toFixed(1)).toString(); // Regular Bulk
};

/**
 * Calculate total Bulk of items.
 * Item weights are stored directly in Bulk units in the JSON data.
 * @param {Array} items - Array of items
 * @returns {number} - Total bulk
 */
export const calculateItemsBulk = (items) => {
if (!items || !Array.isArray(items)) return 0;

return items.reduce((total, item) => {
    // A dropped item is on the ground — it (and anything inside it) stops
    // counting toward carried Bulk. `state` is the effective state stamped by
    // buildEffectiveInventory; absent on raw inventory ⇒ never 'dropped', so
    // this is backward-compatible.
    if (item && item.state === 'dropped') return total;

    // Item weight is already in Bulk units
    const itemBulk = (item.weight || 0) * (item.quantity || 1);
    
    // If item has contents, recursively calculate their bulk too
    let contentsBulk = 0;
    if (item.container && Array.isArray(item.container.contents)) {
    contentsBulk = calculateItemsBulk(item.container.contents);
    }
    
    // Apply ignored bulk if this is a container
    const ignoredBulk = item.container?.ignored || 0;
    const adjustedContentsBulk = Math.max(0, contentsBulk - ignoredBulk);
    
    return total + itemBulk + adjustedContentsBulk;
}, 0);
};

/**
 * Calculate bulk for a specific container
 * @param {Object} container - Container object with contents
 * @returns {Object} - Object with contentsBulk, capacity, and percentFull
 */
export const calculateContainerBulk = (container) => {
if (!container || !container.contents) {
    return { contentsBulk: 0, capacity: 0, percentFull: 0 };
}

const contentsBulk = calculateItemsBulk(container.contents);
const capacity = container.capacity || 0;
const percentFull = capacity > 0 ? (contentsBulk / capacity) * 100 : 0;

return {
    contentsBulk,
    capacity,
    percentFull: Math.min(percentFull, 100)
};
};

/**
 * Check if an item is a container
 * @param {Object} item - Item to check
 * @returns {boolean} - True if item is a container
 */
export const isContainer = (item) => {
return !!item && !!item.container;
};

/**
 * Normalize a shield block to the canonical key spelling:
 *   { bonus?, hardness?, hp?, brokenThreshold?, ...extras }
 *
 * Historical drift: some authored data uses { health, breakThreshold } while
 * ItemModal/items.json used { hp, broken_threshold }. This maps every legacy
 * spelling onto the canonical keys so the rest of the app only ever sees one
 * shape. Idempotent — feeding canonical data back through returns it unchanged.
 * Only keys actually present are emitted (no defaults injected), so callers can
 * still distinguish "absent" from "zero". Preserves extra fields (e.g.
 * speedPenalty). Returns null for non-shields.
 *
 * @param {Object|null|undefined} shield - raw shield block
 * @returns {Object|null} canonical shield block, or null
 */
export const normalizeShield = (shield) => {
  if (!shield || typeof shield !== 'object') return null;
  // Pull every known HP/threshold spelling out so the spread of `rest` can't
  // re-introduce a legacy key. bonus/hardness already share their canonical name.
  const {
    health, hp,
    breakThreshold, broken_threshold, brokenThreshold,
    ...rest
  } = shield;

  const out = { ...rest };

  const resolvedHp = hp ?? health;
  if (resolvedHp !== undefined) out.hp = resolvedHp;

  const resolvedBt = brokenThreshold ?? breakThreshold ?? broken_threshold;
  if (resolvedBt !== undefined) out.brokenThreshold = resolvedBt;

  return out;
};

/**
 * Whether a normalized shield is broken (its HP at or below its broken
 * threshold). A broken shield grants no AC bonus and cannot Shield Block.
 * Honors an explicit `broken: true` flag (set by the Foundry HP mirror in a
 * later slice) and falls back to the HP/threshold comparison.
 *
 * @param {Object|null} shield - a shield block (canonical or legacy)
 * @returns {boolean}
 */
export const isShieldBroken = (shield) => {
  const s = normalizeShield(shield);
  if (!s) return false;
  if (s.broken === true) return true;
  if (s.hp === undefined || s.brokenThreshold === undefined) return false;
  return s.hp <= s.brokenThreshold;
};

/**
 * Format to a decimal place if needed
 * @param {number} value - Value to format
 * @returns {string} - Formatted value
 */
export const formatDecimal = (value) => {
return parseFloat(value).toFixed(1).replace(/\.0$/, '');
};

/**
 * Derive encumbrance status from bulk values
 * @param {number} bulkUsed - Current bulk carried
 * @param {number} bulkLimit - Maximum bulk before overencumbered
 * @param {number} encumberedThreshold - Bulk at which encumbered begins
 * @returns {{ percentage: number, isEncumbered: boolean, isOverencumbered: boolean }}
 */
export const getBulkStatus = (bulkUsed, bulkLimit, encumberedThreshold) => {
  const percentage = bulkLimit > 0 ? (bulkUsed / bulkLimit) * 100 : 0;
  const isEncumbered = bulkUsed > encumberedThreshold && bulkUsed <= bulkLimit;
  const isOverencumbered = bulkUsed > bulkLimit;
  return { percentage, isEncumbered, isOverencumbered };
};

/**
 * Get level-based DC
 */
export const getLevelBasedDc = (level) => {
    switch (level){
      case 1:
        return 15;
      case 2:
        return 16;
      case 3:
        return 18;
      case 4:
        return 19;
      case 5:
        return 20;
      case 6:
        return 22;
      case 7:
        return 23;
      case 8:
        return 24;
      case 9:
        return 26;
      case 10:
        return 27;
      case 11:
        return 28;
      case 12:
        return 30;
      case 13:
        return 31;
      case 14:
        return 32;
      case 15:
        return 34;
      case 16:
        return 35;
      case 17:
        return 36;
      case 18:
        return 38;
      case 19:
        return 39;
      case 20:
        return 40;
      default:
        return 0;
    }
};

/**
 * Return an item's rarity trait ('Uncommon' | 'Rare' | 'Unique') if present,
 * else null. Common items carry no rarity trait. Case-insensitive match,
 * returns the original-cased trait so callers can display it verbatim.
 */
export const getItemRarity = (item) => {
  const traits = (item && item.traits) || [];
  return traits.find((t) =>
    ['uncommon', 'rare', 'unique'].includes(String(t).toLowerCase())
  ) || null;
};

/**
 * Whether an item should read as magical (gets the arcane card border).
 * True when it carries the Magical trait or has an embedded scroll/wand spell.
 */
export const isItemMagical = (item) => {
  if (!item) return false;
  if (item.scroll || item.wand) return true;
  return ((item.traits) || []).some((t) => String(t).toLowerCase() === 'magical');
};

/**
 * Whether an item is a tracked consumable — one whose copies are used up via
 * the player-writable `cnmh_consumed_<charId>` overlay (inventory itself is
 * GM-gated content). Scrolls qualify implicitly; other consumables (potions,
 * elixirs, oils, …) opt in via catalog `consumable` metadata (#217).
 */
export const isConsumable = (item) => !!(item && (item.scroll || item.consumable));

/**
 * Copies of an item still unspent: authored quantity minus the consumed-overlay
 * count. Non-consumables always report their full quantity.
 * @param {Object} item        - Resolved inventory item
 * @param {Object} consumedMap - Value of `cnmh_consumed_<charId>` ({ [name]: count })
 */
export const remainingQuantity = (item, consumedMap = {}) => {
  const qty = item?.quantity ?? 1;
  if (!isConsumable(item)) return qty;
  return Math.max(0, qty - ((consumedMap || {})[item.name] || 0));
};