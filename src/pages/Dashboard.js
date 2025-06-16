// src/pages/Dashboard.js
import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { CharacterContext } from '../contexts/CharacterContext';
import PartySummary from '../components/party/PartySummary';
import './Dashboard.css';

const Dashboard = () => {
  const { setActiveCharacter } = useContext(CharacterContext);

  const navigate = useNavigate();
    
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

            <div className="stat-card">
              <div className="stat-icon">💰</div>
              <div className="stat-content">
                <div className="stat-label">Party Gold</div>
                <div className="stat-number">46 gp</div>
              </div>
            </div>

            <button 
            className="nav-item"
            onClick={() => navigateTo('/quests')}>
              <span className="btn-icon">📜</span>
              <span className="btn-text">Quests</span>
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