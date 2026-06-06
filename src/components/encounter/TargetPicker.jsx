import React from 'react';

// Compact multi-select target picker. Renders one toggle chip per selectable
// encounter entry (name + pc/enemy kind). Reusable by the turn tracker now and
// by Strike/spell "Use" affordances in later slices.
//
// @param {Array}    selectable  - entries [{ entryId, kind, name }]
// @param {Function} isTargeted  - (entryId) => boolean
// @param {Function} isFlanking  - (entryId) => boolean — true when this PC flanks that entry
// @param {Function} onToggle    - (entryId) => void
const TargetPicker = ({ selectable, isTargeted, isFlanking, onToggle }) => {
  if (!selectable || selectable.length === 0) {
    return <div className="ttp-targets-empty">No targets available</div>;
  }
  return (
    <div className="ttp-targets" role="group" aria-label="Select targets">
      {selectable.map((e) => {
        const on = isTargeted(e.entryId);
        return (
          <button
            key={e.entryId}
            type="button"
            className={[
              'ttp-target-chip',
              on ? 'ttp-target-chip--on' : '',
              e.kind === 'enemy' ? 'ttp-target-chip--enemy' : '',
            ].filter(Boolean).join(' ')}
            aria-pressed={on}
            aria-label={`Target ${e.name}`}
            onClick={() => onToggle(e.entryId)}
          >
            <span className="ttp-target-name">{e.name}</span>
            {isFlanking?.(e.entryId) && (
              <span className="ttp-flanked-badge" aria-label={`${e.name} is flanked`} title="Flanked">⚔</span>
            )}
            <span className="ttp-target-kind">{e.kind === 'enemy' ? 'enemy' : 'pc'}</span>
          </button>
        );
      })}
    </div>
  );
};

export default TargetPicker;
