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

  // Retint the page chrome to the centered character (card glows + dots read --accent).
  useEffect(() => {
    if (rootRef.current) {
      rootRef.current.style.setProperty('--accent', accent);
      rootRef.current.style.setProperty('--accent-strength', '1');
    }
  }, [accent]);

  const navigateTo = (path) => {
    navigate(path);
  };

  const openCharacter = () => {
    if (activeChar) navigate(`/character/${activeChar.id}`);
  };

  return (
    <div className="dashboard" ref={rootRef}>
      <h1>{PARTY_NAME}</h1>

      {party.length > 0 && (
        <>
          <CharacterCarousel
            characters={party}
            active={activeIndex}
            setActive={setActive}
            onOpen={openCharacter}
          />
          <div className="cc-select-bar">
            <button
              type="button"
              className="cc-cta"
              onClick={openCharacter}
              style={{ '--accent': accent }}
            >
              <OpenIcon />
              <span>Open <span className="cc-cta-name">{activeChar?.name}</span></span>
            </button>
            <div className="cc-hint">Swipe to choose · tap a card to open</div>
          </div>
        </>
      )}

      {/* Campaign Stats */}
      {
        <div className="content-section">
          <div className="stats-grid">
            <button
            className="stat-card clickable-stat-card party-level-stat"
            onClick={() => navigateTo('/party-summary')}
            title="Click to view detailed party summary">
              <div className="stat-icon">🌟</div>
              <div className="stat-content">
                <div className="stat-label">Party Level</div>
                <div className="stat-number">4</div>
              </div>
          </button>

            <button
              className={`stat-card${locationLoreId ? ' clickable-stat-card' : ''}`}
              onClick={locationLoreId ? () => openLore(locationLoreId) : undefined}
              title={locationLoreId ? 'Click to view lore about this location' : undefined}
            >
              <div className="stat-icon">🗺️</div>
              <div className="stat-content">
                <div className="stat-label">Current Location</div>
                <div className="stat-number">{currentLocation || '—'}</div>
              </div>
            </button>

            <button
            className="stat-card clickable-stat-card"
            onClick={() => navigateTo('/party-wealth')}
            title="Click to view party inventory">
              <div className="stat-icon">💰</div>
              <div className="stat-content">
                <div className="stat-label">Party Gold</div>
                <div className="stat-number">{partyGold} gp</div>
              </div>
            </button>

            <button
            className="stat-card clickable-stat-card"
            onClick={() => navigateTo('/quests')}>
              <span className="stat-icon">📜</span>
              <span className="stat-number">Adventure</span>
            </button>

            <button
            className="stat-card clickable-stat-card"
            onClick={() => navigateTo('/bestiary')}
            title="Browse creatures the party has encountered">
              <span className="stat-icon">🐉</span>
              <span className="stat-number">Bestiary</span>
            </button>

            {/* Golarion Calendar Button - Now using centralized game date */}
            <button
            className="stat-card clickable-stat-card calendar-card"
            onClick={() => navigateTo('/calendar')}
            title="View Golarion Calendar and current date">
              <div className="stat-icon">📅</div>
              <div className="stat-content">
                <div className="stat-label">Current Date</div>
                <div className="stat-number">{formatGameDate()}</div>
              </div>
            </button>
          </div>
        </div>
        }

      { <div className="dashboard-links">

      </div> }
    </div>
  );
};

export default Dashboard;
