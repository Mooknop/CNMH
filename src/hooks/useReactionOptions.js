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
import { useFrequency } from './useFrequency';
import { useEncounter } from './useEncounter';
import { useSyncedState } from './useSyncedState';
import { useContent } from '../contexts/ContentContext';
import { useGameDate } from '../contexts/GameDateContext';
import { buildReactionSources, castSourceOf } from '../utils/reactionSources';
import { toGameSeconds, formatAvailableAt } from '../utils/gameTime';

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
    eldPowers,
    level,
  } = useCharacter(character) || {};
  const { spells: catalogSpells } = useContent();
  const { turnState } = useTurnState(charId);
  const { raised, broken } = useShield(charId, inventory);
  const casting = useCastingResources(character);
  const { gateFor } = useFrequency(charId);
  const { encounter } = useEncounter();
  const { gameDate, time } = useGameDate();
  // Attunement gates which eld source is usable today (read-only here).
  const [attunedSource] = useSyncedState(`cnmh_eldattune_${charId || 'unknown'}`, '');

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
        eldPowers,
        attunedSource,
        characterLevel: level,
      }),
    [reactions, staffSpells, focusSpells, catalogSpells, repertoireSpells, innateSpells, wandSpells, scrollSpells, eldPowers, attunedSource, level]
  );

  // Frequency context for cooldown gating, mirroring UseAbilityModal so the
  // armed-bar state and the modal's enforcement agree.
  const nowSecs = toGameSeconds({ ...gameDate, ...time });
  const casterEntryId =
    (encounter?.order || []).find((e) => e.kind === 'pc' && e.charId === charId)?.entryId || null;

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
      } else if (reaction.frequencyRule) {
        // Frequency-gated reaction (eld powers — once per hour). The modal
        // remains the enforcement point; this surfaces the cooldown so a spent
        // power renders blocked rather than falsely armed.
        const gate = gateFor(reaction, { nowSecs, encounter, casterEntryId });
        if (gate && !gate.available) {
          live = false;
          liveReason =
            gate.availableAtSecs != null
              ? `on cooldown — ready at ${formatAvailableAt(gate.availableAtSecs, nowSecs)}`
              : 'on cooldown';
        }
      }

      return { reaction, castSource, live, liveReason };
    });
  }, [sources, turnState, raised, broken, casting, gateFor, nowSecs, encounter, casterEntryId]);

  return { options };
};

export default useReactionOptions;
