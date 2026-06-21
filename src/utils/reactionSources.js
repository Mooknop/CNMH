// Shared reaction-source assembly. The combined "what reactions does this
// character have?" list was duplicated inline in ReactionPrompt; pulling it
// here keeps the GM-fired prompt (#221) and the off-turn armed bar (#474) from
// drifting. Pure + UI-free so both the component and the useReactionOptions
// hook build the exact same list.
//
// Scope: character reactions + reaction-cost spells from every cast list —
// STAFF, FOCUS, repertoire (slot), INNATE, WAND, and SCROLL (#482). Each spell
// source is tagged `isSpell` so the gating layer routes it through
// useCastingResources; eld powers are frequency-gated rather than pool-gated and
// are handled separately (#482 S2).
import { isReactionCost } from './reactionTriggers';
import { spellCatalogMap, resolveFocusSpells } from './contentUtils';

/**
 * @param {Object} args
 * @param {Array}  args.reactions        - getReactions(character) output
 * @param {Array}  args.staffSpells      - useCharacter().staffSpells (carry fromStaff + active)
 * @param {Array}  args.focusSpells      - useCharacter().focusSpells (spellRef shape)
 * @param {Array}  args.catalogSpells    - useContent().spells (for focus ref resolution)
 * @param {Array}  args.repertoireSpells - spellcasting.spells (prepared/spontaneous; slot-cast)
 * @param {Array}  args.innateSpells     - useCharacter().innateSpells (carry innate: true)
 * @param {Array}  args.wandSpells       - useCharacter().wandSpells (carry fromWand + active)
 * @param {Array}  args.scrollSpells     - useCharacter().scrollSpells (carry fromScroll + active)
 * @returns {Array} combined reaction objects (source flags + active + isSpell preserved)
 */
export const buildReactionSources = ({
  reactions = [],
  staffSpells = [],
  focusSpells = [],
  catalogSpells = [],
  repertoireSpells = [],
  innateSpells = [],
  wandSpells = [],
  scrollSpells = [],
} = {}) => {
  const spellsFrom = (list) =>
    (Array.isArray(list) ? list : []).filter(isReactionCost).map((s) => ({ ...s, isSpell: true }));

  const staffReactions = spellsFrom(staffSpells);
  // resolveFocusSpells passes a non-array input straight through (its contract),
  // so coerce before filtering — a sheet whose focus field is a points pool
  // object rather than a spell list must not crash the encounter view.
  const resolvedFocus = resolveFocusSpells(focusSpells || [], spellCatalogMap(catalogSpells));
  const focusReactions = (Array.isArray(resolvedFocus) ? resolvedFocus : [])
    .filter(isReactionCost)
    .map((s) => ({ ...s, fromFocus: true, active: true, isSpell: true }));
  // Repertoire/prepared spells carry no source flag, so castSourceOf falls
  // through to a slot cast; the explicit isSpell tag is what distinguishes them
  // from a plain feat/item reaction (which is never pool-gated).
  const repertoireReactions = spellsFrom(repertoireSpells);
  const innateReactions = spellsFrom(innateSpells);
  const wandReactions = spellsFrom(wandSpells);
  const scrollReactions = spellsFrom(scrollSpells);

  return [
    ...(reactions || []),
    ...staffReactions,
    ...focusReactions,
    ...repertoireReactions,
    ...innateReactions,
    ...wandReactions,
    ...scrollReactions,
  ];
};

// Which casting pool a reaction is paid from — drives UseAbilityModal's
// castSource and useCastingResources gating. undefined ⇒ either a repertoire
// slot cast (when isSpell) or a plain reaction (feat/ability/item), which the
// gating layer tells apart via the isSpell flag.
export const castSourceOf = (reaction) =>
  reaction?.fromStaff ? 'staff'
    : reaction?.fromFocus ? 'focus'
    : reaction?.fromWand ? 'wand'
    : reaction?.fromScroll ? 'scroll'
    : (reaction?.innate || reaction?.fromInnate) ? 'innate'
    : undefined;
