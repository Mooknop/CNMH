// useReactionOptions — the single source for "my reactions, and whether each is
// usable right now." Powers the off-turn armed-reaction bar (#474); the GM-fired
// ReactionPrompt (#221) shares the same source list via buildReactionSources but
// keeps its own event-match gating.
//
// Each option: { reaction, castSource, live, liveReason }
//   live=false renders a blocked button with liveReason; live=true is armed.
import { useMemo } from 'react';
import { useCharacter } from './useCharacter';
import { useTurnState } from './useTurnState';
import { useShield } from './useShield';
import { useCastingResources } from './useCastingResources';
import { useContent } from '../contexts/ContentContext';
import { buildReactionSources, castSourceOf } from '../utils/reactionSources';

export const useReactionOptions = (character) => {
  const charId = character?.id;
  const {
    reactions,
    staffSpells,
    focusSpells,
    inventory,
    spellcasting,
    innateSpells,
    wandSpells,
    scrollSpells,
  } = useCharacter(character) || {};
  const { spells: catalogSpells } = useContent();
  const { turnState } = useTurnState(charId);
  const { raised, broken } = useShield(charId, inventory);
  const casting = useCastingResources(character);

  const repertoireSpells = spellcasting?.spells;

  const sources = useMemo(
    () =>
      buildReactionSources({
        reactions,
        staffSpells,
        focusSpells,
        catalogSpells,
        repertoireSpells,
        innateSpells,
        wandSpells,
        scrollSpells,
      }),
    [reactions, staffSpells, focusSpells, catalogSpells, repertoireSpells, innateSpells, wandSpells, scrollSpells]
  );

  const options = useMemo(() => {
    const spent = !!turnState?.reactionSpent;
    const ready = !!turnState?.hasStartedFirstTurn && !!turnState?.reactionAvailable;

    return sources.map((reaction) => {
      const castSource = castSourceOf(reaction);
      let live = true;
      let liveReason = null;

      if (spent) {
        live = false;
        liveReason = 'reaction spent';
      } else if (!ready) {
        live = false;
        liveReason = 'unavailable until your first turn';
      } else if (reaction.name === 'Shield Block') {
        if (!(raised && !broken)) {
          live = false;
          liveReason = 'raise a shield first';
        }
      } else if (reaction.active === false) {
        // Item-sourced reaction whose item is stowed (e.g. a sheathed staff,
        // wand, or scroll).
        live = false;
        liveReason = 'not in hand';
      } else if (reaction.isSpell) {
        // Reaction-cost spell from any cast list (staff/focus/repertoire/innate/
        // wand/scroll) — gate on the actual pool via the canonical casting-
        // resource logic (no duplicated cost math). An empty option set means an
        // untracked pool (e.g. a repertoire rank with no slot tracking), which
        // casts freely just like the on-turn path — don't block it.
        const opts = casting.optionsFor(reaction, castSource) || [];
        if (opts.length && !opts.some((o) => o.enabled)) {
          live = false;
          liveReason = (opts.find((o) => o.reason) || {}).reason || 'no resource available';
        }
      }

      return { reaction, castSource, live, liveReason };
    });
  }, [sources, turnState, raised, broken, casting]);

  return { options };
};

export default useReactionOptions;
