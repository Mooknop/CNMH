// Catalog of 10-minute+ activities a player can allocate during a "Take 10"
// (#561, epic #536). Each entry declares its time cost in `minutes`; the block
// length is the live party-max of everyone's total allocation, so a longer
// activity (e.g. Learn a Spell) widens the budget for the whole table.
//
// Eligibility filters mirror the exploration-activity pattern:
//   requiresFlag        — a single flag on the character model's flags object
//   requiresAnyFlag     — any one of these flags is true
//   requiresTrainedInAny— Trained (rank >= 1) in any one of these skill ids
//
// Item-derived activities (apply a 10-minute oil, affix a talisman) are NOT in
// this static catalog — they surface per-character from inventory via
// `itemTake10Activities` (#566), and resolve through the existing item-effect
// machinery (applyItemEffect / affix) in resolveTake10.

import { flattenInventory, applyConsumedOverlay } from '../utils/InventoryUtils';
import { consumableMeta } from '../utils/consumables';
import { itemKeyOf } from '../utils/itemEffects';
import {
  isTalisman,
  affixTargetType,
  validAffixHosts,
  affixedUidSet,
  itemUidOf,
} from '../utils/affix';

// Applying an oil / affixing a talisman is a 10-minute activity (the effect's
// own `durationMinutes` is separate — it runs from when the application finishes).
const ITEM_ACTIVITY_MINUTES = 10;

export const TAKE10_ACTIVITIES = [
  {
    id: 'refocus',
    name: 'Refocus',
    minutes: 10,
    requiresAnyFlag: ['hasFocusSpells'],
    note: 'Restore ALL your Focus Points.',
  },
  {
    id: 'treat-wounds',
    name: 'Treat Wounds',
    minutes: 10,
    requiresTrainedInAny: ['medicine'],
    note: 'Medicine check to heal a creature; 1-hour immunity per target.',
  },
  {
    id: 'repair',
    name: 'Repair',
    minutes: 10,
    requiresTrainedInAny: ['crafting'],
    note: 'Crafting check to restore Hit Points to a damaged item.',
  },
  {
    id: 'identify-magic',
    name: 'Identify Magic',
    minutes: 10,
    requiresTrainedInAny: ['arcana', 'nature', 'occultism', 'religion'],
    note: 'Identify a magic item, location, or ongoing effect.',
  },
  {
    id: 'learn-a-spell',
    name: 'Learn a Spell',
    minutes: 60,
    requiresFlag: 'hasSpellcasting',
    requiresTrainedInAny: ['arcana', 'nature', 'occultism', 'religion'],
    note: '1 hour per spell rank to add a spell to your repertoire/spellbook.',
  },
  {
    id: 'other',
    name: 'Other activity',
    minutes: 10,
    note: 'A 10-minute activity adjudicated by the GM.',
  },
];

/**
 * The Take 10 activities a character is eligible to allocate, filtered by the
 * same flag/skill gates the exploration picker uses.
 * @param {Object} model - character model from useCharacter (flags + skillProficiencies)
 * @returns {Array} eligible activity definitions
 */
export function availableTake10Activities(model) {
  if (!model) return [];
  const { flags = {}, skillProficiencies = {} } = model;
  const isTrained = (id) => (skillProficiencies[id] || 0) >= 1;
  return TAKE10_ACTIVITIES.filter((a) => {
    if (a.requiresFlag && !flags[a.requiresFlag]) return false;
    if (a.requiresAnyFlag && !a.requiresAnyFlag.some((f) => !!flags[f])) return false;
    if (a.requiresTrainedInAny && !a.requiresTrainedInAny.some(isTrained)) return false;
    return true;
  });
}

/**
 * Item-derived Take 10 activities for a character, surfaced from inventory (#566):
 *   - 10-minute oils: item-target effect consumables with a timed duration
 *     (`consumableMeta.target === 'item'` + `durationMinutes`), e.g. Oil of
 *     Weightlessness. Excludes transient scrubs (no duration to stamp).
 *   - unaffixed talismans: `isTalisman` items not already bound to a host.
 *
 * Each entry is "incomplete" — it carries a `targets` list and is finalized by
 * the prompt's per-entry picker (which host/item to apply to) before it lands on
 * the allocation. The entry snapshots everything the React-free resolver needs
 * (it has no inventory access GM-side): `meta` for oils, identities for both.
 *
 * @param {Object} model - character model from useCharacter (inventory)
 * @param {Object} [overlays]
 * @param {Object} [overlays.consumed] - cnmh_consumed_<charId> ({ [name]: count })
 * @param {Object} [overlays.affixed]  - cnmh_affixed_<charId> ({ [talismanUid]: hostUid })
 * @returns {Array} pickable item activities, each `{ kind, id, label, minutes, targets, ... }`
 */
export function itemTake10Activities(model, { consumed = {}, affixed = {} } = {}) {
  if (!model) return [];
  const flat = applyConsumedOverlay(flattenInventory(model.inventory), consumed);
  const affixedUids = affixedUidSet(affixed);
  const out = [];

  for (const it of flat) {
    const meta = consumableMeta(it);
    if (meta && meta.target === 'item' && meta.durationMinutes) {
      const uid = itemKeyOf(it);
      out.push({
        kind: 'oil',
        id: `oil:${uid}`,
        label: `Apply ${it.name}`,
        minutes: ITEM_ACTIVITY_MINUTES,
        itemUid: uid,
        itemName: it.name,
        meta,
        note: meta.note,
        // Any other inventory item is a candidate (GM-trust, like UseConsumableModal).
        targets: flat
          .filter((t) => itemKeyOf(t) !== uid)
          .map((t) => ({ uid: itemKeyOf(t), name: t.name })),
      });
    }
  }

  for (const it of flat) {
    if (!isTalisman(it) || affixedUids.has(itemUidOf(it))) continue;
    const uid = itemUidOf(it);
    out.push({
      kind: 'talisman',
      id: `talisman:${uid}`,
      label: `Affix ${it.name}`,
      minutes: ITEM_ACTIVITY_MINUTES,
      talismanUid: uid,
      itemName: it.name,
      affixTo: affixTargetType(it),
      targets: validAffixHosts(flat, it).map((t) => ({ uid: itemUidOf(t), name: t.name })),
    });
  }

  return out;
}

export default TAKE10_ACTIVITIES;
