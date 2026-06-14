// src/pages/Dashboard.js
import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameDate } from '../contexts/GameDateContext';
import { useLore } from '../contexts/LoreContext';
import { CharacterContext } from '../contexts/CharacterContext';
import { useSyncedState } from '../hooks/useSyncedState';
import { usePartyGold } from '../hooks/usePartyGold';
import { getCharacterColor } from '../utils/CharacterUtils';
import CharacterCarousel from '../components/dashboard/CharacterCarousel';
import { PARTY_NAME } from '../data/campaign';
import './Dashboard.css';

const OpenIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 3h7v7M21 3l-9 9M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
  </svg>
);

const Dashboard = () => {
  const { formatGameDate } = useGameDate();
  const navigate = useNavigate();
  const { openLore } = useLore();
  const { characters } = useContext(CharacterContext) || {};
  const { total: partyGold } = usePartyGold(characters);
  const [campaign] = useSyncedState('cnmh_campaign_global', { location: '', locationLoreId: '' });
  const currentLocation = campaign?.location || '';
  const locationLoreId = campaign?.locationLoreId || '';

  const party = characters || [];
  const rootRef = useRef(null);
  const [active, setActive] = useState(0);
  // Keep the centered index valid if the party list changes.
  const activeIndex = party.length ? Math.min(active, party.length - 1) : 0;
  const activeChar = party[activeIndex] || null;
  const accent = getCharacterColor(activeIndex);

  // Retint the page chrome to the centered character. The dashboard subtree
  // (card glows, dots, CTA, header kicker, top wash) reads --accent off the
  // dashboard root; the *global* navbar lives outside that subtree, so we also
  // set --accent on <html> and clear it on unmount so the navbar tints on /
  // and falls back to ember on every other route.
  useEffect(() => {
    const html = document.documentElement;
    html.style.setProperty('--accent', accent);
    html.style.setProperty('--accent-strength', '1');
    if (rootRef.current) {
      rootRef.current.style.setProperty('--accent', accent);
      rootRef.current.style.setProperty('--accent-strength', '1');
    }
    return () => {
      html.style.removeProperty('--accent');
      html.style.removeProperty('--accent-strength');
    };
  }, [accent]);

  const openCharacter = () => {
    if (activeChar) navigate(`/character/${activeChar.id}`);
  };

  return (
    <div className="dashboard" ref={rootRef}>
      <div className="dash-grain" aria-hidden="true" />

      <div className="dash-col">
        <header className="dash-header">
          <div className="dash-kicker">Osprey Covey</div>
          <h1 className="dash-title">{PARTY_NAME}</h1>
        </header>

        {party.length > 0 && (
          <>
            <CharacterCarousel
              characters={party}
              active={activeIndex}
              setActive={setActive}
              onOpen={openCharacter}
            />
            <div className="cc-select-bar">
              <button type="button" className="cc-cta" onClick={openCharacter}>
                <OpenIcon />
                <span>Open <span className="cc-cta-name">{activeChar?.name}</span></span>
              </button>
              <div className="cc-hint">Swipe to choose · tap a card to open</div>
            </div>
          </>
        )}

        {/* Campaign stats — 4-up grid below the carousel */}
        <div className="dash-stats">
          <button
            type="button"
            className="dash-chip is-level"
            onClick={() => navigate('/party-summary')}
            title="View detailed party summary"
          >
            <span className="ic">🌟</span>
            <span className="meta">
              <span className="lbl">Party Level</span>
              <span className="val">4</span>
            </span>
          </button>

          <button
            type="button"
            className="dash-chip"
            onClick={locationLoreId ? () => openLore(locationLoreId) : undefined}
            title={locationLoreId ? 'View lore about this location' : undefined}
          >
            <span className="ic">🗺️</span>
            <span className="meta">
              <span className="lbl">Location</span>
              <span className="val">{currentLocation || '—'}</span>
            </span>
          </button>

          <button
            type="button"
            className="dash-chip"
            onClick={() => navigate('/party-wealth')}
            title="View party wealth"
          >
            <span className="ic">💰</span>
            <span className="meta">
              <span className="lbl">Party Gold</span>
              <span className="val">{partyGold} gp</span>
            </span>
          </button>

          <button
            type="button"
            className="dash-chip"
            onClick={() => navigate('/calendar')}
            title="View the Golarion calendar"
          >
            <span className="ic">📅</span>
            <span className="meta">
              <span className="lbl">Date</span>
              <span className="val">{formatGameDate()}</span>
            </span>
          </button>
        </div>

        {/* Secondary nav */}
        <div className="dash-secondary">
          <button type="button" className="dash-sec-btn" onClick={() => navigate('/quests')}>
            <span className="ic">📜</span>
            <span className="lb">Adventure</span>
          </button>
          <button type="button" className="dash-sec-btn" onClick={() => navigate('/bestiary')}>
            <span className="ic">🐉</span>
            <span className="lb">Bestiary</span>
          </button>
          <button type="button" className="dash-sec-btn" onClick={() => navigate('/calendar')}>
            <span className="ic">📅</span>
            <span className="lb">Calendar</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
