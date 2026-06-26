// src/utils/auraReminders.js
// Magic-armor auras (#728 E2) — end-of-turn, GM-adjudicated save reminders.
//
// Some worn gear projects an aura that forces a save on creatures ending their
// turn near the wearer (Wisp Chain's deafen aura; the Dread rune's frightened
// floor). Enemies are GM-adjudicated in this app — there's no enemy-facing save
// prompt — so these surface as end-of-turn reminder lines (mirroring the
// persistent-damage watcher, #272): the GM rolls the enemy save and applies the
// result.
//
// An aura is declared as a structured `aura` descriptor on the item (or, for a
// rune, on the rune doc):
//   aura: {
//     save:    'fortitude' | 'reflex' | 'will',
//     dc:      number,
//     range:   'adjacent' | <feet:number>,
//     effect:  string,        // what a failure imposes
//     requires?: string,      // a precondition on the target (e.g. 'frightened')
//     sight?:  boolean,       // target must be able to see the wearer
//   }

import { isHeldState, DEFAULT_ITEM_STATE } from './itemState';

const SAVE_LABELS = { fortitude: 'Fortitude', reflex: 'Reflex', will: 'Will' };

const isEquipped = (item) =>
  item?.state == null || item.state === DEFAULT_ITEM_STATE || isHeldState(item.state);

const isAura = (a) => a && typeof a === 'object' && a.save && a.dc != null;

/**
 * Auras projected by a character's equipped gear: top-level items carrying an
 * `aura`, plus any aura on a property rune etched into an equipped item.
 *
 * @param {Object} character - a resolved character (inventory + runes inlined)
 * @returns {Array<{ aura: object, source: string }>}
 */
export const collectAuras = (character) => {
  const inv = Array.isArray(character?.inventory) ? character.inventory : [];
  const out = [];
  for (const item of inv) {
    if (!isEquipped(item)) continue;
    if (isAura(item.aura)) out.push({ aura: item.aura, source: item.name });
    const runes = item.runes && item.runes.property;
    if (Array.isArray(runes)) {
      for (const r of runes) {
        if (r && typeof r === 'object' && isAura(r.aura)) {
          out.push({ aura: r.aura, source: `${item.name} (${r.name})` });
        }
      }
    }
  }
  return out;
};

/**
 * The reminder line for one aura when a creature ends its turn near the wearer.
 *
 * @param {{ aura: object, source: string }} entry
 * @param {string} wearerName - the PC projecting the aura
 * @param {string} targetName - the creature whose turn just ended
 * @returns {string}
 */
export const formatAuraReminder = ({ aura, source }, wearerName, targetName) => {
  const save = SAVE_LABELS[aura.save] || aura.save || 'save';
  const range = aura.range === 'adjacent' ? 'adjacent' : `within ${aura.range} ft`;
  const clauses = [range];
  if (aura.requires) clauses.push(`while ${aura.requires}`);
  if (aura.sight) clauses.push('and can see you');
  return `${source} (${wearerName}): if ${targetName} ended its turn ${clauses.join(' ')}, DC ${aura.dc} ${save} or ${aura.effect}.`;
};
