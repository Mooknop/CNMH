// src/pages/Dashboard.js
import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { CharacterContext } from '../contexts/CharacterContext';
import PartySummary from '../components/party/PartySummary';
import './Dashboard.css';

const Dashboard = () => {
  const PartyGold = 41;
  const { setActiveCharacter } = useContext(CharacterContext);
  const navigate = useNavigate();
  
  // Current game date in Golarion - 21st of Desnus, 4725 AR
  const gameDate = {
    day: 21,
    month: 4, // Desnus (5th month, 0-indexed)
    year: 4725
  };
  
  // Golarion month names for display
  const golarionMonths = [
    "Abadius", "Calistril", "Pharast", "Gozran", "Desnus", "Sarenith",
    "Erastus", "Arodus", "Rova", "Lamashan", "Neth", "Kuthona"
  ];
  
  const formatGameDate = () => {
    const monthName = golarionMonths[gameDate.month];
    return `${gameDate.day} ${monthName}, ${gameDate.year} AR`;
  };
    
  const navigateTo = (path) => {
    navigate(path);
  };

  return (
    <div className="dashboard">
      <h1>Unnamed Group of Adventurers from Osprey Covey</h1>
      
      {/* Campaign Stats */}
      {
        <div className="content-section">
          <h2>Party Overview</h2>
          <div className="stats-grid">            
            
            <div className="stat-card">
              <div className="stat-icon">🌟</div>
              <div className="stat-content">
                <div className="stat-label">Party Level</div>
                <div className="stat-number">4</div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">🗺️</div>
              <div className="stat-content">
                <div className="stat-label">Current Location</div>
                <div className="stat-number">Dis, Hell</div>
              </div>
            </div>

            <button 
            className="stat-card clickable-stat-card"
            onClick={() => navigateTo('/party-wealth')}
            title="Click to view party inventory">
              <div className="stat-icon">💰</div>
              <div className="stat-content">
                <div className="stat-label">Party Gold</div>
                <div className="stat-number">{PartyGold} gp</div>
              </div>
            </button>

            <button 
            className="stat-card clickable-stat-card"
            onClick={() => navigateTo('/quests')}>
              <span className="stat-icon">📜</span>
              <span className="stat-number">Quests</span>
            </button>

            {/* New Golarion Calendar Button */}
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
      {/* Party Summary Section */}
      <PartySummary />
      
      { <div className="dashboard-links">
        
      </div> }

      {/* for lore time
      <button 
          className="dashboard-link-btn lore-btn"
          onClick={() => navigateTo('/lore')}
        >
          <span className="btn-icon">📚</span>
          <span className="btn-text">Campaign Lore</span>
        </button>
      */}
      
    </div>
  );
};

export default Dashboard;