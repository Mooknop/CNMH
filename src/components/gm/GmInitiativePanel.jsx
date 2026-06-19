import React, { useCallback, useState } from 'react';
import { useSession } from '../../contexts/SessionContext';
import { useInitiativeRoll } from '../../hooks/useInitiativeRoll';
import './GmInitiativePanel.css';

// One status row: reads a PC's cnmh_initroll_<charId> and reports it up so the
// panel can tally N/M and build the commit. A separate component per PC keeps the
// per-key useSyncedState read within React's hook rules.
const PcInitRow = ({ charId, name, onRoll }) => {
  const { roll } = useInitiativeRoll(charId);
  React.useEffect(() => { onRoll(charId, roll); }, [charId, roll, onRoll]);
  const submitted = roll && typeof roll.total === 'number';
  return (
    <li className="gm-init-row" data-testid={`init-status-${charId}`}>
      <span className="gm-init-name">{name}</span>
      <span className={`gm-init-state ${submitted ? 'is-in' : 'is-waiting'}`}>
        {submitted ? `${roll.total}${roll.skill ? ` · ${roll.skill}` : ''}` : 'waiting…'}
      </span>
    </li>
  );
};

// GM setup panel for the Foundry-linked initiative flow (#494 Slice 4). Shows which
// expected PCs have rolled (N / M), and gives the GM manual control so an absent or
// stalled player can't freeze the start of combat:
//   • Start anyway — commit whatever rolls are in (the bridge rolls NPCs and starts).
//   • Reopen initiative — clear submitted rolls so players can re-enter.
// The bridge auto-commits once *every* PC has rolled (Slice 3); this is the override.
const GmInitiativePanel = ({ pcs }) => {
  const { sendUpdate } = useSession();
  const [rolls, setRolls] = useState({});

  // Stable so the child status effect doesn't re-fire; skips no-op identical writes.
  const handleRoll = useCallback((charId, roll) => {
    setRolls((cur) => (cur[charId] === roll ? cur : { ...cur, [charId]: roll }));
  }, []);

  const submittedFor = (charId) => {
    const r = rolls[charId];
    return r && typeof r.total === 'number' ? r : null;
  };
  const inCount = pcs.filter((p) => submittedFor(p.charId)).length;

  // Commit with the rolls that are in. Missing PCs are simply omitted — the bridge
  // rolls NPCs and starts; the GM can roll an absent seat in Foundry directly.
  const handleStartAnyway = () => {
    const commitRolls = pcs
      .map((p) => {
        const r = submittedFor(p.charId);
        return r ? { entryId: p.entryId, initiative: r.total } : null;
      })
      .filter(Boolean);
    sendUpdate('global', 'initcommit', { rolls: commitRolls, rollNpcs: true });
  };

  // Retract every submitted roll so players re-enter; the bridge drops them from its
  // tally (a null initroll is the retract signal it already handles).
  const handleReopen = () => {
    pcs.forEach((p) => sendUpdate(p.charId, 'initroll', null));
  };

  return (
    <div className="gm-init-panel" aria-label="initiative-setup-panel">
      <div className="gm-init-head">
        <h3>Roll for initiative</h3>
        <span className="gm-init-count" aria-label="initiative-rolled-count">
          {inCount} / {pcs.length} in
        </span>
      </div>

      {pcs.length === 0 ? (
        <p className="gm-help">No PC combatants yet.</p>
      ) : (
        <ul className="gm-init-list" aria-label="initiative-roll-status">
          {pcs.map((p) => (
            <PcInitRow key={p.charId} charId={p.charId} name={p.name} onRoll={handleRoll} />
          ))}
        </ul>
      )}

      <div className="gm-init-actions">
        <button
          type="button"
          className="btn-primary"
          aria-label="start-anyway"
          onClick={handleStartAnyway}
        >
          Start anyway
        </button>
        <button
          type="button"
          className="btn-secondary"
          aria-label="reopen-initiative"
          onClick={handleReopen}
        >
          Reopen initiative
        </button>
      </div>
    </div>
  );
};

export default GmInitiativePanel;
