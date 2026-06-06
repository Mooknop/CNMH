// src/components/shared/Modal.js
import React from 'react';
import './Modal.css';

/**
 * Generic modal wrapper used by all modal components.
 *
 * Props:
 *   isOpen      – controls visibility; returns null when false
 *   onClose     – called when the overlay or close button is clicked
 *   title       – heading text in the header bar
 *   themeColor  – (optional) background color of the header bar; when absent the
 *                 header renders in a plain style with a bottom border
 *   maxWidth    – (optional) max-width of the dialog; defaults to '600px'
 *   highZ       – (optional) use elevated z-index stack (for modals that must
 *                 appear above other floating content)
 *   children    – the modal body content
 */
const Modal = ({ isOpen, onClose, title, themeColor, maxWidth, highZ, children }) => {
  if (!isOpen) return null;

  const overlayClass = `modal-overlay${highZ ? ' modal-overlay--high' : ''}`;
  const containerClass = `modal-container${highZ ? ' modal-container--high' : ''}`;
  const headerClass = `modal-header${themeColor ? ' modal-header--themed' : ''}`;
  const containerStyle = {
    maxWidth: maxWidth || '600px',
    ...(themeColor ? { '--color-theme': themeColor } : {}),
  };

  return (
    <div className={overlayClass} onClick={onClose}>
      <div
        className={containerClass}
        style={containerStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={headerClass}>
          <h2>{title}</h2>
          <button className="modal-close-button" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
