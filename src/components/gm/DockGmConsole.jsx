import React, { useState } from 'react';
import RequestedSaves from '../encounter/RequestedSaves';
import ArmedPayloads from '../encounter/ArmedPayloads';
import GmSaveRequest from './GmSaveRequest';
import AddSummonModal from './AddSummonModal';
import MinionSpawnButton from '../encounter/MinionSpawnButton';
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
const DockGmConsole = ({ pcEntries }) => {
  const [addSummonOpen, setAddSummonOpen] = useState(false);
  const { links: minionLinks } = useMinionActors();
  const { characters } = useContent();

  return (
    <aside className="dock-console" aria-label="GM console">
      <div className="dock-console-head">GM console</div>
      <RequestedSaves />
      <ArmedPayloads />
      <GmSaveRequest pcEntries={pcEntries} />
      <div className="dock-console-menagerie" data-testid="dock-menagerie">
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
      <AddSummonModal isOpen={addSummonOpen} onClose={() => setAddSummonOpen(false)} />
    </aside>
  );
};

export default DockGmConsole;
