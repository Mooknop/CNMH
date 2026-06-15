import React, { useEffect, useState } from 'react';
import Modal from '../shared/Modal';
import ConfirmDialog from '../shared/ConfirmDialog';
import { auditImages, sweepImages } from '../../utils/gmApi';
import './ImageReclaimModal.css';

// "Reclaim unused" for GM Tools → Images (#399). Shows the dry-run audit report
// in three buckets, lets the GM review/deselect, then sweeps the selection. The
// server re-validates each id at delete time, so a stale selection never reaps a
// now-referenced image.

const BUCKETS = [
  {
    key: 'unreferenced',
    label: 'Unreferenced',
    help: 'Stored image with a catalog entry that nothing references.',
  },
  {
    key: 'bytesWithoutCatalog',
    label: 'Orphaned bytes (no catalog entry)',
    help: 'An R2 object with no catalog row — usually a partial upload.',
  },
  {
    key: 'catalogWithoutBytes',
    label: 'Stale catalog rows (bytes gone)',
    help: 'A catalog entry whose image bytes are already deleted.',
  },
];

const formatBytes = (n) => {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const collectIds = (report) => {
  const ids = new Set();
  for (const b of BUCKETS) for (const o of report[b.key] || []) ids.add(o.id);
  return ids;
};

const ImageReclaimModal = ({ isOpen, onClose, onDone }) => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  // (Re)scan whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReport(null);
    setResult(null);
    auditImages()
      .then((rep) => {
        if (cancelled) return;
        setReport(rep);
        setSelected(collectIds(rep)); // default: every orphan selected
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Audit failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen]);

  const toggle = (id) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleBucket = (items, allSelected) => setSelected((cur) => {
    const next = new Set(cur);
    items.forEach((o) => (allSelected ? next.delete(o.id) : next.add(o.id)));
    return next;
  });

  const totalOrphans = report
    ? BUCKETS.reduce((n, b) => n + (report[b.key]?.length || 0), 0)
    : 0;

  const doSweep = async () => {
    setConfirm(false);
    setBusy(true);
    setError(null);
    try {
      const res = await sweepImages([...selected]);
      setResult(res);
      onDone?.(res);
      const rep = await auditImages(); // refresh to reflect what's left
      setReport(rep);
      setSelected(collectIds(rep));
    } catch (err) {
      setError(err.message || 'Sweep failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reclaim unused images" maxWidth="640px">
      {loading && <p className="gm-hint">Scanning R2 + catalog…</p>}
      {error && <p className="gm-warn" role="alert">{error}</p>}

      {result && (
        <p className="gm-ok" role="status">
          Reclaimed {result.reclaimed.length} image{result.reclaimed.length !== 1 ? 's' : ''}
          {result.skipped.length > 0
            ? `, skipped ${result.skipped.length} (no longer orphaned)`
            : ''}.
        </p>
      )}

      {report && !loading && (
        <>
          <p className="gm-count">
            {report.totalR2} object{report.totalR2 !== 1 ? 's' : ''} in R2 · {report.referencedCount} referenced · grace window {report.graceWindowHours}h
          </p>

          {totalOrphans === 0 ? (
            <p className="gm-hint">No orphaned images found. Nothing to reclaim.</p>
          ) : (
            <>
              {BUCKETS.map((b) => {
                const items = report[b.key] || [];
                if (items.length === 0) return null;
                const allSelected = items.every((o) => selected.has(o.id));
                return (
                  <section key={b.key} className="reclaim-bucket" data-testid={`reclaim-bucket-${b.key}`}>
                    <label className="reclaim-check reclaim-bucket-head">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        aria-label={`select all ${b.key}`}
                        onChange={() => toggleBucket(items, allSelected)}
                      />
                      <span className="reclaim-bucket-label">{b.label} ({items.length})</span>
                    </label>
                    <p className="reclaim-bucket-help">{b.help}</p>
                    <ul className="reclaim-list">
                      {items.map((o) => (
                        <li key={o.id} className="reclaim-item">
                          <label className="reclaim-check">
                            <input
                              type="checkbox"
                              checked={selected.has(o.id)}
                              aria-label={`select ${o.id}`}
                              onChange={() => toggle(o.id)}
                            />
                            <span className="reclaim-item-name">{o.name || o.id}</span>
                            {o.size != null && <span className="reclaim-item-size">{formatBytes(o.size)}</span>}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}

              <div className="gm-actions">
                <button
                  className="btn-danger"
                  disabled={busy || selected.size === 0}
                  onClick={() => setConfirm(true)}
                >
                  {busy ? 'Reclaiming…' : `Reclaim ${selected.size} selected`}
                </button>
              </div>
            </>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={confirm}
        title="Reclaim images"
        message={`Permanently delete ${selected.size} selected image${selected.size !== 1 ? 's' : ''} (bytes and/or catalog entries). This cannot be undone.`}
        confirmLabel="Reclaim"
        onConfirm={doSweep}
        onCancel={() => setConfirm(false)}
      />
    </Modal>
  );
};

export default ImageReclaimModal;
