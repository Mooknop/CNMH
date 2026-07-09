import React from 'react';
import { usePartyDowntime } from '../../hooks/usePartyDowntime';
import { DOWNTIME_ACTIVITIES } from '../../data/downtimeActivities';
import PartyPresenceRail from '../shared/PartyPresenceRail';
import PartyLedgerRow from '../shared/PartyLedgerRow';
import './DowntimePartyLedger.css';

// Ordered activity-colored day-groups for one PC's week, then the trailing free
// block. Order follows DOWNTIME_ACTIVITIES (the canonical fill order).
const segmentsFor = (plan, paired, blockDays) => {
  const groups = [];
  for (const a of DOWNTIME_ACTIVITIES) {
    const d = plan?.[a.name] || 0;
    if (d > 0) groups.push({ name: a.name, hue: a.hue, days: d, paired: !!(paired && paired[a.name]) });
  }
  const used = groups.reduce((s, g) => s + g.days, 0);
  const free = Math.max(0, (blockDays || 0) - used);
  if (free > 0) groups.push({ name: null, days: free });
  return groups;
};

// A single PC's week as a ribbon of grouped, activity-colored day-blocks.
const Ribbon = ({ plan, paired, blockDays }) => {
  const segs = segmentsFor(plan, paired, blockDays);
  return (
    <div className="dpl-ribbon">
      {segs.map((g, i) => {
        const wide = g.days >= 2;
        return (
          <div
            key={i}
            className={`dpl-seg${g.name ? ' assigned' : ' free'}${g.paired ? ' paired' : ''}`}
            style={g.name ? { '--seg-grow': g.days, '--seg-c': g.hue } : { '--seg-grow': g.days }}
            title={g.name ? `${g.name} · ${g.days}d` : `${g.days} free`}
          >
            {g.paired && <span className="dpl-seg-mark">✦</span>}
            {g.name && wide && (
              <span className="dpl-seg-lbl">{g.name}<span className="dpl-seg-days">{g.days}</span></span>
            )}
            {g.name && !wide && <span className="dpl-seg-days dpl-seg-days--solo">{g.days}</span>}
          </div>
        );
      })}
    </div>
  );
};

// The shared Party Ledger: a presence rail (who's locked in) above a row-per-PC
// schedule of activity-colored day-blocks. Read-only — players edit only their
// own week in the allocator below; this surfaces the whole party's plans live.
const DowntimePartyLedger = ({ character, block }) => {
  const startedAt = block?.startedAt;
  const blockDays = block?.days ?? 0;
  const { party, readyCount, total } = usePartyDowntime(startedAt, character?.id);

  return (
    <div className="dpl">
      <PartyPresenceRail party={party} readyCount={readyCount} total={total} label="locked in" />

      <div className="dpl-ledger">
        <div className="dpl-ledger-head">
          <span className="dpl-ttl">Party Ledger</span>
          <span className="dpl-hint">you plan your week below</span>
        </div>

        <div className="dpl-ruler">
          {Array.from({ length: blockDays }, (_, i) => (
            <span key={i} className="dpl-tick">{i + 1}</span>
          ))}
        </div>

        <div className="dpl-rows">
          {party.map((p) => (
            <PartyLedgerRow
              key={p.char.id}
              char={p.char}
              color={p.color}
              isYou={p.isYou}
              meta={p.char.class}
            >
              <Ribbon plan={p.plan} paired={p.paired} blockDays={blockDays} />
            </PartyLedgerRow>
          ))}
        </div>
      </div>

      <div className="dpl-legend">
        {DOWNTIME_ACTIVITIES.map((a) => (
          <div key={a.name} className="dpl-legend-item">
            <span className="dpl-legend-sw" style={{ '--seg-c': a.hue }} />{a.name}
          </div>
        ))}
        <div className="dpl-legend-item">
          <span className="dpl-legend-sw" />Free
        </div>
      </div>
    </div>
  );
};

export default DowntimePartyLedger;
