import React from 'react';
import Modal from './Modal';
import './ReputationModal.css';

const ReputationModal = ({ isOpen, onClose, faction }) => {
  if (!isOpen || !faction) return null;

  const getCurrentStanding = (faction) => {
    const rep = faction.reputation;
    return faction.ranks.find(rank => rep >= rank.min && rep <= rank.max)?.name || 'Unknown';
  };

  const currentStanding = getCurrentStanding(faction);
  const currentRank = faction.ranks.find(rank => rank.name === currentStanding);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={faction.name} maxWidth="600px">
      <div className="reputation-content">
        <div className="reputation-info">
          <div className="reputation-score">
            <span className="label">Reputation:</span>
            <span className="value">{faction.reputation}</span>
          </div>
          <div className="current-standing">
            <span className="label">Current Standing:</span>
            <span className="value">{currentStanding}</span>
          </div>
        </div>

        {currentRank.effect && (
          <div className="current-rank-details">
            <div className="rank-details">
              <div>
                <h3>Effect:</h3>
                <p className="effect-text">{currentRank.effect}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ReputationModal;
