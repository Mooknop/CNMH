import React, { useCallback, useEffect, useState } from 'react';
import Modal from '../shared/Modal';
import ConfirmDialog from '../shared/ConfirmDialog';
import { fetchHistory, restoreVersion } from '../../utils/gmApi';

// Per-entity version browser. Lists the bounded history the Durable Object
// keeps (newest first) and restores a chosen version. Restore goes behind the
// same typed ConfirmDialog as deletes — restoring overwrites the live entry —
// but the server archives the current state first, so it's reversible.

const fmt = (ms) => {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? String(ms) : d.toLocaleString();
};

const preview = (data) => {
  if (data == null) return '(unreadable version)';
  const s = JSON.stringify(data);
  return s.length > 220 ? `${s.slice(0, 220)}…` : s;
};

const HistoryModal = ({ isOpen, collection, id, name, onClose, onRestored }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [versions, setVersions] = useState([]);
  const [pending, setPending] = useState(null); // version awaiting typed confirm
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchHistory(collection, id)
      .then((res) => setVersions(Array.isArray(res.history) ? res.history : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [collection, id]);

  useEffect(() => {
    if (isOpen && id) {
      load();
    } else if (!isOpen) {
      setVersions([]);
      setError(null);
      setPending(null);
    }
  }, [isOpen, id, load]);

  const doRestore = async () => {
    const v = pending;
    setPending(null);
    setBusy(true);
    setError(null);
    try {
      await restoreVersion(collection, id, v.archived_at);
      // Hand the restored document back so the editing form can re-seed its
      // fields immediately — the live socket update alone won't, because forms
      // intentionally don't re-sync from props mid-edit.
      onRestored(v.data);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={`History — ${name}`} maxWidth="680px" highZ>
        {loading && <p className="gm-count">Loading…</p>}
        {error && <p className="gm-warn" role="alert">{error}</p>}
        {!loading && !error && versions.length === 0 && (
          <p className="gm-count">
            No saved versions yet. A version is captured automatically each time
            this entry is saved or deleted (newest {5} kept).
          </p>
        )}
        {versions.map((v) => (
          <div className="gm-card" data-testid={`version-${v.archived_at}`} key={v.archived_at}>
            <div className="gm-history-head">
              <strong>{fmt(v.archived_at)}</strong>
              <button
                className="btn-small btn-secondary"
                disabled={busy}
                onClick={() => setPending(v)}
              >
                Restore this version
              </button>
            </div>
            <pre className="gm-json gm-history-preview">{preview(v.data)}</pre>
          </div>
        ))}
      </Modal>

      <ConfirmDialog
        isOpen={!!pending}
        title="Restore this version"
        message={`Replace the current “${name}” with the version from ${
          pending ? fmt(pending.archived_at) : ''
        }. The current state is archived first, so this is reversible.`}
        confirmLabel="Restore"
        requireType={name}
        onConfirm={doRestore}
        onCancel={() => setPending(null)}
      />
    </>
  );
};

export default HistoryModal;
