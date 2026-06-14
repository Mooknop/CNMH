import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import { useRecallKnowledge } from '../../hooks/useRecallKnowledge';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import {
  defaultRecord,
  fullyRevealedRecord,
  setRecordFieldRevealed,
  isPathRevealed,
  REVEAL_FIELDS,
} from '../../utils/recallKnowledge';
import { monsterToEnemy, monsterLocations, formatLastSeen } from '../../utils/bestiary';
import BestiaryEntry from '../bestiary/BestiaryEntry';
import ConfirmDialog from '../shared/ConfirmDialog';
import './BestiaryEditor.css';

// GM Bestiary editor. Used by:
//   - GmDashboard quick-action modal (encounter mode)
//   - GmMonsters catalog page (/gm/catalog/monsters)
//
// List = union of seen enemies (deduped by creatureKey) + persisted monster docs.
// Only creatures with a non-null creatureKey appear (null-key creatures have no
// stable id and behave as today in BestiaryModal).
//
// Per-entry stored shape: { id: creatureKey, name, descriptionOverride?,
//   bestiary, defenses, capturedAt, lastSeenAt, locations }. The captured stat
// block is owned by BestiaryCaptureSync (#332) and preserved on save; this editor
// owns the display name + descriptionOverride and curates per-field visibility
// (the shared cnmh_knowledge_global record) for the player Bestiary (#335).

// descriptionOverride tri-state: absent → imported text; '' → redacted; text → custom.
const descModeOf = (override) => {
  if (!override || override.descriptionOverride === undefined) return 'imported';
  if (override.descriptionOverride === '') return 'redacted';
  return 'custom';
};

const MonsterForm = ({ entry, onSaved, onDeleted }) => {
  const { importedDescription, creatureKey, name: seenName, override } = entry;
  const { recordFor, mergeRecord } = useRecallKnowledge();
  const record = recordFor(creatureKey);

  const [name, setName] = useState(override?.name || seenName || creatureKey);
  const [descMode, setDescMode] = useState(descModeOf(override));
  const [customText, setCustomText] = useState(
    override?.descriptionOverride && override.descriptionOverride !== '' ? override.descriptionOverride : ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(false);

  const origMode = descModeOf(override);
  const origCustom = override?.descriptionOverride && override.descriptionOverride !== '' ? override.descriptionOverride : '';
  const isDirty =
    name !== (override?.name || seenName || creatureKey) ||
    descMode !== origMode ||
    (descMode === 'custom' && customText !== origCustom);

  // Preview enemy: prefer the persisted doc (has stats), else the encounter entry.
  const previewDoc = override || { id: creatureKey, name, bestiary: entry.bestiary, defenses: entry.defenses };
  const previewEnemy = monsterToEnemy(previewDoc);
  const locations = monsterLocations(override || {});

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      // Spread the existing doc so name/description edits never clobber captured
      // stats, locations, or timestamps (#332).
      const doc = { ...(override || {}), id: creatureKey, name };
      if (descMode === 'imported') {
        delete doc.descriptionOverride; // fall back to the imported bestiary text
      } else if (descMode === 'redacted') {
        doc.descriptionOverride = '';
      } else {
        doc.descriptionOverride = customText;
      }
      await saveDocument('monster', creatureKey, doc);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setConfirm(false);
    setBusy(true);
    setError(null);
    try {
      await deleteDocument('monster', creatureKey);
      // Forget what the party learned so a re-encounter starts clean.
      mergeRecord(creatureKey, defaultRecord());
      onDeleted();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleField = (key, value) =>
    mergeRecord(creatureKey, (prev) => setRecordFieldRevealed(prev, key, value));
  const revealAll = () => mergeRecord(creatureKey, fullyRevealedRecord(record));
  const refog = () => mergeRecord(creatureKey, { ...defaultRecord(), history: record.history || [] });

  return (
    <div className="gm-card" data-testid={`monster-form-${creatureKey}`}>
      {/* Header / provenance */}
      <div className="form-group">
        <label htmlFor={`be-name-${creatureKey}`}>Display name</label>
        <input
          id={`be-name-${creatureKey}`}
          aria-label="display-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <p className="gm-count">Creature key: {creatureKey}</p>
      <p className="gm-hint be-provenance" data-testid="be-provenance">
        {override?.capturedAt && <>Captured {formatLastSeen(override.capturedAt)}</>}
        {override?.lastSeenAt && <> · Last seen {formatLastSeen(override.lastSeenAt)}</>}
        {locations.length > 0 && <> · Encountered at {locations.map((l) => l.name).join(', ')}</>}
      </p>

      {/* Captured stats preview — exactly what a fully-revealed player sees. */}
      <div className="form-group">
        <label>Captured stats (preview)</label>
        <div className="be-preview">
          <BestiaryEntry enemy={previewEnemy} record={record} revealAll />
        </div>
      </div>

      {/* Description in the player bestiary */}
      <div className="form-group">
        <label htmlFor={`be-descmode-${creatureKey}`}>Description in player Bestiary</label>
        {importedDescription ? (
          <p className="gm-hint be-imported-desc">Imported: {importedDescription}</p>
        ) : (
          <p className="gm-hint">No imported description for this creature.</p>
        )}
        <select
          id={`be-descmode-${creatureKey}`}
          aria-label="description-mode"
          value={descMode}
          onChange={(e) => setDescMode(e.target.value)}
        >
          <option value="imported">Imported (show original text)</option>
          <option value="custom">Custom (rewrite the text)</option>
          <option value="redacted">Redacted (show nothing)</option>
        </select>
        {descMode === 'custom' && (
          <textarea
            aria-label="description-override"
            rows={5}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
          />
        )}
      </div>

      {/* Per-field visibility — live writes to the shared learned-knowledge record. */}
      <div className="form-group">
        <label>Player visibility (applies live)</label>
        <p className="gm-hint">
          Force-reveal or redact individual fields for every player. This is the same learned state
          used in the in-combat Bestiary.
        </p>
        <div className="be-toggle-grid" data-testid="be-toggle-grid">
          {REVEAL_FIELDS.map((f) => (
            <label key={f.key} className="be-toggle">
              <input
                type="checkbox"
                aria-label={`reveal-${f.key}`}
                checked={isPathRevealed(record, f.key)}
                onChange={(e) => toggleField(f.key, e.target.checked)}
              />
              {f.label}
            </label>
          ))}
        </div>
        <div className="gm-actions be-bulk">
          <button type="button" className="btn-secondary" onClick={revealAll}>Reveal all</button>
          <button type="button" className="btn-secondary" onClick={refog}>Re-fog (reset)</button>
        </div>
      </div>

      {error && (
        <p className="gm-warn" role="alert">{error}</p>
      )}

      <div className="gm-actions">
        <button className="btn-primary" disabled={busy || !isDirty} onClick={save}>
          Save
        </button>
        {override && (
          <button className="btn-danger" disabled={busy} onClick={() => setConfirm(true)}>
            Delete entry
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirm}
        title="Delete this bestiary entry?"
        message={`Remove "${name}" from the campaign bestiary, including its captured stats and learned reveals. It will be re-captured the next time the party fights it.`}
        confirmLabel="Delete"
        onConfirm={doDelete}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
};

const BestiaryEditor = () => {
  const { monsters } = useContent();
  const { encounter } = useEncounter();
  const [selectedKey, setSelectedKey] = useState(null);
  const [flash, setFlash] = useState(null);

  // Build the unified list: seen enemies (with creatureKey) + persisted docs.
  const entries = useMemo(() => {
    const map = new Map();

    // Seen enemies from the current encounter order. Only creatures with a stable
    // creatureKey are editable — entryIds are per-session.
    const order = encounter?.order || [];
    for (const e of order) {
      if (e.kind !== 'enemy') continue;
      const key = e.creatureKey;
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          creatureKey: key,
          name: e.name,
          importedDescription: e.bestiary?.description || '',
          bestiary: e.bestiary || null,
          defenses: e.defenses || null,
          override: null,
        });
      }
    }

    // Persisted monster docs (creatures from past encounters too).
    for (const m of monsters) {
      const key = m.id;
      if (!key) continue;
      if (map.has(key)) {
        const row = map.get(key);
        row.override = m;
        if (!row.importedDescription) row.importedDescription = m.bestiary?.description || '';
      } else {
        map.set(key, {
          creatureKey: key,
          name: m.name || key,
          importedDescription: m.bestiary?.description || '',
          bestiary: m.bestiary || null,
          defenses: m.defenses || null,
          override: m,
        });
      }
    }

    return [...map.values()].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
  }, [encounter, monsters]);

  const selectedEntry = entries.find((e) => e.creatureKey === selectedKey) || null;

  const onSaved = () => {
    setFlash('Saved. Changes are live for every connected player.');
  };
  const onDeleted = () => {
    setSelectedKey(null);
    setFlash('Entry deleted. The player Bestiary no longer lists this creature.');
  };

  if (entries.length === 0) {
    return (
      <div className="gm-ped">
        <p className="gm-count gm-ped-hint">
          No creatures yet — start a combat in Foundry to populate this list.
        </p>
      </div>
    );
  }

  return (
    <div className="gm-ped">
      {flash && (
        <p className="gm-live-note" role="status" data-testid="be-flash">
          <span className="dot" aria-hidden="true" />
          {flash}
        </p>
      )}
      <div className="gm-ped-body">
        <div className="gm-ped-master">
          <ul className="gm-ped-items" aria-label="monster list">
            {entries.map((e) => (
              <li key={e.creatureKey} className="gm-ped-row">
                <button
                  type="button"
                  className={`gm-ped-item${e.creatureKey === selectedKey ? ' active' : ''}`}
                  aria-pressed={e.creatureKey === selectedKey}
                  onClick={() => {
                    setSelectedKey(e.creatureKey);
                    setFlash(null);
                  }}
                >
                  {e.name}
                  {e.override && (
                    <span className="gm-ct" title="Persisted entry">●</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <p className="gm-count">
            {entries.length} creature{entries.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="gm-ped-detail">
          {selectedEntry ? (
            <MonsterForm
              key={selectedEntry.creatureKey}
              entry={selectedEntry}
              onSaved={onSaved}
              onDeleted={onDeleted}
            />
          ) : (
            <p className="gm-count gm-ped-hint">
              Select a creature to edit its bestiary entry.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BestiaryEditor;
