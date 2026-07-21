import React from 'react';
import RequestedSaves from '../encounter/RequestedSaves';
import ArmedPayloads from '../encounter/ArmedPayloads';
import GmSaveRequest from './GmSaveRequest';
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
const DockGmConsole = ({ pcEntries }) => (
  <aside className="dock-console" aria-label="GM console">
    <div className="dock-console-head">GM console</div>
    <RequestedSaves />
    <ArmedPayloads />
    <GmSaveRequest pcEntries={pcEntries} />
  </aside>
);

export default DockGmConsole;
