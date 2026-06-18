// src/components/encounter/stage/EncounterStage.jsx
// Off-turn encounter stage (#471, epic #479). Shown in the encounter tab above
// the turn dial when an encounter is in-progress and it is NOT this device's
// turn — a spotlight on whoever IS acting.
//
// The stage REPLACES the action-budget dial off-turn (#481). It carries a hero
// banner spotlighting the acting combatant, a live-feed scaffold, and the armed
// reaction bar (#474). Remaining slices fill the rest:
//   · live action feed + economy pips   → #472 (bridge relay)
//   · actor / reactor token art         → #473
//   · typed-d20 / opposed reaction polish → #475
//   · reactor presence avatars          → #476
import React from 'react';
import { useEncounter } from '../../../hooks/useEncounter';
import { useReactors } from '../../../hooks/useReactors';
import { useContent } from '../../../contexts/ContentContext';
import { activeEntry } from '../../../utils/encounterUtils';
import { entryPortrait } from '../../../utils/stagePortrait';
import StagePortrait from './StagePortrait';
import ReactorAvatars from './ReactorAvatars';
import ArmedReactionBar from './ArmedReactionBar';
import './EncounterStage.css';

const EncounterStage = ({ character, characterColor }) => {
  const { encounter } = useEncounter();
  const { reactors } = useReactors();
  const { characters } = useContent();
  const actor = activeEntry(encounter);

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
        </div>
        <ReactorAvatars reactors={reactors} characters={characters} selfId={character?.id} />
      </div>

      {/* Live action feed — populated by the bridge relay in #472. */}
      <div className="stage-feed" aria-label="Action feed">
        <div className="stage-feed-head">
          <span className="stage-feed-head-dot" aria-hidden="true" />
          Live · this turn
        </div>
        <p className="stage-feed-empty">Waiting for {actor.name}&rsquo;s next action&hellip;</p>
      </div>

      {/* Armed reactions — your reactions, your call (#474). */}
      <ArmedReactionBar character={character} themeColor={characterColor} />
    </div>
  );
};

export default EncounterStage;
