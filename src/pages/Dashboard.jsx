// src/pages/Dashboard.js
import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameDate } from '../contexts/GameDateContext';
import { useLore } from '../contexts/LoreContext';
import { CharacterContext } from '../contexts/CharacterContext';
import { useSyncedState } from '../hooks/useSyncedState';
import { usePartyGold } from '../hooks/usePartyGold';
import { PARTY_NAME } from '../data/campaign';
import './Dashboard.css';

const Dashboard = () => {
  const { formatGameDate } = useGameDate();
  const navigate = useNavigate();
  const { openLore } = useLore();
  const { characters } = useContext(CharacterContext) || {};
  const { total: partyGold } = usePartyGold(characters);
  const [campaign] = useSyncedState('cnmh_campaign_global', { location: '', locationLoreId: '' });
  const currentLocation = campaign?.location || '';
  const locationLoreId = campaign?.locationLoreId || '';

  const navigateTo = (path) => {
    navigate(path);
  };

  return (
    <div className="dashboard">
      <h1>{PARTY_NAME}</h1>

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
