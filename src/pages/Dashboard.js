// src/pages/Dashboard.js
import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CharacterContext } from '../contexts/CharacterContext';
import PartySummary from '../components/party/PartySummary';
import PartyWealthModal from '../components/party/PartyWealthModal';
import ItemModal from '../components/inventory/ItemModal';
import './Dashboard.css';

const Dashboard = () => {
  const PartyGold = 46;

  const { setActiveCharacter } = useContext(CharacterContext);

  const [isPartyGoldModalOpen, setIsPartyGoldModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);

  const navigate = useNavigate();
    
  const navigateTo = (path) => {
    navigate(path);
  };
  
    // Handle opening the party gold modal
  const handlePartyGoldClick = () => {
    setIsPartyGoldModalOpen(true);
  };

  // Handle closing the party gold modal
  const closePartyGoldModal = () => {
    setIsPartyGoldModalOpen(false);
  };

  // Handle opening the item detail modal from party inventory
  const handleItemClick = (item) => {
    setSelectedItem(item);
    setIsItemModalOpen(true);
  };

  // Handle closing the item detail modal
  const closeItemModal = () => {
    setIsItemModalOpen(false);
    setSelectedItem(null);
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
            onClick={handlePartyGoldClick}
            title="Click to view party inventory">
              <div className="stat-icon">💰</div>
              <div className="stat-content">
                <div className="stat-label">Party Gold</div>
                <div className="stat-number">{PartyGold} gp</div>
              </div>
            </button>

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

      {/* Party Gold Modal */}
      <PartyWealthModal
        isOpen={isPartyGoldModalOpen}
        onClose={closePartyGoldModal}
        onItemClick={handleItemClick}
        gold={PartyGold}
      />

      {/* Item Detail Modal */}
      {selectedItem && (
        <ItemModal
          isOpen={isItemModalOpen}
          onClose={closeItemModal}
          item={selectedItem}
          characterColor={selectedItem.characterColor}
        />
      )}

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