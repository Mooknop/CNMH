import React from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useCharacter } from '../../hooks/useCharacter';
import { activeEntry } from '../../utils/encounterUtils';
import { getCharacterColor } from '../../utils/CharacterUtils';
import EncounterSkeleton from '../../components/encounter/EncounterSkeleton';
import GmIcon from './GmIcon';
import './GmCommandDock.css';

// GM Command Dock (#1525 S2) — the dock follows the encounter turn pointer and
// mounts the ACTUAL player encounter controls (EncounterSkeleton) for the PC
// whose turn it is, so the GM can act on that player's behalf. All writes ride
// the same per-character sync keys the player's own client uses.
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
const DockActingPane = ({ character, accent }) => {
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
      </div>
      <EncounterSkeleton character={character} model={model} characterColor={accent} />
    </section>
  );
};

const GmCommandDock = () => {
  const { mode } = usePlayMode();
  const { encounter } = useEncounter();
  const { characters, theme } = useContent();

  const renderEncounterPane = () => {
    if (encounter?.phase === 'setup') {
      return (
        <DockStub
          icon="scroll"
          title="Rolling initiative"
          sub="The dock takes over when round 1 begins."
        />
      );
    }
    const entry = activeEntry(encounter);
    if (!entry) {
      return (
        <DockStub
          icon="sword"
          title="No combatants"
          sub="The initiative order is empty."
        />
      );
    }
    const character =
      entry.kind === 'pc' && entry.charId
        ? (characters || []).find((c) => c.id === entry.charId)
        : null;
    if (!character) {
      return (
        <DockStub
          icon="sword"
          title={`${entry.name || 'Enemy'}'s turn`}
          sub="Enemy turns join the dock in a later slice — run them in Foundry for now."
        />
      );
    }
    const index = characters.findIndex((c) => c.id === character.id);
    const accent = theme?.accentOverrides?.[character.id] || getCharacterColor(index);
    return <DockActingPane key={character.id} character={character} accent={accent} />;
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
  );
};

export default GmCommandDock;
