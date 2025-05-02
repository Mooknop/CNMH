import React from 'react';
import './TraitModal.css';

/**
 * Modal component for displaying trait descriptions
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {function} props.onClose - Function to close the modal
 * @param {Object} props.trait - Trait data object
 * @param {string} props.themeColor - Theme color
 */
const TraitModal = ({ isOpen, onClose, trait, themeColor }) => {
  if (!isOpen || !trait) return null;
  
  return (
    <div className="trait-modal-overlay" onClick={onClose}>
      <div className="trait-modal" onClick={(e) => e.stopPropagation()}>
        <div className="trait-modal-header" style={{ backgroundColor: themeColor || '#5e2929' }}>
          <h2>{trait.name}</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        <div className="trait-modal-content">
          <p className="trait-description">{trait.description}</p>
          
          <div className="trait-source">
            <span>Source: Pathfinder 2nd Edition Core Rulebook</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TraitModal;