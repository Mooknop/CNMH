import React from 'react';
import { usePartyActivity } from '../../hooks/usePartyActivity';
import { trackLabel } from '../../data/trainingVendors';

// GM "In training" readout (#1191 S4). Subscribes to each PC's
// cnmh_training_<id> (via usePartyActivity, which re-renders on any teammate's
// change) and lists their in-progress tracks with hours banked / benchmark.
// Training tracks are NOT period-scoped — they persist across downtime blocks —
// so this shows the standing state, independent of the active block.
const PartyTrainingBoard = () => {
  const { party } = usePartyActivity('training');

  const rows = party
    .map((p) => ({
      char: p.char,
      tracks: (p.state?.tracks || []).filter((t) => (t.status || 'in-progress') === 'in-progress'),
    }))
    .filter((r) => r.tracks.length > 0);

  if (rows.length === 0) return null;

  return (
    <>
      <span className="pmc-label">In Training</span>
      <div className="pmc-training-board">
        {rows.map(({ char, tracks }) => (
          <div key={char.id} className="pmc-training-pc" data-testid={`training-pc-${char.id}`}>
            <span className="pmc-training-name">{char.name}</span>
            <ul className="pmc-training-tracks">
              {tracks.map((t) => {
                const pct = Math.min(100, Math.round(((t.hours || 0) / t.benchmarkHours) * 100));
                const ready = (t.hours || 0) >= t.benchmarkHours;
                return (
                  <li key={t.id} className={`pmc-training-track${ready ? ' is-ready' : ''}`}>
                    <span className="pmc-training-label">{trackLabel(t)}</span>
                    <span className="pmc-training-hours">
                      {ready ? '✓ ready' : `${t.hours || 0}h / ${t.benchmarkHours}h`}
                    </span>
                    <span className="pmc-training-bar" style={{ '--pct': `${pct}%` }} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
};

export default PartyTrainingBoard;
