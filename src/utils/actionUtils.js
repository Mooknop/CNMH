// src/utils/actionUtils.js
// Utilities for extracting actions, reactions, and free actions from character data.

import { convertWordToNumber, parseActionCount } from './actionIconUtils';
import { itemAbilitiesActive, isHeldState, DEFAULT_ITEM_STATE } from './itemState';

// Etched property runes (#727) can carry active abilities of their own — e.g.
// the Swallow-Spike rune's Grow Spikes reaction (#735). getActions/getReactions
// only see top-level item abilities, so surface a host item's resolved
// runes.property abilities here, sourced as "Item (Rune)" and active while the
// host is equipped (worn armor / held weapon), not stowed or dropped.
const isEquipped = (item) =>
  item?.state == null || item.state === DEFAULT_ITEM_STATE || isHeldState(item.state);

const runeAbilities = (item, key) => {
  const runes = item && item.runes && item.runes.property;
  if (!Array.isArray(runes)) return [];
  const equipped = isEquipped(item);
  return runes
    .filter((r) => r && typeof r === 'object' && Array.isArray(r[key]) && r[key].length)
    .flatMap((r) =>
      r[key].map((a) => ({ ...a, source: `${item.name} (${r.name})`, active: equipped }))
    );
};

// A single-slot accessory rune (#1055 S4) — resolved to a doc on
// `runes.accessory` — can carry its own actions/reactions/freeActions, e.g.
// Dragon's Breath's Widen Spellshape free action. Its `chain` is authored on the
// rune, but the depicted dragon's damage type is an etch-time choice stored on
// the gear entry (`runes.accessoryConfig.dragonType`); inject it so the chain's
// spell filter can match qualifying spells by damage type.
const accessoryRuneAbilities = (item, key) => {
  const rune = item && item.runes && typeof item.runes.accessory === 'object' ? item.runes.accessory : null;
  if (!rune || !Array.isArray(rune[key]) || !rune[key].length) return [];
  const equipped = isEquipped(item);
  const dragonType = item.runes.accessoryConfig?.dragonType || null;
  return rune[key].map((a) => {
    const withChain = a.chain && dragonType ? { ...a, chain: { ...a.chain, dragonType } } : a;
    return { ...withChain, source: `${item.name} (${rune.name})`, active: equipped };
  });
};

const hasTrait = (action, name) =>
  (action?.traits || []).some((t) => String(t).toLowerCase() === name);

/**
 * Spellshape item actions (scepters, #1001 S0) tweak the next spell you Cast.
 * Give any Spellshape-trait action a `chain: { into: 'spell' }` so it flows
 * through the existing chained-cast UI (UseAbilityModal → ChainedSpellSection):
 * the player picks a spell, resolves it inline, and the slot is spent once.
 * An authored `chain` always wins, so a specific spell filter or transform can
 * be added per item later (Slices 1+). The effect renders as the modifier note
 * (no mechanical transform yet).
 */
export const deriveSpellshapeChain = (action) => {
  if (!action || action.chain || !hasTrait(action, 'spellshape')) return action;
  return { ...action, chain: { into: 'spell', modifier: action.description || null } };
};

/**
 * Normalise a single action object, resolving variable action counts and
 * mapping action text (e.g. "One to Three Actions") to a numeric actionCount.
 */
const processActionText = (action) => {
  if (action.actions && typeof action.actions === 'string') {
    const text = action.actions.toLowerCase();

    if (text.includes('to')) {
      const rangeMatch = text.match(/(\w+)\s+to\s+(\w+)/i);
      if (rangeMatch) {
        const min = convertWordToNumber(rangeMatch[1]);
        const max = convertWordToNumber(rangeMatch[2]);
        if (min > 0 && max > 0) {
          return { ...action, actionCount: min, variableActionCount: { min, max } };
        }
      }
    }

    const count = parseActionCount(action.actions);
    if (count > 0) {
      return { ...action, actionCount: count };
    }
  }

  return action;
};

/**
 * Get all actions for the character, combining character-defined actions,
 * inventory item actions, and feat actions.
 * @param {Object} character - Character data
 * @returns {Array} - Array of action objects
 */
export const getActions = (character) => {
  let allActions = [];

  if (character.actions && character.actions.length > 0) {
    allActions = character.actions.map(processActionText);
  }

  if (character.inventory) {
    const inventoryActions = character.inventory
      .filter(item => item.actions && item.actions.length > 0)
      .flatMap(item =>
        item.actions.map(action => ({
          ...deriveSpellshapeChain(processActionText(action)),
          source: item.name,
          active: itemAbilitiesActive(item),
        }))
      );
    const runeActions = character.inventory.flatMap((item) =>
      runeAbilities(item, 'actions').map(processActionText)
    );
    allActions = [...allActions, ...inventoryActions, ...runeActions];
  }

  if (character.feats) {
    const featActions = character.feats
      .filter(feat => feat.actions && feat.actions.length > 0)
      .flatMap(feat =>
        feat.actions.map(action => ({ ...processActionText(action), source: feat.name }))
      );
    allActions = [...allActions, ...featActions];
  }

  if (allActions.length === 0) {
    allActions = [
      { name: 'Stride', actionCount: 1, traits: ['Move'], description: 'You move up to your Speed.' },
      { name: 'Step', actionCount: 1, traits: ['Move'], description: "You carefully move 5 feet. This movement doesn't trigger reactions that are normally triggered by movement." },
      { name: 'Strike', actionCount: 1, traits: ['Attack'], description: 'You attack with a weapon or unarmed attack.' },
    ];
  }

  return allActions;
};

/**
 * Get all reactions for the character, combining character-defined reactions,
 * inventory item reactions, and feat reactions.
 * @param {Object} character - Character data
 * @returns {Array} - Array of reaction objects
 */
export const getReactions = (character) => {
  let allReactions = character.reactions?.length > 0 ? [...character.reactions] : [];

  if (character.inventory) {
    const inventoryReactions = character.inventory
      .filter(item => item.reactions && item.reactions.length > 0)
      .flatMap(item =>
        item.reactions.map(r => ({
          ...r,
          source: item.name,
          active: itemAbilitiesActive(item),
        }))
      );
    const runeReactions = character.inventory.flatMap((item) =>
      runeAbilities(item, 'reactions')
    );
    allReactions = [...allReactions, ...inventoryReactions, ...runeReactions];
  }

  if (character.feats) {
    const featReactions = character.feats
      .filter(feat => feat.reactions && feat.reactions.length > 0)
      .flatMap(feat => feat.reactions.map(r => ({ ...r, source: feat.name })));
    allReactions = [...allReactions, ...featReactions];
  }

  return allReactions;
};

/**
 * Get all free actions for the character, combining character-defined free actions,
 * inventory item free actions, and feat free actions.
 * @param {Object} character - Character data
 * @returns {Array} - Array of free action objects
 */
export const getFreeActions = (character) => {
  let allFreeActions = character.freeActions?.length > 0 ? [...character.freeActions] : [];

  if (character.inventory) {
    const inventoryFreeActions = character.inventory
      .filter(item => item.freeActions && item.freeActions.length > 0)
      .flatMap(item =>
        item.freeActions.map(fa => ({
          ...fa,
          source: item.name,
          active: itemAbilitiesActive(item),
        }))
      );
    // Accessory-rune free actions (#1055 S4): Dragon's Breath's Widen Spellshape,
    // which chains into a Cast a Spell. Sourced from the inscribed rune doc.
    const runeFreeActions = character.inventory.flatMap((item) =>
      accessoryRuneAbilities(item, 'freeActions')
    );
    allFreeActions = [...allFreeActions, ...inventoryFreeActions, ...runeFreeActions];
  }

  if (character.feats) {
    const featFreeActions = character.feats
      .filter(feat => feat.freeActions && feat.freeActions.length > 0)
      .flatMap(feat => feat.freeActions.map(fa => ({ ...fa, source: feat.name })));
    allFreeActions = [...allFreeActions, ...featFreeActions];
  }

  return allFreeActions;
};
