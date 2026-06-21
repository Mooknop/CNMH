// src/components/encounter/stage/EncounterStage.jsx
// Off-turn encounter stage (#471, epic #479). Shown in the encounter tab above
// the turn dial when an encounter is in-progress and it is NOT this device's
// turn — a spotlight on whoever IS acting.
//
// The stage REPLACES the action-budget dial off-turn (#481). It carries a hero
// banner spotlighting the acting combatant, a live-feed scaffold, and the armed
// reaction bar (#474). Remaining slices fill the rest:
//   · live action feed + economy pips   → #472a (this), populated by #472b
//   · actor / reactor token art         → #473
//   · typed-d20 / opposed reaction polish → #475
//   · reactor presence avatars          → #476
import React, { useCallback, useMemo } from 'react';
import { useEncounter } from '../../../hooks/useEncounter';
import { useReactors } from '../../../hooks/useReactors';
import { useActorFeed } from '../../../hooks/useActorFeed';
import { useReactionOptions } from '../../../hooks/useReactionOptions';
import { useReactionResolver } from '../../../hooks/useReactionResolver';
import { useContent } from '../../../contexts/ContentContext';
import { activeEntry } from '../../../utils/encounterUtils';
import { feedTriggerEvent, matchingReactions } from '../../../utils/reactionTriggers';
import { entryPortrait } from '../../../utils/stagePortrait';
import StagePortrait from './StagePortrait';
import ReactorAvatars from './ReactorAvatars';
import ActorFeed from './ActorFeed';
import ArmedReactionBar from './ArmedReactionBar';
import UseAbilityModal from '../UseAbilityModal';
import './EncounterStage.css';

const EncounterStage = ({ character, characterColor }) => {
  const { encounter } = useEncounter();
  const { reactors } = useReactors();
  const { characters } = useContent();
  const { options } = useReactionOptions(character);
  const { using, open, close } = useReactionResolver(character);
  const actor = activeEntry(encounter);
  const { actions, spent, reaction, feed } = useActorFeed(actor?.entryId);

  // Resolve a damage/attack target's Foundry actor id to a PC charId via the
  // live order (bridge entries carry foundryActorId + charId), so damage cues
  // can tell "you" from "an ally".
  const order = encounter?.order;
  const targetCharIdOf = useCallback(
    (foundryActorId) =>
      (order || []).find((e) => e.kind === 'pc' && e.foundryActorId === foundryActorId)?.charId ?? null,
    [order]
  );

  // The viewer's armed (live) reactions, and which feed entries they wake for.
  const liveOptions = useMemo(() => options.filter((o) => o.live), [options]);
  const cues = useMemo(() => {
    if (!actor) return {};
    const liveReactions = liveOptions.map((o) => o.reaction);
    const map = {};
    for (const entry of feed) {
      const event = feedTriggerEvent(entry, {
        actorKind: actor.kind,
        viewerCharId: character?.id,
        targetCharIdOf,
      });
      if (!event) continue;
      const matched = matchingReactions(liveReactions, event);
      if (matched.length) {
        map[entry.n] = matched
          .map((r) => liveOptions.find((o) => o.reaction === r))
          .filter(Boolean);
      }
    }
    return map;
  }, [feed, actor, liveOptions, character?.id, targetCharIdOf]);

  // Defensive: routing only mounts this for an in-progress, not-my-turn
  // encounter, which always has an acting entry. Render nothing if not.
  if (!actor) return null;

  const actorSub =
    actor.kind === 'pc'
      ? 'Ally'
      : actor.bestiary?.level != null
      ? `Level ${actor.bestiary.level}`
      : 'Foe';

  const art = entryPortrait(actor, characters);

  return (
    <div
      className="stage"
      style={characterColor ? { '--color-theme': characterColor } : undefined}
      role="region"
      aria-label="Off-turn encounter stage"
    >
      {/* Hero banner — who is acting, with token art (monogram fallback). */}
      <div className="stage-banner">
        <StagePortrait
          className="stage-banner-portrait"
          src={art.src}
          name={actor.name}
          imagePosition={art.imagePosition}
        />
        <div className="stage-banner-id">
          <div className="stage-banner-live">
            <span className="stage-banner-live-dot" aria-hidden="true" />
            Acting
          </div>
          <div className="stage-banner-name">{actor.name}</div>
          <div className="stage-banner-sub">{actorSub}</div>
          <div
            className="stage-pips"
            role="img"
            aria-label={`${spent} of ${actions} actions spent, reaction ${reaction ? 'available' : 'spent'}`}
          >
            {Array.from({ length: actions }).map((_, i) => (
              <span key={i} className={`stage-pip${i < spent ? ' stage-pip--spent' : ''}`} aria-hidden="true" />
            ))}
            <span className={`stage-pip stage-pip--react${reaction ? '' : ' stage-pip--spent'}`} aria-hidden="true" />
          </div>
        </div>
        <ReactorAvatars reactors={reactors} characters={characters} selfId={character?.id} />
      </div>

      {/* Live action feed (#472a) — populated by the bridge relay in #472b. */}
      <div className="stage-feed" aria-label="Action feed">
        <div className="stage-feed-head">
          <span className="stage-feed-head-dot" aria-hidden="true" />
          Live · this turn
        </div>
        {feed.length > 0 ? (
          <ActorFeed
            feed={feed}
            cues={cues}
            onReact={({ reaction: react, castSource }) => open(react, castSource)}
          />
        ) : (
          <p className="stage-feed-empty">Waiting for {actor.name}&rsquo;s next action&hellip;</p>
        )}
      </div>

      {/* Armed reactions — your reactions, your call (#474). */}
      <ArmedReactionBar character={character} themeColor={characterColor} />

      {/* Inline cue cards resolve through the same modal as the armed footer. */}
      {using && (
        <UseAbilityModal
          isOpen
          onClose={close}
          ability={using.ability}
          cost="reaction"
          verb={using.castSource || using.ability?.isSpell ? 'Cast' : 'Use'}
          castSource={using.castSource}
          character={character}
          themeColor={characterColor}
        />
      )}
    </div>
  );
};

export default EncounterStage;
