import React, { useMemo, useState } from 'react';
import { saveDocument } from '../../utils/gmApi';
import { EVENT_STATUSES, STATUS_META, eventStatus } from '../../utils/events';

// The GM-tracking fields of an event, normalized for editing/equality. Missing
// fields fall back to the import defaults (tracked unless explicitly false).
const trackingOf = (event) => ({
  status: eventStatus(event),
  tracked: event.tracked !== false,
  steps: (Array.isArray(event.steps) ? event.steps : []).map((s) => ({
    label: s.label || '',
    done: !!s.done,
  })),
  scheduledFor: event.scheduledFor || '',
  outcome: event.outcome || '',
  notes: event.notes || '',
});

// Editable tracking panel for one event (#1112, S3). All of an event's GM state
// — status, a party-progress checklist, a scheduled game date, the recorded
// outcome, campaign notes, and the hide toggle — edited as a single draft and
// persisted on the event doc with one PUT (saveDocument archives the prior
// version → restorable, no new sync keys). Remounted per event (key) at the
// call site, so the draft resets when the GM switches events. Dirty is measured
// against the live doc, so a successful save (which broadcasts the new doc back)
// settles the button to disabled.
const EventTracker = ({ event }) => {
  const saved = useMemo(() => trackingOf(event), [event]);
  const [draft, setDraft] = useState(saved);
  const [state, setState] = useState('idle'); // idle | saving | saved | error

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const update = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setState('idle');
  };
  const updateStep = (i, patch) => {
    setDraft((d) => ({ ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
    setState('idle');
  };
  const addStep = () => update({ steps: [...draft.steps, { label: '', done: false }] });
  const removeStep = (i) => update({ steps: draft.steps.filter((_, j) => j !== i) });

  const save = async () => {
    setState('saving');
    // Drop blank-label steps and trim the schedule so a settled save matches
    // the doc that broadcasts back (keeps `dirty` from sticking on).
    const next = {
      ...draft,
      steps: draft.steps.map((s) => ({ label: s.label.trim(), done: s.done })).filter((s) => s.label),
      scheduledFor: draft.scheduledFor.trim(),
    };
    try {
      await saveDocument('event', event.id, { ...event, ...next });
      setDraft(next);
      setState('saved');
    } catch {
      setState('error');
    }
  };

  const doneCount = draft.steps.filter((s) => s.done).length;

  return (
    <section className="gm-event-tracker" aria-label="Event tracking">
      <div className="gm-event-track-row">
        <span className="gm-event-track-label">Status</span>
        <div className="gm-event-status-picker" role="group" aria-label="Event status">
          {EVENT_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`gm-event-status-opt ${STATUS_META[s].className} ${draft.status === s ? 'active' : ''}`}
              aria-pressed={draft.status === s}
              onClick={() => update({ status: s })}
            >
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
      </div>

      <label className="gm-event-track-checkbox">
        <input
          type="checkbox"
          checked={draft.tracked}
          onChange={(e) => update({ tracked: e.target.checked })}
        />
        Show in the tracker <span className="gm-help-inline">(uncheck to hide connective pages)</span>
      </label>

      <div className="gm-event-track-row">
        <label htmlFor="gm-event-sched" className="gm-event-track-label">Scheduled for</label>
        <input
          id="gm-event-sched"
          type="text"
          className="gm-event-sched-input"
          placeholder="e.g. Rova 12"
          value={draft.scheduledFor}
          onChange={(e) => update({ scheduledFor: e.target.value })}
        />
      </div>

      <div className="gm-event-steps">
        <div className="gm-event-track-label">
          Party progress{draft.steps.length > 0 && <span className="gm-event-steps-count"> · {doneCount}/{draft.steps.length}</span>}
        </div>
        {draft.steps.map((s, i) => (
          <div key={i} className="gm-event-step">
            <input
              type="checkbox"
              checked={s.done}
              onChange={(e) => updateStep(i, { done: e.target.checked })}
              aria-label={`Step ${i + 1} done`}
            />
            <input
              type="text"
              className="gm-event-step-label"
              value={s.label}
              placeholder="Describe a beat…"
              onChange={(e) => updateStep(i, { label: e.target.value })}
              aria-label={`Step ${i + 1} label`}
            />
            <button
              type="button"
              className="gm-event-step-remove"
              onClick={() => removeStep(i)}
              aria-label={`Remove step ${i + 1}`}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn-secondary gm-event-step-add" onClick={addStep}>
          + Add step
        </button>
      </div>

      <label htmlFor="gm-event-outcome" className="gm-event-track-label">Outcome</label>
      <textarea
        id="gm-event-outcome"
        className="gm-event-textarea"
        rows={3}
        placeholder="What actually happened…"
        value={draft.outcome}
        onChange={(e) => update({ outcome: e.target.value })}
      />

      <label htmlFor="gm-event-notes" className="gm-event-track-label">Campaign significance (GM notes)</label>
      <textarea
        id="gm-event-notes"
        className="gm-event-textarea"
        rows={3}
        placeholder="Private GM notes — significance, callbacks, reminders…"
        value={draft.notes}
        onChange={(e) => update({ notes: e.target.value })}
      />

      <div className="gm-event-track-actions">
        <button type="button" className="btn-primary" disabled={!dirty || state === 'saving'} onClick={save}>
          {state === 'saving' ? 'Saving…' : 'Save tracking'}
        </button>
        {state === 'saved' && <span className="gm-ok">Saved.</span>}
        {state === 'error' && <span className="gm-warn">Save failed — try again.</span>}
      </div>
    </section>
  );
};

export default EventTracker;
