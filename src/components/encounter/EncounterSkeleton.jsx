import React from 'react';
import ActionsList from '../actions/ActionsList';
import HandsGlance from './HandsGlance';
import InitiativeEntry from './InitiativeEntry';
import TurnTrackerPanel from './TurnTrackerPanel';
import ReadyActionButton from './ReadyActionButton';
import InitiativeStrip from './commandsheet/InitiativeStrip';
import Dossier from './commandsheet/Dossier';
import SelfStatusBar from './commandsheet/SelfStatusBar';
import EncounterStage from './stage/EncounterStage';
import SavePrompt from './SavePrompt';
import ReactionPrompt from './ReactionPrompt';
import SkillPrompt from './SkillPrompt';
import ChallengePrompts from './ChallengePrompts';
import ObjectivesStrip from './ObjectivesStrip';
import RollToast from './RollToast';
import CombatLogPanel from './CombatLogPanel';
import { useEncounter } from '../../hooks/useEncounter';
import { isCharTurn } from '../../utils/encounterUtils';
import './EncounterSkeleton.css';

// Encounter-mode skeleton (#1502 S5): prompts · self-status bar · TARGET ▸
// selector · Dossier · deck (contextual plays + segments) · tools row
// (TurnTrackerPanel + objectives) · ✋ Hands · Combat Log.
//
// Extracted from CharacterSheet so the GM Command Dock (#1525) can mount the
// same controls for an arbitrary character: everything here keys off the
// character/model props, never the route.
const EncounterSkeleton = ({ character, model, characterColor }) => {
  const { encounter } = useEncounter();

  return (
    <>
      {/* Roll toast (#1490 S3) — fixed overlay; renders nothing until a
          fresh roll fx event lands, so it mounts unconditionally here. */}
      <RollToast />
      <SavePrompt charId={character.id} characterName={character.name} saves={model.saves} character={character} />
      <ReactionPrompt character={character} themeColor={characterColor} />
      <SkillPrompt charId={character.id} characterName={character.name} skillModifiers={model.skillModifiers} />
      <ChallengePrompts charId={character.id} characterName={character.name} skillModifiers={model.skillModifiers} />
      {encounter?.active ? (
        <>
          {/* Self-status bar (#1502 S3) — the compressed turn budget
              (formerly DeckHeader Row A) leads the encounter skeleton. */}
          <SelfStatusBar charId={character.id} character={character} model={model} />
          <InitiativeEntry charId={character.id} character={character} />
          {/* Off-turn (#471): the stage spotlights whoever is acting now.
              The Shield Block bar + ReactionPrompt keep reactions
              reachable until the stage owns them (#474/#475). */}
          {encounter.phase === 'in-progress' && !isCharTurn(encounter, character.id) ? (
            <EncounterStage character={character} characterColor={characterColor} />
          ) : (
            <ReadyActionButton charId={character.id} characterName={character.name} />
          )}
          <InitiativeStrip charId={character.id} />
          {/* Focus Dossier (#1502 S1/S2) — the focused combatant's card
              leads the screen, directly under the target selector. The
              character + derived model feed the self state (2c). */}
          <Dossier charId={character.id} character={character} model={model} />
          <ActionsList character={character} characterColor={characterColor} />
          {/* Tools row (#1502 S5): shield / aura / sustain / free-action
              offers / Bestiary as chips, with the objectives chips
              alongside — below the deck, above hands + log. */}
          <TurnTrackerPanel charId={character.id} characterName={character.name} inventory={model.inventory} character={character} />
          <ObjectivesStrip />
          {/* At-a-glance hands strip (read-only) — hand CHANGES live in
              the deck's Items segment (HandsGroup). */}
          <HandsGlance character={character} />
        </>
      ) : (
        <>
          <ObjectivesStrip />
          <div className="cs-encounter-idle">
            <span className="cs-encounter-idle-title">No Active Encounter</span>
            <span className="cs-encounter-idle-sub">Initiative appears here when combat begins</span>
            <InitiativeEntry charId={character.id} character={character} />
          </div>
          <ActionsList character={character} characterColor={characterColor} />
        </>
      )}
      <CombatLogPanel />
    </>
  );
};

export default EncounterSkeleton;
