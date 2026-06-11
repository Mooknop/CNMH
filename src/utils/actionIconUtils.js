// src/utils/actionIconUtils.js
// Utilities for parsing action text and producing action icon descriptors.

/**
 * Convert word numbers to integers (e.g. "one" → 1, "two" → 2)
 * @param {string} word - Word representation of a number
 * @returns {number} - Numeric value, or 0 if unrecognized
 */
export const convertWordToNumber = (word) => {
  const wordMap = {
    'one': 1,
    'two': 2,
    'three': 3,
    '1': 1,
    '2': 2,
    '3': 3
  };

  return wordMap[word.toLowerCase()] || 0;
};

/**
 * Parse action text to determine action count
 * @param {string} actionText - Text describing actions (e.g., "One Action", "Two Actions")
 * @returns {number} - Number of actions (0 if not determinable)
 */
export const parseActionCount = (actionText) => {
  if (!actionText) return 0;

  const text = actionText.toLowerCase();

  if (text.includes('one action')) return 1;
  if (text.includes('two actions')) return 2;
  if (text.includes('three actions')) return 3;

  const match = text.match(/(\d+)\s+action/i);
  if (match) return parseInt(match[1]);

  if (text.includes('one to three actions')) return 3;
  if (text.includes('one to two actions')) return 2;

  if (text.includes('reaction')) return -1;
  if (text.includes('free action')) return -2;

  return 0;
};

/**
 * Get the action type based on action count
 * @param {number} actionCount - Action count from parseActionCount
 * @returns {string} - Action type (standard, reaction, free)
 */
export const getActionType = (actionCount) => {
  if (actionCount > 0) return 'standard';
  if (actionCount === -1) return 'reaction';
  if (actionCount === -2) return 'free';
  return 'unknown';
};

/**
 * Extract variable action count from action text if present
 * @param {string} actionText - Text describing actions
 * @returns {Object|null} - Object with min and max action counts, or null if not variable
 */
export const extractVariableActionCount = (actionText) => {
  if (!actionText) return null;

  const text = actionText.toLowerCase();

  const rangeMatch = text.match(/(\w+)\s+to\s+(\w+)\s+action/i);
  if (rangeMatch) {
    const min = convertWordToNumber(rangeMatch[1]);
    const max = convertWordToNumber(rangeMatch[2]);

    if (min > 0 && max > 0 && min <= max) {
      return { min, max };
    }
  }

  return null;
};

/**
 * Resolve an ability's variable action-cost range from any of the encodings
 * authored data uses: a `variableActionCount` object (strikes, GM-authored),
 * an `actions` string ("One to Three Actions"), or an `actionCount` string
 * ("One to Two" — feat strikes before normalization).
 * @param {Object} ability - Action / spell / strike object
 * @returns {Object|null} - { min, max } or null when the cost is fixed
 */
export const getVariableActionRange = (ability) => {
  if (!ability || typeof ability !== 'object') return null;

  const vac = ability.variableActionCount;
  if (vac && typeof vac === 'object' && vac.min >= 1 && vac.min <= vac.max) {
    return { min: vac.min, max: vac.max };
  }

  const fromActions = extractVariableActionCount(ability.actions);
  if (fromActions) return fromActions;

  if (typeof ability.actionCount === 'string') {
    const m = ability.actionCount.toLowerCase().match(/(\w+)\s+to\s+(\w+)/);
    if (m) {
      const min = convertWordToNumber(m[1]);
      const max = convertWordToNumber(m[2]);
      if (min > 0 && max > 0 && min <= max) return { min, max };
    }
  }

  return null;
};

/**
 * Find the declared variant for a chosen action count (#215).
 * Variants describe the scaling consequence per action count, e.g.
 * `[{ actions: 2, note: '+Con to damage', dcDelta: -10 }]`.
 * @param {Object} ability - Action / spell / strike object
 * @param {number} count - Chosen action count
 * @returns {Object|null} - The matching variant entry, or null
 */
export const variantFor = (ability, count) => {
  const variants = ability?.variants;
  if (!Array.isArray(variants)) return null;
  return variants.find((v) => v && v.actions === count) || null;
};

/**
 * Render action indicators as a descriptor object
 * @param {string} actionText - Text describing actions
 * @returns {Object|null} - Descriptor object for rendering action indicators
 */
export const renderActionIcons = (actionText) => {
  if (!actionText) return null;

  const text = actionText.toLowerCase();

  const variableCount = extractVariableActionCount(text);
  if (variableCount) {
    return {
      type: 'variable',
      min: variableCount.min,
      max: variableCount.max,
      count: variableCount.min
    };
  }

  if (text.includes('reaction')) {
    return { type: 'reaction', icon: '⟳', count: 1 };
  }

  if (text.includes('free action')) {
    return { type: 'free', icon: '⟡', count: 1 };
  }

  const actionCount = parseActionCount(text);
  if (actionCount > 0) {
    return { type: 'standard', icon: '●', count: actionCount };
  }

  return { type: 'text', text: actionText, count: 0 };
};
