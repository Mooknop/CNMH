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
  const { reactions, staffSpells, focusSpells, inventory } = useCharacter(character) || {};
  const { spells: catalogSpells } = useContent();
  const { turnState } = useTurnState(charId);
  const { raised, broken } = useShield(charId, inventory);
  const casting = useCastingResources(character);

  const sources = useMemo(
    () => buildReactionSources({ reactions, staffSpells, focusSpells, catalogSpells }),
    [reactions, staffSpells, focusSpells, catalogSpells]
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
        // Item-sourced reaction whose item is stowed (e.g. a sheathed staff).
        live = false;
        liveReason = 'not in hand';
      } else if (castSource === 'staff' || castSource === 'focus') {
        // Reaction-cost spell — gate on the actual pool via the canonical
        // casting-resource logic (no duplicated cost math).
        const opts = casting.optionsFor(reaction, castSource) || [];
        if (!opts.some((o) => o.enabled)) {
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
