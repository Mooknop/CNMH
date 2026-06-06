// src/components/actions/ActionCategoryModal.js
import React from 'react';
import Modal from '../shared/Modal';
import ActionCardList from './ActionCardList';
import StrikesList from './StrikesList';

const SectionDivider = ({ label, themeColor }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    margin: '1rem 0 0.5rem',
  }}>
    <span style={{
      color: themeColor,
      fontWeight: '700',
      fontSize: '0.75rem',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
    <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }} />
  </div>
);

/**
 * Modal for a single action category (Offensive / Defensive / Movement).
 * Offensive variant passes showStrikes + character to render StrikesList first.
 */
const ActionCategoryModal = ({
  isOpen,
  onClose,
  title,
  themeColor,
  items,
  showStrikes = false,
  character,
  encounterMode,
  onUse,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      themeColor={themeColor}
      maxWidth="680px"
      highZ
    >
      {showStrikes && character && (
        <>
          <StrikesList
            character={character}
            themeColor={themeColor}
            encounterMode={encounterMode}
            onUse={onUse}
          />
          <SectionDivider label="Basic Offensive Actions" themeColor={themeColor} />
        </>
      )}
      <ActionCardList
        items={items}
        type="action"
        themeColor={themeColor}
        encounterMode={encounterMode}
        onUse={onUse}
      />
    </Modal>
  );
};

export default ActionCategoryModal;
