// Readied-action model (#501). The Ready activity is declared on a PC's turn
// (2 actions) with a free-text trigger, then fires OFF-turn — mechanically a
// player-initiated reaction that isn't pre-authored on the sheet. It lives in a
// per-PC synced key (cnmh_readied_<charId>) holding a single declaration, and
// surfaces on the off-turn stage as one more armed reaction (useReactionOptions)
// resolved through the existing reaction flow.
//
// These helpers are pure + UI-free so the hook, the declare surface, and the
// turn-clear sweep all agree on the shape.

/**
 * Normalize a raw declaration into the stored shape, or null when there's no
 * action to ready (an empty action name is meaningless).
 * @param {Object} args
 * @param {string} args.actionName - what action is readied
 * @param {string} [args.trigger]  - free-text trigger ("when an enemy enters reach")
 * @param {number} [args.round]    - the round it was declared, for the next-turn sweep
 * @returns {{ actionName: string, trigger: string, round: number|null, ts: number }|null}
 */
export const buildReadied = ({ actionName, trigger = '', round = null } = {}) => {
  const name = (actionName || '').trim();
  if (!name) return null;
  return { actionName: name, trigger: (trigger || '').trim(), round, ts: Date.now() };
};

/**
 * Shape a readied declaration as a reaction-like ability so the armed bar and
 * UseAbilityModal can resolve it at reaction cost (verb "Use", no castSource).
 * `readied: true` lets the bar label it distinctly; `trigger` feeds the cue text.
 * @param {Object|null} readied
 * @returns {Object|null}
 */
export const readiedAbility = (readied) => {
  if (!readied?.actionName) return null;
  return {
    name: readied.actionName,
    actions: 'Reaction',
    trigger: readied.trigger || '',
    description: readied.trigger || '',
    readied: true,
  };
};

/**
 * Combat-log line for a readied action that lapsed unused at the start of the
 * owner's next turn.
 * @param {Object} readied
 * @param {string} characterName
 * @returns {string}
 */
export const readiedExpireLog = (readied, characterName) =>
  `${characterName}'s readied action (${readied?.actionName ?? 'action'}) expired`;
