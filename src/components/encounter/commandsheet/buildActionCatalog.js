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
  BASIC_ENCOUNTER_FREE_ACTIONS,
} from '../../../data/encounterActions';
import { formatModifier } from '../../../utils/CharacterUtils';
import { consumableMeta } from '../../../utils/consumables';
import { itemAbilitiesActive } from '../../../utils/itemState';
import {
  isCapacityWeapon,
  strikeAmmoCapacity,
  isAmmoEligible,
  reloadCost,
  normalizeChamberState,
  nextEmptyChamber,
} from '../../../utils/ammunition';
import { flattenInventory } from '../../../utils/InventoryUtils';

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

// Ally-support actions (#429) — surfaced/ranked when an ally is focused. A
// Healing-trait action or one of the canonical medic actions counts. Treat Wounds
// is intentionally absent (#433): it's a 10-minute *exploration* activity, not an
// encounter action — Battle Medicine is its 1-action in-combat equivalent.
const SUPPORT_NAMES = new Set([
  'Battle Medicine', 'Administer First Aid', 'Staunch Bleeding',
]);
const isSupportAction = (item) =>
  !!(item.traits?.includes('Healing') || SUPPORT_NAMES.has(item.name));

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

// Draw/retrieve action cost to get a consumable in hand (#428): a held item is
// ready (+0), a worn one needs an Interact to draw (+1), a stowed one a 2-action
// retrieve (+2). Anything unknown collapses to the worn default. `dropped` items
// aren't surfaced at all.
const DRAW_COST = { held1: 0, held2: 0, stowed: 2 };
export const drawCost = (state) => (state in DRAW_COST ? DRAW_COST[state] : 1);

let uid = 0;

// Self-use consumable (potion/elixir) tile (#428). Its effective cost is the
// 1-action drink/apply plus the draw/retrieve cost of getting it in hand, so
// affordability + the displayed glyph reflect a stowed Elixir really costing 3.
const makeConsumableTile = (item) => {
  uid += 1;
  const meta = consumableMeta(item);
  const draw = drawCost(item.state);
  const cost = 1 + draw;
  return {
    id: `consumable-${item.uid || item.name}-${uid}`,
    name: item.name,
    origin: 'item',
    kind: 'consumable',
    heals: meta?.kind === 'healing',
    cost,
    drawCost: draw,
    costGroup: String(Math.min(Math.max(cost, 1), 3)),
    cat: 'item',
    traits: item.traits || [],
    type: 'consumable',
    requiresTarget: false,
    needsTarget: false,
    // Healing consumables are ally-supportable (#434): administering to a focused
    // ally is reach-gated (ActionTile) + ally-ranked (suggestNow), exactly like
    // Battle Medicine. Effect consumables stay self-use (supports:false).
    supports: meta?.kind === 'healing',
    inactive: false,
    statLine: null,
    raw: item,
  };
};

// Reload tile for a chambered/capacity weapon (#675, S3). One tile per held
// capacity weapon that still has an empty chamber; tapping opens the ammo sheet
// (plain bolt vs. carried special ammo). The melee strike on the same weapon is
// untouched. Cost is the weapon's Reload value (1 for the Crescent Cross). The
// `raw` descriptor carries what the sheet needs (weapon uid + capacity + the
// ranged strike) and `kind: 'reload'` so handleUse routes it to the picker.
//
// A nock weapon (#1270, AA1 — bow/crossbow with typed ammo, single slot) gets
// the same tile as "Nock <weapon>" at the strike's Reload cost (0 for a bow —
// renders the free-action glyph). Its sheet omits the infinite default: the
// tile only exists to load a carried special.
const makeReloadTile = (item, strike) => {
  uid += 1;
  const nock = !isCapacityWeapon(strike);
  const capacity = strikeAmmoCapacity(strike);
  const cost = reloadCost(strike) ?? (nock ? 0 : 1);
  return {
    id: `reload-${item.uid || item.name}-${uid}`,
    name: `${nock ? 'Nock' : 'Reload'} ${item.name}`,
    origin: 'reload',
    kind: 'reload',
    cost,
    costGroup: String(Math.min(Math.max(cost, 1), 3)),
    cat: 'attack',
    traits: ['Manipulate'],
    type: 'reload',
    requiresTarget: false,
    needsTarget: false,
    supports: false,
    inactive: false,
    statLine: null,
    raw: {
      kind: 'reload',
      weaponUid: item.uid || null,
      weaponName: item.name,
      capacity,
      reloadCost: cost,
      nock,
      strike,
      requiresTarget: false,
    },
  };
};

// costOverride: 'reaction' | 'free' for the Reactions & Free group (#424); those
// tiles skip the numeric cost-group clamp and never gate on a focused foe.
const makeTile = (item, cat, originType, costOverride) => {
  uid += 1;
  const isRf = costOverride === 'reaction' || costOverride === 'free';
  const cost = isRf ? costOverride : baseCost(item);
  return {
    id: `${originType}-${item.name}-${uid}`,
    name: item.name,
    origin: originType, // 'strike' | 'custom' | 'basic' | 'reaction' | 'free' — lets suggestNow score strikes (#413)
    cost,
    costGroup: isRf ? 'rf' : String(Math.min(Math.max(cost, 1), 3)),
    cat,
    traits: item.traits || [],
    type: 'action',
    requiresTarget: item.requiresTarget,
    needsTarget: isRf ? false : tileNeedsTarget(item, cat),
    supports: isSupportAction(item), // ally-support ranking when an ally is focused (#429)
    variableActionCount: item.variableActionCount,
    inactive: item.active === false,
    statLine: statLineFor(item, cat),
    raw: item,
  };
};

/**
 * Build the flat tile catalog for the action grid.
 * @param {Object}  input
 * @param {Array}   input.actions      - character/feat/item actions (useCharacter().actions)
 * @param {Array}   input.strikes      - resolved strikes (useCharacter().strikes)
 * @param {Array}   input.reactions    - reactions (useCharacter().reactions)
 * @param {Array}   input.freeActions  - free actions (useCharacter().freeActions)
 * @param {Array}   input.inventory    - effective inventory (useCharacter().inventory)
 * @param {Object}  input.chambers     - cnmh_chambers_<id> overlay map (#675), keyed by weapon uid
 * @returns {Array} tile objects
 */
export function buildActionCatalog({ actions = [], strikes = [], reactions = [], freeActions = [], inventory = [], chambers = {} } = {}) {
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

  // Consumables as self-use tiles (#428) — potions/elixirs from the carried
  // inventory, costed by their draw/retrieve state. Dropped items aren't usable.
  inventory.forEach((item) => {
    if (item && consumableMeta(item) && item.state !== 'dropped') {
      tiles.push(makeConsumableTile(item));
    }
  });

  // Reload tiles (#675) — for each held capacity weapon with an empty chamber,
  // a 1-action Reload that opens the ammo sheet. Gated on held (itemAbilitiesActive)
  // so it disappears when the weapon is sheathed, and hidden when fully loaded.
  //
  // Nock weapons (#1270, AA1) additionally require an eligible special in the
  // carried inventory (containers flattened, so a quivered arrow counts): plain
  // arrows never need loading, so with no specials there is nothing to nock.
  const flatInventory = flattenInventory(inventory);
  inventory.forEach((item) => {
    if (!item || !item.strikes || !itemAbilitiesActive(item)) return;
    const strikeList = Array.isArray(item.strikes) ? item.strikes : [item.strikes];
    const ammoStrike = strikeList.find((s) => strikeAmmoCapacity(s) != null);
    if (!ammoStrike) return;
    const capacity = strikeAmmoCapacity(ammoStrike);
    const state = normalizeChamberState((chambers || {})[item.uid], capacity);
    if (nextEmptyChamber(state) < 0) return; // fully loaded
    if (!isCapacityWeapon(ammoStrike)
      && !flatInventory.some((it) => isAmmoEligible(it, ammoStrike) && (it.quantity ?? 1) > 0)) {
      return; // nock weapon with no carried special ammo
    }
    tiles.push(makeReloadTile(item, ammoStrike));
  });

  // Reactions & Free (#424) — one cost group ('rf'), filterable by their own
  // category when one applies. Free includes the character/feat/item free actions
  // plus the basic encounter free actions (Delay, Release, …).
  reactions.forEach((r) => tiles.push(makeTile(r, catForCustomAction(r), 'reaction', 'reaction')));
  [...freeActions, ...BASIC_ENCOUNTER_FREE_ACTIONS].forEach((f) =>
    tiles.push(makeTile(f, catForCustomAction(f), 'free', 'free'))
  );

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
