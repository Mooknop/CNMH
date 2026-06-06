import React, { createContext, useState, useContext } from 'react';
import { useContent } from './ContentContext';
import TraitModal from '../components/shared/TraitModal';

// Create context
export const TraitContext = createContext();

/**
 * Provider component for managing traits data and modal state
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export const TraitProvider = ({ children }) => {
  const { traits } = useContent();
  const [selectedTrait, setSelectedTrait] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Function to open modal with a specific trait
  const openTraitModal = (traitName) => {
    const trait = traits.find(t => 
      traitName.toLowerCase().includes(t.name.toLowerCase())
    );
    
    if (trait) {
      setSelectedTrait(trait);
      setIsModalOpen(true);
    } else {
      console.warn(`Trait "${traitName}" not found`);
    }
  };
  
  // Function to close modal
  const closeTraitModal = () => {
    setIsModalOpen(false);
  };
  
  return (
    <TraitContext.Provider
      value={{
        traits,
        openTraitModal,
        closeTraitModal
      }}
    >
      {children}
      <TraitModal
        isOpen={isModalOpen}
        onClose={closeTraitModal}
        trait={selectedTrait}
      />
    </TraitContext.Provider>
  );
};

// Custom hook for using the trait context
export const useTrait = () => useContext(TraitContext);