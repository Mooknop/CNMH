import React from 'react';
import './PartyLedgerRow.css';

const initialOf = (name) => (name || '?').charAt(0).toUpperCase();
const firstNameOf = (name) => (name || '?').split(' ')[0];

// Shared party-board row shell: a fixed name gutter (accent mono avatar + first
// name + You tag + optional meta line) beside a pluggable body slot. The body is
// the per-flow visualization — a downtime ribbon, an exploration activity chip,
// etc. `--c` is the PC's accent; the viewer's row gets the is-you emphasis.
const PartyLedgerRow = ({ char, color, isYou, meta, children }) => (
  <div className={`plr${isYou ? ' is-you' : ''}`} style={{ '--c': color }}>
    <div className="plr-who">
      <div className="plr-mono">{initialOf(char.name)}</div>
      <div className="plr-id">
        <div className="plr-name">
          {firstNameOf(char.name)}
          {isYou && <span className="plr-you-tag">You</span>}
        </div>
        {meta && <div className="plr-meta">{meta}</div>}
      </div>
    </div>
    <div className="plr-body">{children}</div>
  </div>
);

export default PartyLedgerRow;
