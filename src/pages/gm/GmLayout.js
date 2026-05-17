import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useGmAuth } from '../../hooks/useGmAuth';
import { useContent } from '../../contexts/ContentContext';
import { seedDefaults } from '../../utils/gmApi';
import './gm.css';

// Shell for the GM area. Real enforcement is server-side (Cloudflare Access in
// front of /gm* and the Worker re-verifying /api/gm/*); this guard is UX only.
//
// The store must be the complete source of truth BEFORE any single edit:
// otherwise saving one entity would flip that collection from "show bundled
// defaults" to "show the store" while the store holds only that one row,
// making every other entry vanish. So whenever the GM enters, we run an
// idempotent seed of the bundled defaults (server-side it only fills EMPTY
// collections) and hold the editors until that's confirmed. Doing it
// unconditionally also auto-backfills any newly shipped collection (e.g. a
// later slice) on the next GM visit, with no manual step.
const GmLayout = () => {
  const { loading, isGm, email } = useGmAuth();
  const { refresh } = useContent();
  const location = useLocation();
  const [seedState, setSeedState] = useState('idle'); // idle|seeding|done|error

  useEffect(() => {
    if (!isGm) return;
    if (seedState !== 'idle') return;
    setSeedState('seeding');
    seedDefaults(false)
      .then(() => refresh())
      .then(() => setSeedState('done'))
      .catch(() => setSeedState('error'));
  }, [isGm, seedState, refresh]);

  if (loading) {
    return <div className="gm-area gm-message">Checking GM access…</div>;
  }

  if (!isGm) {
    return (
      <div className="gm-area gm-message">
        <h1>GM area</h1>
        <p>
          This area is restricted. Sign in through the Cloudflare Access prompt
          with the GM account to manage campaign data.
        </p>
      </div>
    );
  }

  const ready = seedState === 'done';

  if (seedState === 'error') {
    return (
      <div className="gm-area gm-message">
        <h1>GM Tools</h1>
        <p className="gm-warn" role="alert">
          Couldn’t initialize the campaign store. Editing is disabled until this
          succeeds so existing entries aren’t hidden.
        </p>
        <button className="btn-primary" onClick={() => setSeedState('idle')}>
          Retry
        </button>
      </div>
    );
  }

  if (!ready) {
    return <div className="gm-area gm-message">Initializing campaign store…</div>;
  }

  const links = [
    { to: '/gm', label: 'Dashboard', end: true },
    { to: '/gm/quests', label: 'Quests' },
    { to: '/gm/reputation', label: 'Reputation' },
    { to: '/gm/calendar', label: 'Calendar' },
  ];

  return (
    <div className="gm-area">
      <header className="gm-header">
        <h1>GM Tools</h1>
        <span className="gm-identity">{email}</span>
      </header>
      <nav className="gm-nav">
        {links.map((l) => {
          const active = l.end ? location.pathname === l.to : location.pathname.startsWith(l.to);
          return (
            <Link key={l.to} to={l.to} className={`gm-nav-link ${active ? 'active' : ''}`}>
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="gm-content">
        <Outlet />
      </div>
    </div>
  );
};

export default GmLayout;
