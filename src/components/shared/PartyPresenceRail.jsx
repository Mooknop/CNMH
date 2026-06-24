import React from 'react';
import './PartyPresenceRail.css';

const initialOf = (name) => (name || '?').charAt(0).toUpperCase();

// Shared presence rail: accent-tinted party avatars with a ready/planning status
// dot, plus a "<readyCount>/<total> <label>" tally. Read-only and presentational
// — driven by a usePartyActivity party list. Used by the Downtime ledger and the
// Exploration board. `label` names the ready state ("locked in", "chosen", …).
const PartyPresenceRail = ({ party, readyCount, total, label = 'ready' }) => (
  <div className="ppr">
    <div className="ppr-rail">
      {party.map((p) => (
        <div
          key={p.char.id}
          className={`ppr-avatar${p.isYou ? ' is-you' : ''}`}
          style={{ '--c': p.color }}
          title={`${p.char.name} — ${p.status === 'ready' ? label : 'planning'}`}
        >
          {initialOf(p.char.name)}
          <span className={`ppr-status ${p.status === 'ready' ? 'ready' : 'planning'}`} />
        </div>
      ))}
    </div>
    <div className="ppr-count">
      <div className="ppr-count-n"><b>{readyCount}</b>/{total}</div>
      <div className="ppr-count-l">{label}</div>
    </div>
  </div>
);

export default PartyPresenceRail;
