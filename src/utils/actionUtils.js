// src/utils/actionUtils.js
// Utilities for extracting actions, reactions, and free actions from character data.

import { convertWordToNumber, parseActionCount } from './actionIconUtils';
import { itemAbilitiesActive } from './itemState';

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
          ...processActionText(action),
          source: item.name,
          active: itemAbilitiesActive(item),
        }))
      );
    allActions = [...allActions, ...inventoryActions];
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
    allReactions = [...allReactions, ...inventoryReactions];
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
    allFreeActions = [...allFreeActions, ...inventoryFreeActions];
  }

  if (character.feats) {
    const featFreeActions = character.feats
      .filter(feat => feat.freeActions && feat.freeActions.length > 0)
      .flatMap(feat => feat.freeActions.map(fa => ({ ...fa, source: feat.name })));
    allFreeActions = [...allFreeActions, ...featFreeActions];
  }

  return allFreeActions;
};
