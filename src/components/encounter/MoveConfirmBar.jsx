import React from 'react';
import './MoveConfirmBar.css';

// Shared plan/confirm bar for the destination-tap movement flow (#1736 S2
// introduced it inline in MoveActionSheet; S4 extracts it so ExplorationMove,
// MinionMove, and DockEnemyPane's foe pad can all render the identical
// route-summary + confirm/cancel affordance instead of four copies).
//
// Props:
//   feet          number   — the planned route's real (terrain-aware) cost
//   actions       number|null — action price for the move; omit/null for the
//                  actions-less variant (exploration has no action economy —
//                  the bar then reads just "35 ft")
//   disabled      boolean  — disables Confirm (e.g. not enough actions left)
//   disabledHint  string   — shown under the summary when disabled
//   clipped       boolean  — the route stopped short of the tap (a wall)
//   clippedHint   string   — note shown when clipped (defaults to the
//                  waypoint-chaining hint every surface shares)
//   confirmLabel  string   — default 'Confirm'
//   cancelLabel   string   — default 'Cancel'
//   ariaLabel     string   — default 'Confirm move'
//   onConfirm     () => void
//   onCancel      () => void
const MoveConfirmBar = ({
  feet,
  actions = null,
  disabled = false,
  disabledHint,
  clipped = false,
  clippedHint = 'Path stops at a wall — tap further to add a waypoint.',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  ariaLabel = 'Confirm move',
  onConfirm,
  onCancel,
}) => (
  <div className="mcb-bar" role="group" aria-label={ariaLabel}>
    <p className="mcb-summary" aria-label="Route summary">
      <strong>
        {feet} ft{actions != null && ` — ${actions} action${actions === 1 ? '' : 's'}`}
      </strong>
    </p>
    {clipped && (
      <p className="mcb-note" role="status">{clippedHint}</p>
    )}
    {disabled && disabledHint && (
      <p className="mcb-hint" role="status">{disabledHint}</p>
    )}
    <div className="mcb-buttons">
      <button type="button" className="btn-secondary" onClick={onCancel}>
        {cancelLabel}
      </button>
      <button type="button" className="btn-primary" onClick={onConfirm} disabled={disabled}>
        {confirmLabel}
      </button>
    </div>
  </div>
);

export default MoveConfirmBar;
