import React, { useState } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSession } from '../../contexts/SessionContext';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import { cpToGp } from '../../utils/earnIncome';
import { creditEarnIncome } from '../../utils/applyEarnIncome';
import { grantCraftedItem } from '../../utils/applyCrafting';
import { grantTrainedAbility } from '../../utils/applyTraining';
import { saveDocument } from '../../utils/gmApi';
import { pendingResults, markConfirmed, removeResult } from '../../utils/earnIncomeResults';
import ActionSymbol from '../shared/ActionSymbol';
import './DowntimeResultsApproval.css';
import { APP, globalKey } from '../../sync/keys';

// The ability a training entry would grant, flattened for the GM preview:
// { cost, name, trigger, description }. Reaction grants show the reaction glyph
// + trigger; feat (stance) grants show the stance action's cost.
const grantPreview = (entry) => {
  const g = entry?.grant;
  if (!g) return null;
  if (g.kind === 'reaction') {
    const r = g.reaction || {};
    return { cost: 'reaction', name: r.name, trigger: r.trigger, description: r.description };
  }
  if (g.kind === 'feat') {
    const f = g.feat || {};
    const stanceAction = (f.actions || []).find((a) => a.traits?.includes('Stance')) || f.actions?.[0];
    return { cost: stanceAction?.actionCount ?? 1, name: f.name, trigger: null, description: f.description };
  }
  return null;
};

const DEGREE_LABEL = {
  criticalSuccess: 'Crit Success',
  success: 'Success',
  failure: 'Failure',
  criticalFailure: 'Crit Failure',
};

// GM review queue for player-submitted downtime results — Earn Income rolls,
// Crafting completions, and Training completions (distinguished by `kind`).
// Confirm commits the outcome and keeps the entry as a record (so it isn't
// applied twice); Reject drops it. Earn Income credits gold; Crafting grants
// the item, and Training the ability, to the character doc (durable via
// saveDocument). Nothing commits until the GM confirms.
const DowntimeResultsApproval = () => {
  const [results, setResults] = useSyncedState(globalKey(APP.DOWNTIMERESULTS), null);
  const { getState, sendUpdate } = useSession();
  const { rawCharacters, refresh } = useContent();
  const { appendLog } = useEncounter();
  const [busy, setBusy] = useState(null); // id being granted (async)
  const [expanded, setExpanded] = useState(null); // training entry id previewing

  const pending = pendingResults(results?.entries);
  if (pending.length === 0) return null;

  const markDone = (id) =>
    setResults((prev) => ({ entries: markConfirmed(prev?.entries, id) }));

  const confirm = async (entry) => {
    if (entry.kind === 'crafting' || entry.kind === 'training') {
      const grant = entry.kind === 'crafting' ? grantCraftedItem : grantTrainedAbility;
      setBusy(entry.id);
      try {
        await grant({ entry, rawCharacters, saveDocument, refresh, appendLog });
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
    if (entry.kind === 'training') {
      return `Training: ${entry.offeringName}${entry.choiceName ? ` — ${entry.choiceName}` : ''} at ${entry.vendorName}`;
    }
    const where = entry.locationName ? ` at ${entry.locationName}` : ' (freelance)';
    return `${entry.skillLabel}${where} · Lvl ${entry.taskLevel} DC ${entry.dc} · rolled ${entry.total} (${DEGREE_LABEL[entry.degree] || entry.degree})`;
  };

  const confirmLog = (entry) =>
    entry.kind === 'retrain'
      ? `${entry.charName} retrained — ${retrainSwap(entry)}`
      : `${entry.charName} completed research: ${entry.topic}`;

  const payout = (entry) => {
    if (entry.kind === 'crafting') return 'item';
    if (entry.kind === 'training') return 'ability';
    if (entry.kind === 'retrain' || entry.kind === 'research') return '—';
    return entry.payoutCp > 0 ? `${cpToGp(entry.payoutCp)} gp` : '—';
  };

  const KIND_LABEL = { crafting: 'craft', retrain: 'retrain', research: 'research', training: 'training' };
  const kindLabel = (entry) => KIND_LABEL[entry.kind] || 'Earn Income';

  return (
    <>
      <span className="pmc-label">Downtime Results — Review ({pending.length})</span>
      <ul className="eia-list" aria-label="Downtime results awaiting review">
        {pending.map((entry) => {
          const preview = entry.kind === 'training' ? grantPreview(entry) : null;
          const isOpen = expanded === entry.id;
          return (
            <li key={entry.id} className={`eia-row eia-row--${entry.degree}`}>
              <div className="eia-info">
                <span className="eia-name">{entry.charName}</span>
                <span className="eia-detail">{detail(entry)}</span>
              </div>
              <span className="eia-payout">{payout(entry)}</span>
              <div className="eia-actions">
                {preview && (
                  <button
                    className="pmc-btn pmc-btn--sm"
                    onClick={() => setExpanded(isOpen ? null : entry.id)}
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? 'Hide' : 'Preview'} ${preview.name} for ${entry.charName}`}
                  >
                    {isOpen ? 'Hide' : 'Preview'}
                  </button>
                )}
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

              {preview && isOpen && (
                <div className="eia-preview" data-testid={`preview-${entry.id}`}>
                  <div className="eia-preview-head">
                    <ActionSymbol cost={preview.cost} />
                    <span className="eia-preview-name">{preview.name}</span>
                  </div>
                  {preview.trigger && (
                    <p className="eia-preview-line">
                      <strong>Trigger</strong> {preview.trigger}
                    </p>
                  )}
                  {preview.description && (
                    <p className="eia-preview-line">{preview.description}</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
};

export default DowntimeResultsApproval;
