// src/utils/inventoryFilter.js
// Search / filter / sort logic for the inventory "Loadout Grid" toolbar. Drives
// the active bag's view only (the Attuned area and Hands strip are not filtered).
// Items carry no explicit type, so categories derive from field presence, the
// same way the tile tint does.
import { isItemMagical, isConsumable, isContainer } from './InventoryUtils';
import { itemTint } from './inventoryTile';

const isWeapon = (item) => !!(item && item.strikes);
const isMagic = (item) => isItemMagical(item) || !!(item && (item.wand || item.staff));

// Filter chips. "Tools" from the design handoff is folded into Gear — the data
// has no marker distinguishing a toolkit from other mundane gear.
export const FILTERS = ['all', 'weapon', 'consumable', 'magic', 'gear'];
export const FILTER_LABELS = {
  all: 'All',
  weapon: 'Weapons',
  consumable: 'Consumables',
  magic: 'Magic',
  gear: 'Gear',
};

/** Whether an item passes the active filter chip. */
export const matchesFilter = (item, filter) => {
  switch (filter) {
    case 'weapon':
      return isWeapon(item);
    case 'consumable':
      return isConsumable(item);
    case 'magic':
      return isMagic(item);
    case 'gear':
      return !isWeapon(item) && !isConsumable(item) && !isContainer(item);
    case 'all':
    default:
      return true;
  }
};

/** Case-insensitive name substring match; empty query matches everything. */
export const matchesQuery = (item, query) => {
  if (!query) return true;
  return String(item?.name || '')
    .toLowerCase()
    .includes(String(query).toLowerCase());
};

// Auto-sort cycle: A–Z → by type → by Bulk (descending).
export const SORTS = ['name', 'type', 'bulk'];
export const SORT_LABELS = { name: 'A–Z', type: 'Type', bulk: 'Bulk' };

/** Next sort mode in the cycle. */
export const nextSort = (sort) => SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length];

const bulkOf = (item) => (item?.weight || 0) * (item?.quantity || 1);
const byName = (a, b) =>
  String(a?.name || '').toLowerCase().localeCompare(String(b?.name || '').toLowerCase());

/** Return a new, sorted copy of the list for the given sort mode. */
export const sortItems = (items, sort) => {
  const list = [...(Array.isArray(items) ? items : [])];
  if (sort === 'bulk') return list.sort((a, b) => bulkOf(b) - bulkOf(a) || byName(a, b));
  if (sort === 'type') return list.sort((a, b) => itemTint(a).localeCompare(itemTint(b)) || byName(a, b));
  return list.sort(byName);
};
