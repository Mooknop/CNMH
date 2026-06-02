import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContent } from '../../contexts/ContentContext';
import { seedDefaults, seedMissing, repointFocusSpellsToCatalog } from '../../utils/gmApi';
import { downloadBackup, restoreBackup } from '../../utils/gmBackup';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import './gm.css';

const GmDashboard = () => {
  const { source, rawCharacters } = useContent();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  // null | {kind:'reseed'} | {kind:'restore', file}
  const [confirm, setConfirm] = useState(null);
  const fileRef = useRef(null);

  const runSeed = async (force) => {
    setConfirm(null);
    setBusy(true);
    setMsg(null);
    try {
      const res = await seedDefaults(force);
      setMsg(`Done: ${JSON.stringify(res.seeded)}`);
    } catch (e) {
      setMsg(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const applyNewDefaults = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const seedRes = await seedMissing();
      const repointRes = await repointFocusSpellsToCatalog(rawCharacters);
      setMsg(
        `Done: ${JSON.stringify(seedRes.seeded)}` +
        (repointRes.repointed.length
          ? `; repointed focus spells: ${repointRes.repointed.join(', ')}`
          : '; focus spells already up to date')
      );
    } catch (e) {
      setMsg(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const doBackup = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await downloadBackup();
      setMsg('Backup downloaded.');
    } catch (e) {
      setMsg(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const onPickRestore = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) setConfirm({ kind: 'restore', file });
    if (fileRef.current) fileRef.current.value = ''; // allow re-picking the same file
  };

  const doRestore = async () => {
    const { file } = confirm;
    setConfirm(null);
    setBusy(true);
    setMsg(null);
    try {
      const res = await restoreBackup(file);
      setMsg(`Restored: ${JSON.stringify(res.seeded)}`);
    } catch (e) {
      setMsg(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-dashboard">
      <p>
        Content source:{' '}
        <strong className={source === 'server' ? 'gm-ok' : 'gm-warn'}>{source}</strong>
      </p>

      {source === 'fallback' && (
        <div className="gm-banner">
          The store is empty — the app is showing the bundled defaults. They’re
          imported automatically when you enter the GM area so edits persist and
          sync live; use the buttons below to re-run it manually if needed.
        </div>
      )}

      <div className="gm-actions">
        <button className="btn-primary" disabled={busy} onClick={() => runSeed(false)}>
          Import defaults (only empty collections)
        </button>
        <button className="btn-secondary" disabled={busy} onClick={applyNewDefaults}>
          Apply new defaults (non-destructive)
        </button>
        <button
          className="btn-danger"
          disabled={busy}
          onClick={() => setConfirm({ kind: 'reseed' })}
        >
          Force reseed (overwrite)
        </button>
      </div>

      <h2>Backup &amp; restore</h2>
      <p className="gm-count">
        Download a snapshot of all stored content before risky edits. Restoring
        overwrites every collection in the file — keep backups safe.
      </p>
      <div className="gm-actions">
        <button className="btn-secondary" disabled={busy} onClick={doBackup}>
          Download backup
        </button>
        <button
          className="btn-secondary"
          disabled={busy}
          onClick={() => fileRef.current && fileRef.current.click()}
        >
          Restore from backup…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-label="restore-file"
          style={{ display: 'none' }}
          onChange={onPickRestore}
        />
      </div>
      {msg && <pre className="gm-result">{msg}</pre>}

      <h2>Editors</h2>
      <ul className="gm-editor-list">
        <li>
          <Link to="/gm/quests">Quests</Link>
        </li>
        <li>
          <Link to="/gm/reputation">Reputation</Link>
        </li>
        <li>
          <Link to="/gm/calendar">Calendar</Link>
        </li>
        <li>
          <Link to="/gm/lore">Lore</Link>
        </li>
        <li>
          <Link to="/gm/characters">Characters</Link>
        </li>
        <li>
          <Link to="/gm/images">Images</Link>
        </li>
      </ul>

      <ConfirmDialog
        isOpen={confirm?.kind === 'reseed'}
        title="Force reseed"
        message="This overwrites ALL stored content with the bundled defaults, discarding every GM edit. This cannot be undone."
        confirmLabel="Reseed"
        requireType="RESEED"
        onConfirm={() => runSeed(true)}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm?.kind === 'restore'}
        title="Restore from backup"
        message={`This overwrites every collection in “${confirm?.file?.name || 'the file'}”, discarding current content for those collections. This cannot be undone.`}
        confirmLabel="Restore"
        requireType="RESTORE"
        onConfirm={doRestore}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

export default GmDashboard;
