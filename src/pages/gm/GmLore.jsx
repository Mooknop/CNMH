import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useLore } from '../../contexts/LoreContext';
import { saveDocument } from '../../utils/gmApi';
import { buildBacklinkMap, getConnectionData, buildChildrenMap, getAncestors, getChildren } from '../../utils/loreUtils';
import PageEditorShell from '../../components/gm/PageEditorShell';
import LoreMarkdown from '../../components/shared/LoreMarkdown';
import LoreBulkPanel from './LoreBulkPanel';
import './gm.css';

// Lore content is authored in the Obsidian vault (lore-vault/) and synced to the
// DO — the app never edits it. This page is a reveal manager: a read-only preview
// of exactly what players see, plus one-tap reveal/hide (the one thing that must
// stay live at the table). See epic #285.

const ILLEGAL_FILENAME = /[\\/:*?"<>|]/g;
const vaultPathFor = (entry) => {
  const cat = (entry.category && String(entry.category).trim()) || 'Uncategorized';
  const file = String(entry.title || entry.id || 'untitled').replace(ILLEGAL_FILENAME, ' ').replace(/\s+/g, ' ').trim();
  return `lore-vault/${cat}/${file}.md`;
};

const ConnectionGroup = ({ label, byCategory }) => {
  const cats = Object.keys(byCategory).sort();
  if (cats.length === 0) return null;
  return (
    <div className="gm-lore-preview-conn">
      <p className="gm-lore-preview-conn-label">{label}</p>
      {cats.map((cat) => (
        <p key={cat} className="gm-lore-preview-conn-line">
          <span className="gm-lore-preview-conn-cat">{cat}:</span>{' '}
          {byCategory[cat].map((r) => r.title).join(', ')}
        </p>
      ))}
    </div>
  );
};

const LoreDetail = ({ entry, allEntries, onSaved }) => {
  const { openLore } = useLore();
  // Optimistic reveal state, reseeded when the shell remounts the pane per entry.
  const [vis, setVis] = useState(entry.visibility === 'revealed' ? 'revealed' : 'gm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const backlinkMap = useMemo(() => buildBacklinkMap(allEntries), [allEntries]);
  const { outgoingByCategory = {}, incomingByCategory = {} } = useMemo(
    () => getConnectionData(entry, allEntries, backlinkMap),
    [entry, allEntries, backlinkMap]
  );
  const hasConnections =
    Object.keys(outgoingByCategory).length > 0 || Object.keys(incomingByCategory).length > 0;

  const ancestors = useMemo(() => getAncestors(entry, allEntries), [entry, allEntries]);
  const childrenMap = useMemo(() => buildChildrenMap(allEntries), [allEntries]);
  const children = getChildren(entry, childrenMap);

  const revealed = vis === 'revealed';

  // One-tap reveal/hide. Spread the full live doc and change ONLY visibility so
  // every vault-authored field (incl. dateArStart/End, tags) is preserved — the
  // push must never see this as a content change.
  const toggleVisibility = async () => {
    const next = revealed ? 'gm' : 'revealed';
    setVis(next);
    setBusy(true);
    setError(null);
    try {
      await saveDocument('lore', entry.id, { ...entry, visibility: next });
      onSaved(false);
    } catch (err) {
      setVis(revealed ? 'revealed' : 'gm');
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-card gm-lore-preview" data-testid={`lore-detail-${entry.id}`}>
      <div className="gm-lore-preview-head">
        <h2 className="gm-lore-preview-title">
          <span
            className={`gm-lore-dot${revealed ? ' revealed' : ''}`}
            title={revealed ? 'Revealed to players' : 'GM only'}
            aria-hidden="true"
          />
          {entry.title}
        </h2>
        <span className="gm-lore-preview-category">{entry.category}</span>
      </div>

      {entry.image && (
        <img
          src={`/api/images/${entry.image}`}
          alt=""
          className="entity-image"
          style={
            entry.imagePosition
              ? { objectPosition: `${entry.imagePosition.x}% ${entry.imagePosition.y}%` }
              : undefined
          }
        />
      )}

      {(ancestors.length > 0 || children.length > 0) && (
        <p className="gm-lore-preview-conn-line">
          {ancestors.length > 0 && (
            <>
              <span className="gm-lore-preview-conn-cat">In:</span>{' '}
              {ancestors.map((a) => a.title).join(' › ')}
            </>
          )}
          {ancestors.length > 0 && children.length > 0 && <br />}
          {children.length > 0 && (
            <>
              <span className="gm-lore-preview-conn-cat">Contains:</span>{' '}
              {children.map((c) => c.title).join(', ')}
            </>
          )}
        </p>
      )}

      {entry.summary && <p className="gm-lore-preview-summary">{entry.summary}</p>}

      <div className="gm-lore-preview-body">
        <LoreMarkdown content={entry.content || ''} entries={allEntries} onNavigate={openLore} />
      </div>

      {hasConnections && (
        <div className="gm-lore-preview-connections">
          <ConnectionGroup label="Connections" byCategory={outgoingByCategory} />
          <ConnectionGroup label="Referenced By" byCategory={incomingByCategory} />
        </div>
      )}

      {error && (
        <p className="gm-warn" role="alert">
          {error}
        </p>
      )}

      <div className="gm-actions">
        <button className="btn-primary" disabled={busy} onClick={toggleVisibility}>
          {revealed ? 'Hide from players' : 'Reveal to players'}
        </button>
      </div>

      <p className="gm-lore-preview-note gm-count">
        Edit this entry in Obsidian — <code>{vaultPathFor(entry)}</code>
      </p>
    </div>
  );
};

// Category is required by the vault, but be defensive about legacy/blank rows.
const categoryOf = (e) => (e.category && String(e.category).trim()) || 'Uncategorized';

// List row: reveal-state dot + title. The dot is decorative metadata —
// aria-hidden keeps the button's accessible name as just the title (+ a
// screen-reader "Revealed" flag).
const LoreRow = ({ entry }) => {
  const revealed = entry.visibility === 'revealed';
  return (
    <span className="gm-lore-row-title">
      <span
        className={`gm-lore-dot${revealed ? ' revealed' : ''}`}
        title={revealed ? 'Revealed to players' : 'GM only'}
        aria-hidden="true"
      />
      {entry.title}
      {revealed && <span className="gm-visually-hidden">Revealed</span>}
    </span>
  );
};

const GmLore = () => {
  // The GM editor sees everything; `loreEntries` is the player-visible subset.
  const { allLoreEntries } = useContent();
  const entries = useMemo(() => {
    const list = Array.isArray(allLoreEntries) ? [...allLoreEntries] : [];
    // Sorted by category then title so the All tab's group headers are contiguous.
    return list.sort(
      (a, b) =>
        categoryOf(a).localeCompare(categoryOf(b)) ||
        String(a.title || '').localeCompare(String(b.title || ''))
    );
  }, [allLoreEntries]);
  const [tab, setTab] = useState('All');

  const tabs = useMemo(
    () => ['All', ...Array.from(new Set(entries.map(categoryOf))).sort()],
    [entries]
  );
  // A removed/renamed category could leave `tab` dangling; fall back to All.
  const activeTab = tabs.includes(tab) ? tab : 'All';

  const inTab = useMemo(
    () => (activeTab === 'All' ? entries : entries.filter((e) => categoryOf(e) === activeTab)),
    [entries, activeTab]
  );

  const header = (
    <nav className="gm-nav" aria-label="lore categories">
      {tabs.map((t) => (
        <button
          key={t}
          className={`gm-nav-link ${t === activeTab ? 'active' : ''}`}
          aria-pressed={t === activeTab}
          onClick={() => setTab(t)}
        >
          {t}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="gm-lore">
      <PageEditorShell
        entries={inTab}
        nameOf={(e) => <LoreRow entry={e} />}
        noun="entry"
        allowNew={false}
        header={header}
        groupOf={activeTab === 'All' ? categoryOf : undefined}
        filterEntry={(e, q) =>
          [e.title, e.category, e.id]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        }
        emptyHint="Select an entry to preview it and control reveal."
        renderDetail={(entry, _isNew, { onSaved }) => (
          <LoreDetail entry={entry} allEntries={entries} onSaved={onSaved} />
        )}
        renderBulkPanel={(selected, { onSaved }) => (
          <LoreBulkPanel entries={selected} onSaved={onSaved} />
        )}
      />
    </div>
  );
};

export default GmLore;
