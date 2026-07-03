// Item modes (#1093) — a player-facing toggle between authored states of one
// item. Content declares the states; the player's current choice lives in the
// synced overlay `cnmh_itemmode_<charId>` ({ [itemUid]: optionId }) so it
// follows the character across devices, like chambers or the Blade Byrnie flag.
//
//   item.modes = {
//     label: 'Light',                 // optional toggle caption
//     default: 'dim',                 // option applied before any choice
//     options: [
//       { id: 'bright', label: 'Bright light', overrides: { runes: { potency: 1 } } },
//       { id: 'dim',    label: 'Dim / darkness',
//         overrides: { runes: { potency: 2, striking: 'striking' } } },
//     ],
//   }
//
// The ACTIVE option's `overrides` are shallow-spread onto the item before any
// downstream derivation (strikes, worn-gear modifiers, armor), so a mode can
// swap runes (Gloom Blade's light states), modifiers (Clandestine Cloak's
// hood), or damage riders (Monarch vs. aberrations). Overrides replace whole
// fields — a mode that grants nothing authors the empty value explicitly
// (e.g. `modifiers: []`). The default option is applied even before the player
// ever touches the toggle, so shared fields live on the item and per-state
// fields live in EVERY option's overrides, not on the base item.
//
// Pure functions only — useCharacter owns the read, ItemModal owns the write.
import { itemUidOf } from './affix';

/** The item's well-formed modes block, or null. */
export const itemModesOf = (item) => {
  const block = item?.modes;
  if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
  const options = Array.isArray(block.options)
    ? block.options.filter((o) => o && typeof o === 'object' && typeof o.id === 'string' && o.id)
    : [];
  return options.length >= 2 ? { ...block, options } : null;
};

/**
 * The mode option currently active on an item: the player's stored (and still
 * valid) choice, else the authored default, else the first option. Null when
 * the item has no usable modes block.
 *
 * @param {Object} item      - resolved inventory entry
 * @param {Object} modeState - the cnmh_itemmode overlay ({ [uid]: optionId })
 * @returns {Object|null} the active option ({ id, label?, overrides? })
 */
export const activeItemMode = (item, modeState) => {
  const modes = itemModesOf(item);
  if (!modes) return null;
  const chosen = modeState && modeState[itemUidOf(item)];
  return (
    modes.options.find((o) => o.id === chosen) ||
    modes.options.find((o) => o.id === modes.default) ||
    modes.options[0]
  );
};

/**
 * Apply each entry's active mode to an inventory tree. Entries without modes
 * pass through untouched (an empty overlay still applies authored defaults).
 * The applied entry keeps its `modes` block and gains `activeModeId` so the
 * toggle UI can render state without re-deriving it.
 *
 * @param {Array}  inventory - effective (state-stamped) inventory
 * @param {Object} modeState - the cnmh_itemmode overlay
 * @returns {Array} inventory with mode overrides applied
 */
export const applyItemModes = (inventory, modeState) => {
  if (!Array.isArray(inventory)) return inventory;
  let changed = false;
  const out = inventory.map((e) => {
    const active = activeItemMode(e, modeState);
    if (!active) return e;
    changed = true;
    return { ...e, ...(active.overrides || {}), activeModeId: active.id };
  });
  return changed ? out : inventory;
};
