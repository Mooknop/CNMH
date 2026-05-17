import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useContent } from '../../contexts/ContentContext';
import { seedDefaults } from '../../utils/gmApi';
import './gm.css';

const GmDashboard = () => {
  const { source } = useContent();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const runSeed = async (force) => {
    if (force && !window.confirm('Overwrite ALL stored content with the bundled defaults?')) {
      return;
    }
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
        <button className="btn-danger" disabled={busy} onClick={() => runSeed(true)}>
          Force reseed (overwrite)
        </button>
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
      </ul>
    </div>
  );
};

export default GmDashboard;
