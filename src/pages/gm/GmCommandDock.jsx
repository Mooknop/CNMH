import React, { useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useCharacter } from '../../hooks/useCharacter';
import { activeEntry } from '../../utils/encounterUtils';
import { getCharacterColor } from '../../utils/CharacterUtils';
import EncounterSkeleton from '../../components/encounter/EncounterSkeleton';
import DockReactionRail from '../../components/gm/DockReactionRail';
import GmIcon from './GmIcon';
import './GmCommandDock.css';

// GM Command Dock (#1525) — the dock follows the encounter turn pointer and
// mounts the ACTUAL player encounter controls (EncounterSkeleton) for the PC
// whose turn it is, so the GM can act on that player's behalf. All writes ride
// the same per-character sync keys the player's own client uses. A pin (S4)
// overrides turn-follow to stage any PC in the order — off-turn they get their
// off-turn view (stage + armed reactions), exactly like their own device.
//
// The pin is deliberately LOCAL state, not a synced key: it's a per-GM-client
// viewport pointer, and syncing it would need a new SANDBOX_WRITABLE_TYPES
// entry for zero cross-client value.
//
// Exploration / Downtime / enemy turns are stubs until their slices land.

const DockStub = ({ icon, title, sub }) => (
  <div className="gm-dock-stub">
    <span className="gm-dock-stub-icon" aria-hidden="true"><GmIcon name={icon} /></span>
    <span className="gm-dock-stub-title">{title}</span>
    <span className="gm-dock-stub-sub">{sub}</span>
  </div>
);

// Child component so useCharacter always receives a real character; keyed by
// charId at the call site so the whole hook tree remounts on turn handoff
// instead of carrying one PC's transient deck state into the next.
const DockActingPane = ({ character, accent, pinned }) => {
  const model = useCharacter(character);
  if (!model) return null;
  return (
    <section
      className="gm-dock-stage"
      style={accent ? { '--color-theme': accent } : undefined}
      aria-label={`Acting as ${character.name}`}
    >
      <div className="gm-dock-acting">
        <span className="gm-dock-acting-kicker">Acting as</span>
        <span className="gm-dock-acting-name">{character.name}</span>
        {pinned && <span className="gm-dock-pin-tag">pinned</span>}
      </div>
      <EncounterSkeleton character={character} model={model} characterColor={accent} />
    </section>
  );
};

const GmCommandDock = () => {
  const { mode } = usePlayMode();
  const { encounter } = useEncounter();
  const { characters, theme } = useContent();
  const [pinnedCharId, setPinnedCharId] = useState(null);

  const entry = mode === 'encounter' ? activeEntry(encounter) : null;

  const findCharacter = (charId) =>
    charId ? (characters || []).find((c) => c.id === charId) : null;

  const accentFor = (character) => {
    const index = (characters || []).findIndex((c) => c.id === character.id);
    return theme?.accentOverrides?.[character.id] || getCharacterColor(index);
  };

  // PC entries drive the pin chips; only roster-resolvable ones are stageable.
  const pcEntries = (encounter?.order || []).filter(
    (e) => e.kind === 'pc' && e.charId && findCharacter(e.charId)
  );

  // Turn-follow only stages a PC while the encounter is running — during setup
  // the stage shows a stub, so the pointer's PC must still count as an "other".
  const followCharacter =
    encounter?.phase === 'in-progress' && entry?.kind === 'pc' && entry.charId
      ? findCharacter(entry.charId)
      : null;
  const pinnedCharacter = findCharacter(pinnedCharId);
  const stagedCharacter = pinnedCharacter || followCharacter;

  // The staged PC is on the stage, not an "other" — drop their entry from the
  // rail. With nothing staged (setup/enemy stubs) every PC is an other.
  const stagedEntryId = stagedCharacter
    ? pcEntries.find((e) => e.charId === stagedCharacter.id)?.entryId || null
    : null;

  const renderEncounterPane = () => {
    if (pinnedCharacter) {
      return (
        <DockActingPane
          key={pinnedCharacter.id}
          character={pinnedCharacter}
          accent={accentFor(pinnedCharacter)}
          pinned
        />
      );
    }
    if (encounter?.phase === 'setup') {
      return (
        <DockStub
          icon="scroll"
          title="Rolling initiative"
          sub="The dock takes over when round 1 begins."
        />
      );
    }
    if (!entry) {
      return (
        <DockStub
          icon="sword"
          title="No combatants"
          sub="The initiative order is empty."
        />
      );
    }
    if (!followCharacter) {
      return (
        <DockStub
          icon="sword"
          title={`${entry.name || 'Enemy'}'s turn`}
          sub="Enemy turns join the dock in a later slice — run them in Foundry for now."
        />
      );
    }
    return (
      <DockActingPane
        key={followCharacter.id}
        character={followCharacter}
        accent={accentFor(followCharacter)}
      />
    );
  };

  return (
    <div className="gm-dock">
      <header className="gm-dock-header">
        <h1>Command Dock</h1>
        <p className="gm-dock-sub">
          {mode === 'encounter'
            ? `Round ${encounter?.round || 0} — mirroring the active player's controls`
            : 'The dock follows the party’s play mode'}
        </p>
      </header>
      {mode === 'encounter' && pcEntries.length > 0 && (
        <div className="gm-dock-pins" role="group" aria-label="Stage a character">
          <button
            type="button"
            className={`gm-dock-pin${pinnedCharId ? '' : ' gm-dock-pin--active'}`}
            aria-pressed={!pinnedCharId}
            onClick={() => setPinnedCharId(null)}
          >
            Follow turn
          </button>
          {pcEntries.map((e) => (
            <button
              key={e.entryId}
              type="button"
              className={`gm-dock-pin${pinnedCharId === e.charId ? ' gm-dock-pin--active' : ''}`}
              aria-pressed={pinnedCharId === e.charId}
              onClick={() =>
                setPinnedCharId((cur) => (cur === e.charId ? null : e.charId))
              }
            >
              {e.name}
            </button>
          ))}
        </div>
      )}
      <div className="gm-dock-body">
        <div className="gm-dock-stage-col">
          {mode === 'encounter' ? (
            renderEncounterPane()
          ) : mode === 'downtime' ? (
            <DockStub
              icon="home"
              title="Downtime"
              sub="Downtime controls arrive in a later slice."
            />
          ) : (
            <DockStub
              icon="map"
              title="Exploration"
              sub="Exploration controls arrive in a later slice."
            />
          )}
        </div>
        {mode === 'encounter' && (
          <DockReactionRail
            encounter={encounter}
            characters={characters}
            excludeEntryId={stagedEntryId}
          />
        )}
      </div>
    </div>
  );
};

export default GmCommandDock;
