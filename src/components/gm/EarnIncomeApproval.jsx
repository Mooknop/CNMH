import React from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSession } from '../../contexts/SessionContext';
import { useEncounter } from '../../hooks/useEncounter';
import { cpToGp } from '../../utils/earnIncome';
import { creditEarnIncome } from '../../utils/applyEarnIncome';
import { pendingResults, markConfirmed, removeResult } from '../../utils/earnIncomeResults';
import './EarnIncomeApproval.css';

const DEGREE_LABEL = {
  criticalSuccess: 'Crit Success',
  success: 'Success',
  failure: 'Failure',
  criticalFailure: 'Crit Failure',
};

// GM review queue for player-submitted Earn Income rolls. Confirm credits the
// payout to the PC's gold and logs it (the entry stays as a 'confirmed' record
// so the roll isn't paid twice); Reject drops the entry so the player can
// re-submit that day's roll. No gold moves until the GM confirms.
const EarnIncomeApproval = () => {
  const [results, setResults] = useSyncedState('cnmh_downtimeresults_global', null);
  const { getState, sendUpdate } = useSession();
  const { appendLog } = useEncounter();

  const pending = pendingResults(results?.entries);
  if (pending.length === 0) return null;

  const confirm = (entry) => {
    creditEarnIncome({ entry, getState, sendUpdate, appendLog });
    setResults((prev) => ({ entries: markConfirmed(prev?.entries, entry.id) }));
  };

  const reject = (entry) => {
    setResults((prev) => ({ entries: removeResult(prev?.entries, entry.id) }));
  };

  return (
    <>
      <span className="pmc-label">Earn Income — Review ({pending.length})</span>
      <ul className="eia-list" aria-label="Earn Income results awaiting review">
        {pending.map((entry) => (
          <li key={entry.id} className={`eia-row eia-row--${entry.degree}`}>
            <div className="eia-info">
              <span className="eia-name">{entry.charName}</span>
              <span className="eia-detail">
                {entry.skillLabel} · Lvl {entry.taskLevel} DC {entry.dc} · rolled {entry.total}
                {' '}({DEGREE_LABEL[entry.degree] || entry.degree})
              </span>
            </div>
            <span className="eia-payout">
              {entry.payoutCp > 0 ? `${cpToGp(entry.payoutCp)} gp` : '—'}
            </span>
            <div className="eia-actions">
              <button
                className="pmc-btn pmc-btn--primary pmc-btn--sm"
                onClick={() => confirm(entry)}
                aria-label={`Confirm ${entry.charName} Earn Income`}
              >
                Confirm
              </button>
              <button
                className="pmc-btn pmc-btn--danger pmc-btn--sm"
                onClick={() => reject(entry)}
                aria-label={`Reject ${entry.charName} Earn Income`}
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
};

export default EarnIncomeApproval;
