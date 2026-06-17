import React from 'react';
import './MinionActionBudget.css';

// The minion's granted-action pool (#391), shown inside the companion/familiar
// modal during an encounter. Display-only: it renders one pip per granted action
// (filled as they're spent) plus an "N left" readout; the parent modal enforces
// the hard-block by disabling Strike/Move/maneuver buttons when none remain.
//
// Before the owner Commands the minion, `granted` is 0 — surface a hint that the
// pool has to be filled first rather than an empty bar.
const MinionActionBudget = ({ granted = 0, spent = 0 }) => {
  const left = Math.max(0, granted - spent);

  if (granted <= 0) {
    return (
      <div className="mab" role="status">
        <span className="mab-hint">Command to grant actions</span>
      </div>
    );
  }

  return (
    <div className="mab" role="status" aria-label={`${left} granted actions left`}>
      <div className="mab-pips" aria-hidden="true">
        {Array.from({ length: granted }, (_, i) => (
          <span
            key={i}
            className={`mab-pip${i < spent ? ' mab-pip--filled' : ''}`}
          />
        ))}
        {spent > granted && <span className="mab-over">+{spent - granted}</span>}
      </div>
      <span className="mab-count">
        <strong>{left}</strong> left
      </span>
    </div>
  );
};

export default MinionActionBudget;
