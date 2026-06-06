import React from 'react';
import { useTrait } from '../../contexts/TraitContext';
import './TraitTag.css';

/**
 * Clickable trait tag component
 * @param {Object} props - Component props
 * @param {string} props.trait - Trait name
 * @param {string} props.className - Additional CSS class
 */
const TraitTag = ({ trait, className = '' }) => {
  const { openTraitModal } = useTrait();
  
  const handleClick = () => {
    openTraitModal(trait);
  };
  
  return (
    <span 
      className={`trait-tag clickable ${className}`}
      onClick={handleClick}
      title={`Click for more info about ${trait}`}
    >
      {trait}
    </span>
  );
};

export default TraitTag;