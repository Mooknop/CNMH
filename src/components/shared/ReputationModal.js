import React from 'react';
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content reputation-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{faction.name}</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
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

          {currentRank && (
            <div className="current-rank-details">
              {currentRank.effect && (
                <div className="rank-details">
                  <div>
                    <h3>Effect:</h3>
                    <p className="effect-text">{currentRank.effect}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReputationModal;