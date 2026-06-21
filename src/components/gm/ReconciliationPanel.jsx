// GM reconciliation dashboard (#557, epic #555). Surfaces the engine's pending
// live↔doc divergences per PC and commits them with a single party-wide Sync.
// Per-change / per-PC Discard excludes items; Undo reverts the last sync (docs
// AND overlays). Subsumes the old ConsumablesCleanup panel.

import React from 'react';
import { useReconciliation, reconChangeId } from '../../hooks/useReconciliation';
import './ReconciliationPanel.css';

const ReconciliationPanel = () => {
  const {
    pendingByChar,
    discarded,
    toggleDiscard,
    discardChar,
    totalActive,
    sync,
    undo,
    canUndo,
    busy,
    lastResult,
  } = useReconciliation();

  const failed = lastResult?.failed || [];

  return (
    <section className="gm-recon" aria-label="Pending player changes">
      <h3 className="gm-recon-title">Pending player changes</h3>
      <p className="gm-recon-hint">
        Durable changes players made this session (used consumables, …) that
        haven&apos;t been written to the character doc yet. Sync to commit them so
        they survive a reseed.
      </p>

      {pendingByChar.length === 0 ? (
        <p className="gm-recon-empty" data-testid="recon-empty">
          No pending changes.
        </p>
      ) : (
        <ul className="gm-recon-list">
          {pendingByChar.map(({ char, changes }) => (
            <li key={char.id} className="gm-recon-char">
              <div className="gm-recon-char-head">
                <span className="gm-recon-char-name">{char.name}</span>
                <button
                  type="button"
                  className="btn-small btn-secondary"
                  data-testid={`recon-discard-char-${char.id}`}
                  disabled={busy}
                  onClick={() => discardChar(char.id)}
                >
                  Discard all
                </button>
              </div>
              <ul className="gm-recon-changes">
                {changes.map((c) => {
                  const id = reconChangeId(c);
                  const isDiscarded = discarded.has(id);
                  return (
                    <li
                      key={id}
                      className={`gm-recon-change${isDiscarded ? ' is-discarded' : ''}`}
                      data-testid={`recon-change-${id}`}
                    >
                      <span className="gm-recon-change-label">{c.label}</span>
                      <span className="gm-recon-change-detail">{c.detail}</span>
                      <button
                        type="button"
                        className="btn-small btn-tertiary"
                        data-testid={`recon-discard-${id}`}
                        disabled={busy}
                        onClick={() => toggleDiscard(id)}
                      >
                        {isDiscarded ? 'Restore' : 'Discard'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <div className="gm-recon-actions">
        <button
          type="button"
          className="btn-small btn-primary"
          data-testid="recon-sync"
          disabled={busy || totalActive === 0}
          onClick={sync}
        >
          {busy ? 'Syncing…' : `Sync to docs${totalActive ? ` (${totalActive})` : ''}`}
        </button>
        {canUndo && (
          <button
            type="button"
            className="btn-small btn-secondary"
            data-testid="recon-undo"
            disabled={busy}
            onClick={undo}
          >
            Undo last sync
          </button>
        )}
      </div>

      {lastResult && (
        <p className="gm-recon-result" data-testid="recon-result">
          {lastResult.synced.length > 0 && (
            <span className="gm-recon-result-ok">
              Synced {lastResult.synced.length} character
              {lastResult.synced.length === 1 ? '' : 's'}.
            </span>
          )}
          {failed.length > 0 && (
            <span className="gm-recon-result-fail">
              {' '}Failed: {failed.map((f) => f.id).join(', ')}.
            </span>
          )}
        </p>
      )}
    </section>
  );
};

export default ReconciliationPanel;
