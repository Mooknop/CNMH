import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useGmAuth } from '../../hooks/useGmAuth';
import { useContent } from '../../contexts/ContentContext';
import { usePlayMode } from '../../hooks/usePlayMode';
import { seedDefaults } from '../../utils/gmApi';
import UsageChip from '../../components/gm/UsageChip';
import GmIcon from './GmIcon';
import './gm.css';
import './gm-shell.css';

// Five primary areas. World & Catalog open onto a second-level subrail; the
// rest go straight to content. Each link points at the area's default route.
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', to: '/gm' },
  { id: 'world', label: 'World', icon: 'world', to: '/gm/world/quests' },
  { id: 'catalog', label: 'Catalog', icon: 'catalog', to: '/gm/catalog/items' },
  { id: 'characters', label: 'Characters', icon: 'users', to: '/gm/characters' },
  { id: 'theme', label: 'Theme', icon: 'palette', to: '/gm/theme' },
];

const SUBNAV = {
  world: [
    { id: 'quests', label: 'Quests', icon: 'scroll', countKey: 'quests' },
    { id: 'reputation', label: 'Reputation', icon: 'flag', countKey: 'reputation' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar' },
    { id: 'lore', label: 'Lore', icon: 'book', countKey: 'allLoreEntries' },
  ],
  catalog: [
    { id: 'items', label: 'Items', icon: 'bag', countKey: 'items' },
    { id: 'spells', label: 'Spells', icon: 'wand', countKey: 'spells' },
    { id: 'effects', label: 'Effects', icon: 'spark', countKey: 'effects' },
    { id: 'runes', label: 'Runes', icon: 'rune', countKey: 'runes' },
    { id: 'images', label: 'Images', icon: 'image', countKey: 'images' },
    { id: 'monsters', label: 'Bestiary', icon: 'sword', countKey: 'monsters' },
    { id: 'traits', label: 'Traits', icon: 'tag', countKey: 'traits' },
  ],
};

const MODE_META = {
  encounter: { label: 'Encounter', icon: 'sword' },
  exploration: { label: 'Exploration', icon: 'map' },
  downtime: { label: 'Downtime', icon: 'home' },
};

// Collections are arrays, except reputation which is grouped { Group: [...] }.
const collectionCount = (content, key) => {
  const v = content && content[key];
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') {
    return Object.values(v).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
  }
  return 0;
};

// Derive the active area + (for World/Catalog) active section from the URL.
const deriveArea = (pathname) => {
  if (pathname.startsWith('/gm/world')) return { area: 'world', section: pathname.split('/')[3] || 'quests' };
  if (pathname.startsWith('/gm/catalog')) return { area: 'catalog', section: pathname.split('/')[3] || 'items' };
  if (pathname.startsWith('/gm/characters')) return { area: 'characters', section: null };
  if (pathname.startsWith('/gm/theme')) return { area: 'theme', section: null };
  return { area: 'dashboard', section: null };
};

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
  const content = useContent();
  const { refresh } = content;
  const { mode } = usePlayMode();
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
    return <div className="gm-shell-message">Checking GM access…</div>;
  }

  if (!isGm) {
    return (
      <div className="gm-shell-message">
        <h1>GM area</h1>
        <p>
          This area is restricted. Sign in through the Cloudflare Access prompt
          with the GM account to manage campaign data.
        </p>
      </div>
    );
  }

  if (seedState === 'error') {
    return (
      <div className="gm-shell-message">
        <h1>GM Tools</h1>
        <p className="gm-warn" role="alert">
          Couldn't initialize the campaign store. Editing is disabled until this
          succeeds so existing entries aren't hidden.
        </p>
        <button className="btn-primary" onClick={() => setSeedState('idle')}>
          Retry
        </button>
      </div>
    );
  }

  if (seedState !== 'done') {
    return <div className="gm-shell-message">Initializing campaign store…</div>;
  }

  const { area, section } = deriveArea(location.pathname);
  const subItems = SUBNAV[area] || [];
  const hasSub = subItems.length > 0;
  const modeMeta = MODE_META[mode] || MODE_META.exploration;

  return (
    <div className="gm-shell">
      <header className="gm-topbar">
        <div className="gm-brand">
          <span className="gm-brand-1">GM Tools</span>
          <span className="gm-brand-2">Campaign control</span>
        </div>
        <nav className="gm-topnav" aria-label="GM areas">
          {NAV.map((n) => (
            <Link
              key={n.id}
              to={n.to}
              className={`gm-topnav-link ${area === n.id ? 'active' : ''}`}
              aria-current={area === n.id ? 'page' : undefined}
            >
              <GmIcon name={n.icon} /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="gm-topbar-right">
          <span className="gm-mode-flag">
            <span className="gm-mode-dot" />
            <GmIcon name={modeMeta.icon} /> {modeMeta.label}
          </span>
          <UsageChip />
          <span className="gm-identity">{email}</span>
          <span className="gm-avatar" aria-hidden="true">GM</span>
        </div>
      </header>

      <div className="gm-body">
        {hasSub && (
          <aside className="gm-subrail" aria-label={`${area} sections`}>
            <div className="gm-subrail-label">{area}</div>
            {subItems.map((s) => {
              const count = s.countKey ? collectionCount(content, s.countKey) : 0;
              return (
                <Link
                  key={s.id}
                  to={`/gm/${area}/${s.id}`}
                  className={`gm-subrail-link ${section === s.id ? 'active' : ''}`}
                  aria-current={section === s.id ? 'page' : undefined}
                >
                  <GmIcon name={s.icon} /> {s.label}
                  {count > 0 && <span className="gm-ct">{count}</span>}
                </Link>
              );
            })}
          </aside>
        )}
        <main className="gm-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default GmLayout;
