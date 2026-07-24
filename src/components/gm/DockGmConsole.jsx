import React, { useState } from 'react';
import RequestedSaves from '../encounter/RequestedSaves';
import ArmedPayloads from '../encounter/ArmedPayloads';
import GmSaveRequest from './GmSaveRequest';
import AddSummonModal from './AddSummonModal';
import MinionSpawnButton from '../encounter/MinionSpawnButton';
import GmTriggerConsole from './GmTriggerConsole';
import SkillChallengePanel from './SkillChallengePanel';
import SkillChallengeModal from './SkillChallengeModal';
import InfluenceSetupModal from './InfluenceSetupModal';
import EncounterScriptsModal from './EncounterScriptsModal';
import GmFxTestFire from './GmFxTestFire';
import SessionLogPanel from './SessionLogPanel';
import PlayModeControl from './PlayModeControl';
import BestiaryEditor from './BestiaryEditor';
import EffectsModal from '../character-sheet/EffectsModal';
import Modal from '../shared/Modal';
import { useMinionActors } from '../../hooks/useMinionActors';
import { useContent } from '../../contexts/ContentContext';
import './DockGmConsole.css';

// GM console column (#1537 S2) — the enemy-turn damage loop, on the dock.
// Mounts the existing self-contained consoles verbatim (they read/write their
// own sync keys and hide themselves when empty):
//   • RequestedSaves — resolve enemy saves vs PC DCs (type d20s / Roll in
//     Foundry) and relay the resulting damage/persistent/conditions.
//   • ArmedPayloads — fire stored triggers into save requests.
//   • GmSaveRequest — push a save prompt at PCs (the follow-through of an
//     enemy's native AoE cast from the pane).
// Always mounted in encounter mode: save requests resolve mid-PC-turn too.
// Menagerie (#1537 S6): summon the Summons-folder creatures and spawn linked
// companions/familiars without leaving the dock (dismiss lives on the order
// strip's summon rows).
// Challenges + triggers (#1537 S7): the VP/Influence tracker (self-hiding
// while nothing runs) with its three launchers, and the free-form Fire
// Trigger console (arbitrary event/target/note — the reaction rail only
// prompts armed, mappable reactions).
// Table block (#1537 S8): play-mode control, FX test fire, Apply Effect +
// Bestiary redaction launchers, and the session log — the /gm/encounter
// long tail, after which that page retires.
const DockGmConsole = ({ pcEntries, entries = [], round = 0 }) => {
  const [addSummonOpen, setAddSummonOpen] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [influenceOpen, setInfluenceOpen] = useState(false);
  const [scriptsOpen, setScriptsOpen] = useState(false);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [bestiaryOpen, setBestiaryOpen] = useState(false);
  const { links: minionLinks } = useMinionActors();
  const { characters } = useContent();

  return (
    <aside className="dock-console" aria-label="GM console">
      <div className="dock-console-head">GM console</div>
      <RequestedSaves />
      <ArmedPayloads />
      <GmSaveRequest pcEntries={pcEntries} />
      <GmTriggerConsole pcEntries={pcEntries} round={round} />
      <div className="dock-console-card dock-console-challenges" data-testid="dock-challenges">
        <div className="dock-console-head">Challenges</div>
        <SkillChallengePanel />
        <div className="dock-console-launchers">
          <button
            type="button"
            className="btn-secondary"
            aria-label="Start a skill challenge"
            onClick={() => setChallengeOpen(true)}
          >
            Skill Challenge
          </button>
          <button
            type="button"
            className="btn-secondary"
            aria-label="Start an influence encounter"
            onClick={() => setInfluenceOpen(true)}
          >
            Influence
          </button>
          <button
            type="button"
            className="btn-secondary"
            aria-label="Launch an encounter script"
            onClick={() => setScriptsOpen(true)}
          >
            Script
          </button>
        </div>
      </div>
      <div className="dock-console-card dock-console-menagerie" data-testid="dock-menagerie">
        <div className="dock-console-head">Menagerie</div>
        <button
          type="button"
          className="btn-secondary"
          aria-label="Add summon to encounter"
          onClick={() => setAddSummonOpen(true)}
        >
          Add summon
        </button>
        {Object.entries(minionLinks || {}).map(([key, link]) => {
          const owner = (characters || []).find((c) => c.id === link.ownerCharId);
          return (
            <div key={key} className="dock-console-minion-row">
              <span className="dock-console-minion-name">
                {link.name}
                {owner && <span className="dock-console-minion-owner"> · {owner.name}</span>}
              </span>
              <MinionSpawnButton ownerId={link.ownerCharId} role={link.role} />
            </div>
          );
        })}
      </div>
      <div className="dock-console-card dock-console-table" data-testid="dock-table">
        <div className="dock-console-head">Table</div>
        <PlayModeControl />
        <div className="dock-console-launchers">
          <button
            type="button"
            className="btn-secondary"
            aria-label="Apply Effect to character"
            onClick={() => setEffectsOpen(true)}
          >
            Apply Effect
          </button>
          <button
            type="button"
            className="btn-secondary"
            aria-label="Edit monster descriptions"
            onClick={() => setBestiaryOpen(true)}
          >
            Bestiary
          </button>
        </div>
        <GmFxTestFire entries={entries} />
        <SessionLogPanel />
      </div>
      <AddSummonModal isOpen={addSummonOpen} onClose={() => setAddSummonOpen(false)} />
      <SkillChallengeModal isOpen={challengeOpen} onClose={() => setChallengeOpen(false)} />
      <InfluenceSetupModal isOpen={influenceOpen} onClose={() => setInfluenceOpen(false)} />
      <EncounterScriptsModal isOpen={scriptsOpen} onClose={() => setScriptsOpen(false)} />
      <EffectsModal
        isOpen={effectsOpen}
        onClose={() => setEffectsOpen(false)}
        selfCharId="gm"
        selfName="GM"
      />
      <Modal
        isOpen={bestiaryOpen}
        onClose={() => setBestiaryOpen(false)}
        title="Bestiary — Description Overrides"
        maxWidth="820px"
      >
        <BestiaryEditor />
      </Modal>
    </aside>
  );
};

export default DockGmConsole;
