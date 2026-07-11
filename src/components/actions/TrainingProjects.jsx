import React, { useState, useEffect, useRef } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useLocationSupport } from '../../hooks/useLocationSupport';
import {
  TRAINING_VENDORS,
  availableTrainingVendors,
  eligibleChoices,
  trackLabel,
  trackOffering,
  buildGrant,
} from '../../data/trainingVendors';
import { buildTrainingResult } from '../../utils/earnIncomeResults';
import './TrainingProjects.css';
import { APP, syncKey, globalKey } from '../../sync/keys';

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// Training tracks panel (#1191 S1) — the Crafting-Projects sibling for
// learning new abilities at supported Training Vendors. A track banks
// downtime hours (via the allocator's Training activity) until its total is
// met; a full bar shows "ready" — submission to the GM review queue is S2.
//
// cnmh_training_<charId> = { tracks: [{ id, vendorId, offeringId, choiceId?,
// hours, benchmarkHours, status, startedAt }] } — NOT period-scoped: 160h
// spans many downtime blocks, so tracks persist exactly like craft projects.
//
// `vendors` is a test seam; the app always renders the real catalog.
const TrainingProjects = ({ character, vendors = TRAINING_VENDORS }) => {
  const charId = character?.id || 'unknown';
  const [training, setTraining] = useSyncedState(syncKey(APP.TRAINING, charId), null);
  const [, setResults] = useSyncedState(globalKey(APP.DOWNTIMERESULTS), null);
  const { supported } = useLocationSupport();
  const submittedRef = useRef(new Set());

  const [adding, setAdding] = useState(false);
  const [offeringKey, setOfferingKey] = useState(''); // `${vendorId}::${offeringId}`
  const [choiceId, setChoiceId] = useState('');

  const tracks = training?.tracks || [];
  const offerable = availableTrainingVendors(character, supported, tracks, vendors);

  // A track that reaches its hour total is submitted to the GM review queue as
  // a pending training result — carrying the full grant payload — and dropped
  // from the player's list (S2; same submittedRef double-fire guard as
  // CraftingProjects completed → queue).
  const isComplete = (t) =>
    (t.status || 'in-progress') === 'in-progress' && (t.hours || 0) >= t.benchmarkHours;
  const completedSig = tracks.filter(isComplete).map((t) => t.id).join(',');
  useEffect(() => {
    const completed = (training?.tracks || []).filter(
      (t) => isComplete(t) && !submittedRef.current.has(t.id),
    );
    if (completed.length === 0) return;
    completed.forEach((t) => submittedRef.current.add(t.id));
    const doneIds = new Set(completed.map((t) => t.id));
    setResults((prev) => ({
      entries: [
        ...(prev?.entries || []),
        ...completed.map((t) => {
          const offering = trackOffering(t, vendors);
          const choice = t.choiceId
            ? (offering?.choices || []).find((c) => c.id === t.choiceId)
            : null;
          return buildTrainingResult({
            charId,
            charName: character?.name,
            vendorId: t.vendorId,
            vendorName: vendors.find((v) => v.id === t.vendorId)?.name || t.vendorId,
            offeringId: t.offeringId,
            offeringName: offering?.name || t.offeringId,
            choiceId: choice?.id,
            choiceName: choice?.name,
            grant: buildGrant(offering, choice),
          });
        }),
      ],
    }));
    setTraining((prev) => ({
      tracks: (prev?.tracks || []).filter((t) => !doneIds.has(t.id)),
    }));
  // completedSig is the stable signature of the completed set; training is
  // re-read fresh inside and the synced setters are stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedSig]);

  // Nothing to show and nothing to start — the panel stays out of the tab.
  if (tracks.length === 0 && offerable.length === 0) return null;

  const selected = (() => {
    if (!offeringKey) return null;
    const [vendorId, offeringId] = offeringKey.split('::');
    const entry = offerable.find((e) => e.vendor.id === vendorId);
    const offering = entry?.offerings.find((o) => o.id === offeringId);
    return offering ? { vendor: entry.vendor, offering } : null;
  })();
  const choices = selected ? eligibleChoices(selected.offering, character) : null;
  const canStart = !!selected && (!choices || !!choiceId);

  const cancelAdding = () => {
    setAdding(false);
    setOfferingKey('');
    setChoiceId('');
  };

  const startTrack = () => {
    if (!canStart) return;
    setTraining((prev) => ({
      tracks: [...(prev?.tracks || []), {
        id: makeId(),
        vendorId: selected.vendor.id,
        offeringId: selected.offering.id,
        ...(choices ? { choiceId } : {}),
        hours: 0,
        benchmarkHours: selected.offering.hours,
        status: 'in-progress',
        startedAt: Date.now(),
      }],
    }));
    cancelAdding();
  };

  const abandonTrack = (id) => {
    setTraining((prev) => ({
      tracks: (prev?.tracks || []).filter((t) => t.id !== id),
    }));
  };

  return (
    <div className="tp-wrap">
      <div className="tp-header">
        <span className="tp-title">Training</span>
        {!adding && offerable.length > 0 && (
          <button className="tp-new-btn" onClick={() => setAdding(true)}>+ New</button>
        )}
      </div>

      {tracks.length > 0 && (
        <ul className="tp-list" aria-label="Training tracks">
          {tracks.map((t) => {
            const ready = (t.hours || 0) >= t.benchmarkHours;
            const vendorName = vendors.find((v) => v.id === t.vendorId)?.name || t.vendorId;
            const label = trackLabel(t, vendors);
            return (
              <li
                key={t.id}
                className={`tp-track${ready ? ' tp-track--ready' : ''}`}
                data-testid={`tp-track-${t.id}`}
              >
                <div className="tp-track-header">
                  <span className="tp-track-name">{label}</span>
                  <button
                    className="tp-abandon-btn"
                    onClick={() => abandonTrack(t.id)}
                    aria-label={`Abandon ${label}`}
                  >
                    Abandon
                  </button>
                </div>
                {ready ? (
                  <div className="tp-ready" role="status">
                    <span className="tp-ready-badge">✓ Training complete</span>
                    <span className="tp-track-meta">{vendorName} — awaiting GM confirmation</span>
                  </div>
                ) : (
                  <>
                    <div className="tp-progress-row">
                      <div className="tp-progress-track">
                        <div
                          className="tp-progress-fill"
                          style={{ '--tp-fill': `${Math.min(100, ((t.hours || 0) / t.benchmarkHours) * 100)}%` }}
                        />
                      </div>
                      <span className="tp-progress-label">{t.hours || 0}h / {t.benchmarkHours}h</span>
                    </div>
                    <span className="tp-track-meta">{vendorName}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!adding && tracks.length === 0 && (
        <p className="tp-empty">No active training.</p>
      )}

      {adding && (
        <div className="tp-add-panel">
          <label className="tp-form-label">
            Track
            <select
              className="tp-form-select"
              value={offeringKey}
              onChange={(e) => { setOfferingKey(e.target.value); setChoiceId(''); }}
              aria-label="Training track"
            >
              <option value="">— select training —</option>
              {offerable.map((e) => (
                <optgroup key={e.vendor.id} label={e.vendor.name}>
                  {e.offerings.map((o) => (
                    <option key={o.id} value={`${e.vendor.id}::${o.id}`}>
                      {o.name} ({o.hours}h)
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          {choices && (
            <label className="tp-form-label">
              Learn
              <select
                className="tp-form-select"
                value={choiceId}
                onChange={(e) => setChoiceId(e.target.value)}
                aria-label="Training choice"
              >
                <option value="">— pick one —</option>
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.note ? ` — ${c.note}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {selected?.offering.trigger && (
            <p className="tp-summary"><strong>Trigger</strong> {selected.offering.trigger}</p>
          )}
          {selected?.offering.summary && (
            <p className="tp-summary">{selected.offering.summary}</p>
          )}

          <div className="tp-add-footer">
            <button className="tp-confirm-btn" disabled={!canStart} onClick={startTrack}>
              Start training
            </button>
            <button className="tp-cancel-btn" onClick={cancelAdding}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingProjects;
