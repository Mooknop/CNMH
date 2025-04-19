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
      <h1>Unnamed Group of Adventurers from Osprey Cove</h1>
      
      {/* Party Summary Section */}
      <PartySummary />
      
      <div className="dashboard-links">
        <button 
          className="dashboard-link-btn quest-btn"
          onClick={() => navigateTo('/quests')}
        >
          <span className="btn-icon">📜</span>
          <span className="btn-text">Quest Tracker</span>
        </button>
        <button 
          className="dashboard-link-btn lore-btn"
          onClick={() => navigateTo('/lore')}
        >
          <span className="btn-icon">📚</span>
          <span className="btn-text">Campaign Lore</span>
        </button>
      </div>
      
      {/* Character section has been removed */}
    </div>
  );
};

export default Dashboard;