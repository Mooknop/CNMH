// src/pages/Dashboard.js
import React, { useContext } from 'react';
import { CharacterContext } from '../contexts/CharacterContext';
import PartySummary from '../components/party/PartySummary';
import './Dashboard.css';

const Dashboard = () => {
  const { setActiveCharacter } = useContext(CharacterContext);

  
  return (
    <div className="dashboard">
      <h1>Unnamed Group of Adventurers from Osprey Cove</h1>
      
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