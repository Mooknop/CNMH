import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import { useGmEntryForm } from '../../hooks/useGmEntryForm';
import GmEntryDialogs from '../../components/gm/GmEntryDialogs';
import PageEditorShell from '../../components/gm/PageEditorShell';
import {
  collectTraitReferences,
  orphanTraitReferences,
  normalizeTraitName,
} from '../../utils/traitRefs';
import './gm.css';

// Trait-definition editor. Shape is minimal: { id, name, description }.
// These definitions back the TraitModal opened from TraitTag — the comma-
// separated `traits` reference fields on items/spells resolve to them by name
// (a definition-backed picker for those references is tracked in #376).

const toForm = (t) => {
  const src = t && typeof t === 'object' ? t : {};
  return {
    id: src.id,
    name: src.name || '',
    description: src.description || '',
  };
};

const blankTrait = () => toForm({});

const fromForm = (f) => {
  if (!f.name.trim()) throw new Error('Trait name is required.');
  return {
    name: f.name.trim(),
    description: f.description.trim(),
  };
};

// Coverage report: which referenced trait names have no definition, and where
// they're used. Sits above the editor so a GM can spot typos / missing
// definitions at a glance.
const TraitCoverage = ({ orphans }) => (
  <section className="gm-card gm-trait-coverage" aria-label="Trait coverage">
    <h3>Trait coverage</h3>
    {orphans.length === 0 ? (
      <p className="gm-count">All referenced traits have definitions.</p>
    ) : (
      <>
        <p className="gm-warn">
          {orphans.length} referenced trait{orphans.length === 1 ? '' : 's'}{' '}
          {orphans.length === 1 ? 'has' : 'have'} no definition.
        </p>
        <ul className="gm-trait-coverage-list">
          {orphans.map((o) => (
            <li key={normalizeTraitName(o.display)}>
              <strong>{o.display}</strong>{' '}
              <span className="gm-count">
                — {o.refs.length} use{o.refs.length === 1 ? '' : 's'}:{' '}
                {o.refs.map((r) => r.name).join(', ')}
              </span>
            </li>
          ))}
        </ul>
      </>
    )}
  </section>
);

// Reverse view shown on a saved definition: the content that references it.
const TraitReferences = ({ references }) => (
  <div className="gm-trait-refs">
    {references.length === 0 ? (
      <p className="gm-count">Not referenced by any content.</p>
    ) : (
      <>
        <p className="gm-count">Referenced by {references.length}:</p>
        <ul className="gm-trait-refs-list">
          {references.map((r, i) => (
            <li key={`${r.collection}-${r.id}-${i}`}>
              {r.name} <span className="gm-count">({r.collection})</span>
            </li>
          ))}
        </ul>
      </>
    )}
  </div>
);

const TraitForm = ({ initial, isNew, existingIds, references = [], onSaved, onRestored }) => {
  const [t, setT] = useState(initial);
  const form = useGmEntryForm({ collection: 'trait', isNew, existingIds, onSaved });

  const set = (patch) => setT((cur) => ({ ...cur, ...patch }));

  const save = async () => {
    let body;
    try {
      body = fromForm(t);
    } catch (err) {
      form.setError(err.message);
      return;
    }
    const id = t.id || slugify(body.name);
    await form.save(id, { ...body, id });
  };

  return (
    <div className="gm-card" data-testid={`trait-form-${t.id || 'new'}`}>
      <div className="gm-row">
        <div className="form-group">
          <label>Name</label>
          <input
            aria-label="name"
            value={t.name}
            onChange={(ev) => set({ name: ev.target.value })}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea
          aria-label="description"
          rows={4}
          value={t.description}
          onChange={(ev) => set({ description: ev.target.value })}
        />
      </div>

      {form.error && (
        <p className="gm-warn" role="alert">{form.error}</p>
      )}

      <div className="gm-actions">
        <button className="btn-primary" disabled={form.busy} onClick={save}>
          {isNew ? 'Create trait' : 'Save'}
        </button>
        {!isNew && (
          <>
            <button className="btn-secondary" disabled={form.busy} onClick={() => form.setShowHistory(true)}>
              History
            </button>
            <button
              className="btn-danger"
              disabled={form.busy}
              onClick={form.requestDelete}
            >
              Delete
            </button>
          </>
        )}
      </div>

      {!isNew && <TraitReferences references={references} />}

      <GmEntryDialogs
        form={form}
        collection="trait"
        noun="trait"
        id={t.id}
        name={t.name}
        isNew={isNew}
        onRestored={(doc) => {
          if (doc) setT(toForm(doc));
          onRestored();
        }}
      />
    </div>
  );
};

const GmTraits = () => {
  const content = useContent();
  const traits = content.traits;
  const catalog = useMemo(() => (Array.isArray(traits) ? traits : []), [traits]);
  const existingIds = useMemo(() => existingIdSet(catalog), [catalog]);

  // Reference map (name -> usages) scanned once; drives both the coverage report
  // and a definition's reverse view.
  const refMap = useMemo(() => collectTraitReferences(content), [content]);
  const orphans = useMemo(() => orphanTraitReferences(refMap, catalog), [refMap, catalog]);

  const sorted = useMemo(
    () =>
      catalog
        .slice()
        .sort((a, b) =>
          String(a.name || a.id).toLowerCase().localeCompare(String(b.name || b.id).toLowerCase())
        ),
    [catalog]
  );

  return (
    <div className="gm-traits">
      <TraitCoverage orphans={orphans} />
      <PageEditorShell
        entries={sorted}
        nameOf={(t) => t.name}
        noun="trait"
        addLabel="+ New trait"
        filterEntry={(t, q) =>
          [t.name, t.id, t.description]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        }
        renderDetail={(entry, isNew, callbacks) => (
          <TraitForm
            initial={isNew ? blankTrait() : toForm(entry)}
            isNew={isNew}
            existingIds={existingIds}
            references={isNew ? [] : refMap.get(normalizeTraitName(entry.name))?.refs ?? []}
            {...callbacks}
          />
        )}
      />
    </div>
  );
};

export default GmTraits;
