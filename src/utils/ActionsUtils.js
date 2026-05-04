// src/utils/ActionsUtils.js
// Barrel re-export — implementation lives in the focused modules below.
// Existing imports throughout the codebase continue to work unchanged.
//
//   Strike logic  → strikeUtils.js
//   Action/reaction/free-action extraction → actionUtils.js
//   Action text parsing and icon descriptors → actionIconUtils.js

export { getStrikes, categorizeStrikesByType } from './strikeUtils';
export { getActions, getReactions, getFreeActions } from './actionUtils';
export {
  convertWordToNumber,
  parseActionCount,
  getActionType,
  extractVariableActionCount,
  renderActionIcons,
} from './actionIconUtils';
