// src/components/encounter/commandsheet/buildActionCatalog.js
// Pure adapter for the Command Sheet action grid (#410).
//
// Flattens a character's assembled action set + the basic encounter actions
// into a single list of "tiles", each tagged with the cost group it belongs to
// (1 / 2 / 3 actions) and a filter category. The grid renders these grouped by
// cost; tiles still open the existing resolution path via onUse(raw, cost).
//
// This is deliberately a pure function over already-resolved inputs (the lists
// `useCharacter` exposes) so it is trivial to unit-test without React.

import {
  BASIC_ACTIONS_OFFENSIVE,
  BASIC_ACTIONS_DEFENSIVE,
  BASIC_ACTIONS_MOVEMENT,
} from '../../../data/encounterActions';
import { formatModifier } from '../../../utils/CharacterUtils';

// Short labels for the maneuver "vs <defense>" stat line.
const DEFENSE_SHORT = {
  ac: 'AC',
  fortitude: 'Fort',
  reflex: 'Ref',
  will: 'Will',
  perception: 'Perc',
};

// Filter buckets surfaced as chips. 'other' is matched only by "All".
export const CATEGORY_ORDER = ['attack', 'magic', 'skill', 'defense', 'move', 'item'];

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Cost used for grouping: variable-cost actions group under their minimum.
const baseCost = (item) => {
  if (item.variableActionCount?.min) return item.variableActionCount.min;
  return item.actionCount || 1;
};

const statLineFor = (item, cat) => {
  if (cat === 'attack' && (item.attackMod !== undefined || item.damage)) {
    const atk = item.attackMod !== undefined ? formatModifier(item.attackMod) : null;
    return [atk, item.damage].filter(Boolean).join(' · ') || null;
  }
  if (item.targetDefense && DEFENSE_SHORT[item.targetDefense]) {
    return `vs ${DEFENSE_SHORT[item.targetDefense]}`;
  }
  if (item.highlightSkill) return capitalize(item.highlightSkill);
  return null;
};

// Category for a custom (character/feat/item) action, derived from its traits.
const catForCustomAction = (item) => {
  if (item.traits?.includes('Attack')) return 'attack';
  if (item.traits?.includes('Move')) return 'move';
  if (item.highlightSkill) return 'skill';
  if (item.source) return 'item';
  return 'other';
};

// Whether a tile needs a focused foe before it can resolve (#411). Strikes and
// any maneuver that rolls "vs <defense>" (e.g. Demoralize vs Will, Feint vs
// Perception) need a target; an action can opt out with `requiresTarget: false`
// (pure movement like Stride, self-buffs like Stand).
const tileNeedsTarget = (item, cat) =>
  (cat === 'attack' || item.targetDefense != null) ? item.requiresTarget !== false : false;

let uid = 0;
const makeTile = (item, cat, originType) => {
  uid += 1;
  const cost = baseCost(item);
  return {
    id: `${originType}-${item.name}-${uid}`,
    name: item.name,
    origin: originType, // 'strike' | 'custom' | 'basic' — lets suggestNow score strikes (#413)
    cost,
    costGroup: String(Math.min(Math.max(cost, 1), 3)),
    cat,
    traits: item.traits || [],
    type: 'action',
    requiresTarget: item.requiresTarget,
    needsTarget: tileNeedsTarget(item, cat),
    variableActionCount: item.variableActionCount,
    inactive: item.active === false,
    statLine: statLineFor(item, cat),
    raw: item,
  };
};

/**
 * Build the flat tile catalog for the action grid.
 * @param {Object}  input
 * @param {Array}   input.actions  - character/feat/item actions (useCharacter().actions)
 * @param {Array}   input.strikes  - resolved strikes (useCharacter().strikes)
 * @returns {Array} tile objects
 */
export function buildActionCatalog({ actions = [], strikes = [] } = {}) {
  uid = 0;
  const tiles = [];

  strikes.forEach((s) => tiles.push(makeTile(s, 'attack', 'strike')));
  actions.forEach((a) => tiles.push(makeTile(a, catForCustomAction(a), 'custom')));
  // Offensive basics: Attack-trait maneuvers are attacks; skill-based ones
  // (e.g. Feint) bucket under Skill so the filter chips stay meaningful.
  BASIC_ACTIONS_OFFENSIVE.forEach((a) => {
    const cat = a.traits?.includes('Attack') ? 'attack' : (a.highlightSkill ? 'skill' : 'attack');
    tiles.push(makeTile(a, cat, 'basic'));
  });
  BASIC_ACTIONS_DEFENSIVE.forEach((a) => tiles.push(makeTile(a, 'defense', 'basic')));
  BASIC_ACTIONS_MOVEMENT.forEach((a) => {
    const cat = a.traits?.includes('Attack') ? 'attack' : 'move';
    tiles.push(makeTile(a, cat, 'basic'));
  });

  return tiles;
}

/**
 * Filter the catalog by category chip + free-text query.
 * @param {Array}  tiles
 * @param {Object} opts
 * @param {string} opts.cat   - 'all' | category
 * @param {string} opts.query - free text matched against name/traits
 */
export function filterTiles(tiles, { cat = 'all', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return tiles.filter((t) => {
    if (cat !== 'all' && t.cat !== cat) return false;
    if (!q) return true;
    const hay = `${t.name} ${t.traits.join(' ')} ${t.raw.description || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

/**
 * Which category chips to show: 'all' first, then any present category in a
 * stable order. (Magic is added by the grid itself since it is a launcher, not
 * a catalog tile.)
 */
export function categoriesPresent(tiles) {
  const present = new Set(tiles.map((t) => t.cat));
  return ['all', ...CATEGORY_ORDER.filter((c) => present.has(c))];
}
