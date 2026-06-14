import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import ConfirmDialog from '../shared/ConfirmDialog';

// Shared Bestiary override editor. Used by:
//   - GmDashboard quick-action modal (encounter mode)
//   - GmMonsters catalog page (/gm/catalog/monsters)
//
// List = union of seen enemies (deduped by creatureKey) + existing override rows.
// Only creatures with a non-null creatureKey appear (null-key creatures have no
// stable id to override and behave as today in BestiaryModal).
//
// Per-entry stored shape: { id: creatureKey, name, descriptionOverride,
//   bestiary, defenses, capturedAt, lastSeenAt }. This editor only owns name +
// descriptionOverride; the stat block is captured by BestiaryCaptureSync (#332)
// and preserved here on save. An empty descriptionOverride means the GM chose to
// redact entirely.

const MonsterForm = ({ entry, onSaved }) => {
  const { importedDescription, creatureKey, name } = entry;
  const override = entry.override || null;

  const [descriptionOverride, setDescriptionOverride] = useState(
    override?.descriptionOverride ?? ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(false);

  const isDirty =
    descriptionOverride !== (override?.descriptionOverride ?? '');

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      // Spread the existing doc so a description edit never clobbers the
      // captured stat block (bestiary/defenses/capturedAt/lastSeenAt) the
      // BestiaryCaptureSync writer persists (#332).
      await saveDocument('monster', creatureKey, {
        ...(override || {}),
        id: creatureKey,
        name,
        descriptionOverride,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const doRevert = async () => {
    setConfirm(false);
    setBusy(true);
    setError(null);
    try {
      await deleteDocument('monster', creatureKey);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-card" data-testid={`monster-form-${creatureKey}`}>
      <p className="gm-count">Creature key: {creatureKey}</p>

      {importedDescription ? (
        <div className="form-group">
          <label>Imported description (read-only)</label>
          <p className="gm-hint be-imported-desc">{importedDescription}</p>
        </div>
      ) : (
        <p className="gm-hint">No imported description for this creature.</p>
      )}

      <div className="form-group">
        <label>Description override</label>
        <p className="gm-hint">
          Replaces the imported description in the player Bestiary. Leave blank to
          redact entirely (players see nothing even when revealed).
        </p>
        <textarea
          aria-label="description-override"
          rows={5}
          value={descriptionOverride}
          onChange={(e) => setDescriptionOverride(e.target.value)}
        />
      </div>

      {error && (
        <p className="gm-warn" role="alert">
          {error}
        </p>
      )}

      <div className="gm-actions">
        <button
          className="btn-primary"
          disabled={busy || !isDirty}
          onClick={save}
        >
          Save
        </button>
        {override && (
          <button
            className="btn-danger"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            Revert to imported
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirm}
        title="Revert to imported description?"
        message={`Remove the override for "${name}". The player Bestiary will show the original imported text again.`}
        confirmLabel="Revert"
        onConfirm={doRevert}
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

  // Build the unified list: seen enemies (with creatureKey) + orphaned override rows.
  const entries = useMemo(() => {
    const map = new Map();

    // Seen enemies from the current encounter order.
    // Only creatures with a stable creatureKey are editable — entryIds are
    // per-session and cannot be used as a persistent override key.
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
          override: null,
        });
      }
    }

    // Existing override rows (may include creatures from past encounters).
    for (const m of monsters) {
      const key = m.id;
      if (!key) continue;
      if (map.has(key)) {
        map.get(key).override = m;
      } else {
        map.set(key, {
          creatureKey: key,
          name: m.name || key,
          importedDescription: '',
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
                    <span className="gm-ct" title="Has override">●</span>
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
            />
          ) : (
            <p className="gm-count gm-ped-hint">
              Select a creature to edit its description.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BestiaryEditor;
