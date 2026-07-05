import React, { useState } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSession } from '../../contexts/SessionContext';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import { cpToGp } from '../../utils/earnIncome';
import { creditEarnIncome } from '../../utils/applyEarnIncome';
import { grantCraftedItem } from '../../utils/applyCrafting';
import { saveDocument } from '../../utils/gmApi';
import { pendingResults, markConfirmed, removeResult } from '../../utils/earnIncomeResults';
import './DowntimeResultsApproval.css';

const DEGREE_LABEL = {
  criticalSuccess: 'Crit Success',
  success: 'Success',
  failure: 'Failure',
  criticalFailure: 'Crit Failure',
};

// GM review queue for player-submitted downtime results — both Earn Income rolls
// and Crafting completions (distinguished by `kind`). Confirm commits the
// outcome and keeps the entry as a record (so it isn't applied twice); Reject
// drops it. Earn Income credits gold; Crafting grants the item to the character
// doc (durable via saveDocument). Nothing commits until the GM confirms.
const DowntimeResultsApproval = () => {
  const [results, setResults] = useSyncedState('cnmh_downtimeresults_global', null);
  const { getState, sendUpdate } = useSession();
  const { rawCharacters, refresh } = useContent();
  const { appendLog } = useEncounter();
  const [busy, setBusy] = useState(null); // id being granted (async)

  const pending = pendingResults(results?.entries);
  if (pending.length === 0) return null;

  const markDone = (id) =>
    setResults((prev) => ({ entries: markConfirmed(prev?.entries, id) }));

  const confirm = async (entry) => {
    if (entry.kind === 'crafting') {
      setBusy(entry.id);
      try {
        await grantCraftedItem({ entry, rawCharacters, saveDocument, refresh, appendLog });
        markDone(entry.id);
      } finally {
        setBusy(null);
      }
      return;
    }
    // Retrain / Research commit no resources — the GM applies the actual change
    // (a sheet edit, or a Research unlock via #206); confirming just logs it.
    if (entry.kind === 'retrain' || entry.kind === 'research') {
      appendLog({ type: 'action', charId: entry.charId, text: confirmLog(entry) });
      markDone(entry.id);
      return;
    }
    creditEarnIncome({ entry, getState, sendUpdate, appendLog });
    markDone(entry.id);
  };

  const reject = (entry) =>
    setResults((prev) => ({ entries: removeResult(prev?.entries, entry.id) }));

  const retrainSwap = (entry) =>
    `${entry.retrainType}${entry.fromLabel ? ` — ${entry.fromLabel}` : ''}${entry.toLabel ? ` → ${entry.toLabel}` : ''}`;

  const detail = (entry) => {
    if (entry.kind === 'crafting') {
      return `Crafted ${entry.itemName} (${DEGREE_LABEL[entry.degree] || entry.degree})`;
    }
    if (entry.kind === 'retrain') return `Retrain: ${retrainSwap(entry)}`;
    if (entry.kind === 'research') return `Research: ${entry.topic} — resolve via #206`;
    const where = entry.locationName ? ` at ${entry.locationName}` : ' (freelance)';
    return `${entry.skillLabel}${where} · Lvl ${entry.taskLevel} DC ${entry.dc} · rolled ${entry.total} (${DEGREE_LABEL[entry.degree] || entry.degree})`;
  };

  const confirmLog = (entry) =>
    entry.kind === 'retrain'
      ? `${entry.charName} retrained — ${retrainSwap(entry)}`
      : `${entry.charName} completed research: ${entry.topic}`;

  const payout = (entry) => {
    if (entry.kind === 'crafting') return 'item';
    if (entry.kind === 'retrain' || entry.kind === 'research') return '—';
    return entry.payoutCp > 0 ? `${cpToGp(entry.payoutCp)} gp` : '—';
  };

  const KIND_LABEL = { crafting: 'craft', retrain: 'retrain', research: 'research' };
  const kindLabel = (entry) => KIND_LABEL[entry.kind] || 'Earn Income';

  return (
    <>
      <span className="pmc-label">Downtime Results — Review ({pending.length})</span>
      <ul className="eia-list" aria-label="Downtime results awaiting review">
        {pending.map((entry) => (
          <li key={entry.id} className={`eia-row eia-row--${entry.degree}`}>
            <div className="eia-info">
              <span className="eia-name">{entry.charName}</span>
              <span className="eia-detail">{detail(entry)}</span>
            </div>
            <span className="eia-payout">{payout(entry)}</span>
            <div className="eia-actions">
              <button
                className="pmc-btn pmc-btn--primary pmc-btn--sm"
                disabled={busy === entry.id}
                onClick={() => confirm(entry)}
                aria-label={`Confirm ${entry.charName} ${kindLabel(entry)}`}
              >
                {busy === entry.id ? 'Granting…' : 'Confirm'}
              </button>
              <button
                className="pmc-btn pmc-btn--danger pmc-btn--sm"
                disabled={busy === entry.id}
                onClick={() => reject(entry)}
                aria-label={`Reject ${entry.charName} ${kindLabel(entry)}`}
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

export default DowntimeResultsApproval;
