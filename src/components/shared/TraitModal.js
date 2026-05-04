import React from 'react';
import Modal from './Modal';
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
    <Modal isOpen={isOpen} onClose={onClose} title={trait.name} themeColor={themeColor} maxWidth="500px">
      <p className="trait-description">{trait.description}</p>
      <div className="trait-source">
        <span>Source: Pathfinder 2nd Edition Core Rulebook</span>
      </div>
    </Modal>
  );
};

export default TraitModal;
