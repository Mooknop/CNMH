import React from 'react';
import { usePathPreview } from '../../hooks/usePathPreview';
import './DockRoutePreviews.css';

// GM console card (#1744 S3/WS-4) — the dock's read-out of the UNFILTERED
// pathpreview channel (audience: 'gm'). Never mounted on any player-facing
// surface: that filtering line is drawn at the hook call site, not by a prop
// a player page could accidentally set.
//
// Mount choice: the dock has no map-surface of its own yet (adopting map mode
// dock-wide is #1744 S7, a later wave — see DockEnemyPane's Move tab, which
// still drives the abstract MoveGridPicker), so there is no snapshot to draw
// SnapshotRouteOverlay ghosts onto here. Rather than duplicate the map/capture
// plumbing a whole wave early, this reads as a compact text card in the GM
// console column — the same "self-contained, self-hides when idle" pattern
// RequestedSaves/ArmedPayloads already use there. It names every mover
// currently mid-route (including hidden/hostile ones the PLAYER channel would
// never carry) so the GM sees a drag-in-progress or an enemy's native Stride
// without alt-tabbing to Foundry, even off the acting enemy's own turn.
const PHASE_LABEL = { plan: 'planning', move: 'moving' };

const DockRoutePreviews = () => {
  const { entries } = usePathPreview({ audience: 'gm' });
  if (!entries.length) return null;

  return (
    <div className="dock-console-card dock-route-previews" data-testid="dock-route-previews">
      <div className="dock-console-head">Route previews</div>
      <ul className="dock-route-list">
        {entries.map((entry) => {
          const cellCount = entry.path?.length || 0;
          return (
            <li
              key={entry.tokenId}
              className={`dock-route-row dock-route-row--${entry.phase}`}
              data-testid="dock-route-row"
            >
              <span className="dock-route-name">{entry.name || 'Unknown mover'}</span>
              <span className="dock-route-phase">{PHASE_LABEL[entry.phase] || entry.phase}</span>
              <span className="dock-route-cells">{cellCount} cell{cellCount === 1 ? '' : 's'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default DockRoutePreviews;
