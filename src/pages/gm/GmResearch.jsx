import React, { useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import { useGmEntryForm } from '../../hooks/useGmEntryForm';
import GmEntryDialogs from '../../components/gm/GmEntryDialogs';
import PageEditorShell from '../../components/gm/PageEditorShell';
import './gm.css';

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
};

const blankCheck = () => ({ skill: '', dc: 0 });
const blankSource = () => ({ name: '', note: '', costNote: '', maxRp: 0, checks: [] });
const blankUnlock = () => ({ rp: 0, text: '', loreId: '' });
const blankResearch = () => ({
  title: '',
  level: 0,
  traits: '',
  description: '',
  reward: '',
  sources: [],
  unlocks: [],
});

// Doc -> form. Traits arrive as an array, edited as a comma-separated string
// (same codec every catalog editor uses — see GmItems/GmSpells `toForm`).
// Nested source/unlock rows are shallow-cloned onto their blanks so a doc
// missing a newer optional field (costNote, loreId) still renders cleanly.
const toForm = (r) => ({
  ...blankResearch(),
  ...r,
  level: r.level != null ? r.level : 0,
  traits: Array.isArray(r.traits) ? r.traits.join(', ') : '',
  reward: r.reward != null ? String(r.reward) : '',
  sources: Array.isArray(r.sources)
    ? r.sources.map((s) => ({
        ...blankSource(),
        ...s,
        checks: Array.isArray(s.checks) ? s.checks.map((c) => ({ ...blankCheck(), ...c })) : [],
      }))
    : [],
  unlocks: Array.isArray(r.unlocks) ? r.unlocks.map((u) => ({ ...blankUnlock(), ...u })) : [],
});

// Form -> doc. Throws Error with a GM-readable message on invalid input (the
// documented useGmEntryForm contract — see src/hooks/useGmEntryForm.js).
const fromForm = (f) => {
  if (!f.title.trim()) throw new Error('Title is required.');
  const out = {
    title: f.title.trim(),
    level: toInt(f.level),
    traits: f.traits.split(',').map((t) => t.trim()).filter(Boolean),
    description: f.description || '',
    sources: (f.sources || []).map((s) => {
      const source = { name: s.name || '', note: s.note || '', maxRp: toInt(s.maxRp) };
      if (s.costNote && s.costNote.trim()) source.costNote = s.costNote.trim();
      source.checks = (s.checks || []).map((c) => ({ skill: c.skill || '', dc: toInt(c.dc) }));
      return source;
    }),
    // Unlocks are meant to be read in RP order, so enforce it on save
    // regardless of authoring order.
    unlocks: (f.unlocks || [])
      .map((u) => {
        const unlock = { rp: toInt(u.rp), text: u.text || '' };
        if (u.loreId && u.loreId.trim()) unlock.loreId = u.loreId.trim();
        return unlock;
      })
      .sort((a, b) => a.rp - b.rp),
  };
  if (f.reward && f.reward.trim()) out.reward = f.reward.trim();
  return out;
};

const ResearchForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
  const [r, setR] = useState(initial);
  const form = useGmEntryForm({ collection: 'research', isNew, existingIds, onSaved });

  const set = (patch) => setR((cur) => ({ ...cur, ...patch }));

  const setSource = (i, patch) =>
    setR((cur) => ({
      ...cur,
      sources: cur.sources.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    }));
  const addSource = () => setR((cur) => ({ ...cur, sources: [...(cur.sources || []), blankSource()] }));
  const removeSource = (i) =>
    setR((cur) => ({ ...cur, sources: cur.sources.filter((_, idx) => idx !== i) }));

  const setCheck = (si, ci, patch) =>
    setR((cur) => ({
      ...cur,
      sources: cur.sources.map((s, idx) =>
        idx === si
          ? { ...s, checks: s.checks.map((c, cidx) => (cidx === ci ? { ...c, ...patch } : c)) }
          : s
      ),
    }));
  const addCheck = (si) =>
    setR((cur) => ({
      ...cur,
      sources: cur.sources.map((s, idx) =>
        idx === si ? { ...s, checks: [...(s.checks || []), blankCheck()] } : s
      ),
    }));
  const removeCheck = (si, ci) =>
    setR((cur) => ({
      ...cur,
      sources: cur.sources.map((s, idx) =>
        idx === si ? { ...s, checks: s.checks.filter((_, cidx) => cidx !== ci) } : s
      ),
    }));

  const setUnlock = (i, patch) =>
    setR((cur) => ({
      ...cur,
      unlocks: cur.unlocks.map((u, idx) => (idx === i ? { ...u, ...patch } : u)),
    }));
  const addUnlock = () => setR((cur) => ({ ...cur, unlocks: [...(cur.unlocks || []), blankUnlock()] }));
  const removeUnlock = (i) =>
    setR((cur) => ({ ...cur, unlocks: cur.unlocks.filter((_, idx) => idx !== i) }));

  const save = async () => {
    let body;
    try {
      body = fromForm(r);
    } catch (err) {
      form.setError(err.message);
      return;
    }
    const id = r.id || slugify(body.title);
    await form.save(id, { ...body, id });
  };

  return (
    <div className="gm-card" data-testid={`research-form-${r.id || 'new'}`}>
      <div className="gm-row">
        <div className="form-group">
          <label>Title</label>
          <input aria-label="title" value={r.title} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Level</label>
          <input
            aria-label="level"
            type="number"
            value={r.level}
            onChange={(e) => set({ level: e.target.value })}
          />
        </div>
      </div>
      <div className="form-group">
        <label>Traits (comma-separated)</label>
        <input aria-label="traits" value={r.traits} onChange={(e) => set({ traits: e.target.value })} />
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea
          aria-label="description"
          rows={3}
          value={r.description || ''}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label>Reward (optional)</label>
        <input aria-label="reward" value={r.reward || ''} onChange={(e) => set({ reward: e.target.value })} />
      </div>

      <div className="form-group">
        <label>Sources</label>
        {(r.sources || []).map((s, i) => (
          <div key={i} className="gm-card gm-source-card" data-testid={`research-source-${i}`}>
            <div className="gm-row">
              <div className="form-group">
                <label>Name</label>
                <input
                  aria-label={`source-${i}-name`}
                  value={s.name}
                  onChange={(e) => setSource(i, { name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Max RP</label>
                <input
                  aria-label={`source-${i}-maxRp`}
                  type="number"
                  value={s.maxRp}
                  onChange={(e) => setSource(i, { maxRp: e.target.value })}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Note</label>
              <textarea
                aria-label={`source-${i}-note`}
                rows={2}
                value={s.note}
                onChange={(e) => setSource(i, { note: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Cost note (optional)</label>
              <input
                aria-label={`source-${i}-costNote`}
                value={s.costNote || ''}
                onChange={(e) => setSource(i, { costNote: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Checks</label>
              {(s.checks || []).map((c, ci) => (
                <div key={ci} className="gm-row gm-check-row" data-testid={`research-check-${i}-${ci}`}>
                  <input
                    aria-label={`source-${i}-check-${ci}-skill`}
                    placeholder="Skill"
                    value={c.skill}
                    onChange={(e) => setCheck(i, ci, { skill: e.target.value })}
                  />
                  <input
                    aria-label={`source-${i}-check-${ci}-dc`}
                    type="number"
                    placeholder="DC"
                    value={c.dc}
                    onChange={(e) => setCheck(i, ci, { dc: e.target.value })}
                  />
                  <button className="btn-small btn-danger" onClick={() => removeCheck(i, ci)}>
                    Remove
                  </button>
                </div>
              ))}
              <button className="btn-small btn-secondary" onClick={() => addCheck(i)}>
                Add check
              </button>
            </div>
            <button className="btn-small btn-danger" onClick={() => removeSource(i)}>
              Remove source
            </button>
          </div>
        ))}
        <button className="btn-small btn-secondary" onClick={addSource}>
          Add source
        </button>
      </div>

      <div className="form-group">
        <label>Unlocks</label>
        {(r.unlocks || []).map((u, i) => (
          <div key={i} className="gm-card gm-unlock-card" data-testid={`research-unlock-${i}`}>
            <div className="form-group">
              <label>RP</label>
              <input
                aria-label={`unlock-${i}-rp`}
                type="number"
                value={u.rp}
                onChange={(e) => setUnlock(i, { rp: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Text</label>
              <textarea
                aria-label={`unlock-${i}-text`}
                rows={2}
                value={u.text}
                onChange={(e) => setUnlock(i, { text: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Lore id (optional)</label>
              <input
                aria-label={`unlock-${i}-loreId`}
                value={u.loreId || ''}
                onChange={(e) => setUnlock(i, { loreId: e.target.value })}
              />
              <p className="gm-hint">Id of a Lore entry to auto-reveal when this unlock is reached.</p>
            </div>
            <button className="btn-small btn-danger" onClick={() => removeUnlock(i)}>
              Remove unlock
            </button>
          </div>
        ))}
        <button className="btn-small btn-secondary" onClick={addUnlock}>
          Add unlock
        </button>
      </div>

      {form.error && <p className="gm-warn" role="alert">{form.error}</p>}
      <div className="gm-actions">
        <button className="btn-primary" disabled={form.busy} onClick={save}>
          {isNew ? 'Create topic' : 'Save'}
        </button>
        {!isNew && (
          <>
            <button className="btn-secondary" disabled={form.busy} onClick={() => form.setShowHistory(true)}>
              History
            </button>
            <button className="btn-danger" disabled={form.busy} onClick={form.requestDelete}>
              Delete
            </button>
          </>
        )}
      </div>

      <GmEntryDialogs
        form={form}
        collection="research"
        noun="topic"
        id={r.id}
        name={r.title}
        isNew={isNew}
        deleteMessage={`Permanently delete the research topic "${r.title}". This cannot be undone — restore it from History if you have it.`}
        onRestored={(doc) => {
          if (doc) setR(toForm(doc));
          onRestored();
        }}
      />
    </div>
  );
};

// World → Research: master/detail editor for the GMG Research Topics
// collection (#1839, epic #206). Capture-only, live-DO-only like rooms/events
// (#1074/#1112) — tier text is verbatim Paizo adventure prose, so there is no
// bundled seed and no "showing bundled defaults" fallback state to show; the
// list is simply empty until the GM authors the first topic here.
const GmResearch = () => {
  const { researchTopics } = useContent();
  const topics = Array.isArray(researchTopics) ? researchTopics : [];
  const existingIds = existingIdSet(topics);

  return (
    <div className="gm-research">
      <PageEditorShell
        entries={topics}
        nameOf={(t) => t.title}
        noun="topic"
        addLabel="+ New topic"
        renderDetail={(entry, isNew, callbacks) => (
          <ResearchForm
            initial={isNew ? blankResearch() : toForm(entry)}
            isNew={isNew}
            existingIds={existingIds}
            {...callbacks}
          />
        )}
      />
    </div>
  );
};

export default GmResearch;
