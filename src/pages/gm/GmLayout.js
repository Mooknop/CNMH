import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useGmAuth } from '../../hooks/useGmAuth';
import './gm.css';

// Shell for the GM area. Real enforcement is server-side (Cloudflare Access in
// front of /gm* and the Worker re-verifying /api/gm/*); this guard is UX only.
const GmLayout = () => {
  const { loading, isGm, email } = useGmAuth();
  const location = useLocation();

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

  const links = [
    { to: '/gm', label: 'Dashboard', end: true },
    { to: '/gm/quests', label: 'Quests' },
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
