// src/components/encounter/stage/EncounterStage.jsx
// Off-turn encounter stage (#471, epic #479). Shown in the encounter tab when an
// encounter is in-progress and it is NOT this device's turn — the on-turn Command
// Sheet is replaced by a view that spotlights whoever IS acting.
//
// This slice is the shell + routing + a working grid peek. The banner shows the
// acting combatant (real), while the action feed and armed-reaction footer are
// deliberate placeholder regions filled by later slices:
//   · live action feed + economy pips   → #472 (bridge relay)
//   · actor / reactor token art         → #473
//   · armed, player-initiated reactions → #474 / #475
//   · reactor presence avatars          → #476
import React from 'react';
import { useEncounter } from '../../../hooks/useEncounter';
import { activeEntry } from '../../../utils/encounterUtils';
import GridPeek from './GridPeek';
import './EncounterStage.css';

const monogramOf = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';

const EncounterStage = ({ character, characterColor }) => {
  const { encounter } = useEncounter();
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

  return (
    <div
      className="stage"
      style={characterColor ? { '--color-theme': characterColor } : undefined}
      role="region"
      aria-label="Off-turn encounter stage"
    >
      {/* Hero banner — who is acting. Token art arrives in #473; monogram for now. */}
      <div className="stage-banner">
        <div className="stage-banner-mono" aria-hidden="true">
          {monogramOf(actor.name)}
        </div>
        <div className="stage-banner-id">
          <div className="stage-banner-live">
            <span className="stage-banner-live-dot" aria-hidden="true" />
            Acting
          </div>
          <div className="stage-banner-name">{actor.name}</div>
          <div className="stage-banner-sub">{actorSub}</div>
        </div>
      </div>

      {/* Live action feed — populated by the bridge relay in #472. */}
      <div className="stage-feed" aria-label="Action feed">
        <div className="stage-feed-head">
          <span className="stage-feed-head-dot" aria-hidden="true" />
          Live · this turn
        </div>
        <p className="stage-feed-empty">Waiting for {actor.name}&rsquo;s next action&hellip;</p>
      </div>

      {/* Armed reactions — your reactions become live here in #474 / #475. */}
      <div className="stage-reactbar" aria-label="Your reactions">
        <div className="stage-reactbar-head">Your reactions &middot; your call</div>
        <p className="stage-reactbar-empty">
          Reactions light up here when their trigger fires.
        </p>
      </div>

      <GridPeek character={character} themeColor={characterColor} />
    </div>
  );
};

export default EncounterStage;
