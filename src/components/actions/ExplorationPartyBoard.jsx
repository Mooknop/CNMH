import React from 'react';
import { usePartyActivity } from '../../hooks/usePartyActivity';
import PartyPresenceRail from '../shared/PartyPresenceRail';
import PartyLedgerRow from '../shared/PartyLedgerRow';
import './ExplorationPartyBoard.css';

// The party's exploration activities at a glance: a presence rail (who's chosen)
// over one shared row per PC whose body is the chosen-activity chip — or a muted
// "deciding…" placeholder while they make up their mind. Read-only; players still
// pick their own via the ExplorationList below. Single-activity, so no day
// allocation (cf. the Downtime ledger's ribbon).
const ExplorationPartyBoard = ({ character }) => {
  const { party, readyCount, total } = usePartyActivity('exploration', {
    youId: character?.id,
    deriveStatus: (state) => (state != null ? 'ready' : 'planning'),
  });

  if (total === 0) return null;

  return (
    <div className="epb">
      <PartyPresenceRail party={party} readyCount={readyCount} total={total} label="chosen" />

      <div className="epb-head">
        <span className="epb-ttl">Party Activities</span>
        <span className="epb-hint">you choose yours below</span>
      </div>

      <div className="epb-rows">
        {party.map((p) => (
          <PartyLedgerRow key={p.char.id} char={p.char} color={p.color} isYou={p.isYou} meta={p.char.class}>
            {p.state ? (
              <span className="epb-chip">{p.state}</span>
            ) : (
              <span className="epb-chip epb-chip--empty">deciding…</span>
            )}
          </PartyLedgerRow>
        ))}
      </div>
    </div>
  );
};

export default ExplorationPartyBoard;
