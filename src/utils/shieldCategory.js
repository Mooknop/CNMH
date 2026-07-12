// src/utils/shieldCategory.js
// Single source of truth for a shield's size category, keyed off its Bulk.
//
// PF2e "Everything Shields" (#1196) sizes shields by Bulk:
//   light  = Bulk < 1  (Light "L", or negligible)
//   medium = Bulk = 1
//   heavy  = Bulk > 1
//
// Consumed by three places that must agree: the Garrison's Specialized Shield
// Training tiers (#1192/#1194), shield property-rune usage gates ("etched onto a
// light shield" — #1196 G2), and shield trait/stat display. Keeping the mapping
// here means those never drift apart.

/**
 * Coerce a Bulk value to a number. Accepts the authored numeric Bulk (0, 0.1,
 * 1, 2…) as well as the display strings the app uses elsewhere: 'L' (Light,
 * treated as < 1) and '—'/'' (negligible, treated as 0). Returns NaN for
 * anything unrecognized so the caller can report "unknown".
 * @param {number|string|null|undefined} bulk
 * @returns {number}
 */
const toBulkNumber = (bulk) => {
  if (typeof bulk === 'number') return bulk;
  if (typeof bulk !== 'string') return NaN;
  const trimmed = bulk.trim();
  if (trimmed === '' || trimmed === '—' || trimmed === '-') return 0;
  if (trimmed.toLowerCase() === 'l') return 0.1; // Light Bulk
  const n = parseFloat(trimmed);
  return Number.isNaN(n) ? NaN : n;
};

/**
 * The shield size category ('light' | 'medium' | 'heavy') for a Bulk value, or
 * null when the Bulk can't be read. Light < 1, medium === 1, heavy > 1.
 * @param {number|string|null|undefined} bulk
 * @returns {'light'|'medium'|'heavy'|null}
 */
export const shieldCategory = (bulk) => {
  const n = toBulkNumber(bulk);
  if (Number.isNaN(n)) return null;
  if (n < 1) return 'light';
  if (n === 1) return 'medium';
  return 'heavy';
};

/**
 * The shield size categories a usage-gated doc admits, as a lowercase array
 * (a subset of ['light','medium','heavy']), or null when unrestricted. Read from
 * an explicit `shieldCategories` array first, else the category words present in
 * the `usage` string. Shared by shield property runes (runeSockets) and shield
 * augmentations (augmentations) so the two gates never drift.
 * @param {{usage?: string, shieldCategories?: string[]}|null|undefined} doc
 * @returns {Array<'light'|'medium'|'heavy'>|null}
 */
export const shieldCategoriesFromUsage = (doc) => {
  if (Array.isArray(doc?.shieldCategories) && doc.shieldCategories.length) {
    return doc.shieldCategories.map((c) => String(c).toLowerCase());
  }
  const usage = doc && typeof doc.usage === 'string' ? doc.usage.toLowerCase() : '';
  const cats = ['light', 'medium', 'heavy'].filter((c) => usage.includes(c));
  return cats.length ? cats : null;
};

export default shieldCategory;
