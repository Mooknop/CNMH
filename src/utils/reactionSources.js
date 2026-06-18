// Shared reaction-source assembly. The combined "what reactions does this
// character have?" list was duplicated inline in ReactionPrompt; pulling it
// here keeps the GM-fired prompt (#221) and the off-turn armed bar (#474) from
// drifting. Pure + UI-free so both the component and the useReactionOptions
// hook build the exact same list.
//
// Scope: character reactions + reaction-cost STAFF and FOCUS spells. Reaction
// -cost spells from the repertoire / innate / wand / scroll lists are a separate
// gap (#482) — extend buildReactionSources there once they're wired.
import { isReactionCost } from './reactionTriggers';
import { spellCatalogMap, resolveFocusSpells } from './contentUtils';

/**
 * @param {Object} args
 * @param {Array}  args.reactions     - getReactions(character) output
 * @param {Array}  args.staffSpells   - useCharacter().staffSpells (carry fromStaff + active)
 * @param {Array}  args.focusSpells   - useCharacter().focusSpells (spellRef shape)
 * @param {Array}  args.catalogSpells - useContent().spells (for focus ref resolution)
 * @returns {Array} combined reaction objects (fromStaff/fromFocus/active preserved)
 */
export const buildReactionSources = ({
  reactions = [],
  staffSpells = [],
  focusSpells = [],
  catalogSpells = [],
} = {}) => {
  const staffReactions = (staffSpells || []).filter(isReactionCost);
  const focusReactions = resolveFocusSpells(focusSpells || [], spellCatalogMap(catalogSpells))
    .filter(isReactionCost)
    .map((s) => ({ ...s, fromFocus: true, active: true }));
  return [...(reactions || []), ...staffReactions, ...focusReactions];
};

// Which casting pool a reaction is paid from — drives UseAbilityModal's
// castSource and useCastingResources gating. undefined ⇒ a plain reaction
// (feat/ability/item), not a spell cast.
export const castSourceOf = (reaction) =>
  reaction?.fromStaff ? 'staff' : reaction?.fromFocus ? 'focus' : undefined;
