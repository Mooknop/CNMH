// src/components/shared/Modal.js
import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import './Modal.css';

// Keyboard-reachable elements for the focus trap (#1319).
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), ' +
  'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Generic modal wrapper used by all modal components.
 *
 * Accessibility (shared by every consumer, #1319): the dialog takes focus on
 * open and returns it on close, Escape closes, and Tab cycles inside the
 * dialog (focus trap).
 *
 * Props:
 *   isOpen      – controls visibility; returns null when false
 *   onClose     – called when the overlay or close button is clicked, or Escape
 *   title       – heading text in the header bar
 *   themeColor  – (optional) background color of the header bar; when absent the
 *                 header renders in a plain style with a bottom border
 *   maxWidth    – (optional) max-width of the dialog; defaults to '600px'
 *   highZ       – (optional) use elevated z-index stack (for modals that must
 *                 appear above other floating content)
 *   placement   – (optional) 'center' (default) or 'bottom' for a slide-up sheet
 *                 anchored to the bottom edge (Command Sheet resolvers, #412)
 *   className   – (optional) extra class on the container (e.g. 'modal--loot')
 *   hideHeader  – (optional) suppress the header bar + default close button, for
 *                 modals that render their own chrome (the inventory loot card)
 *   children    – the modal body content
 */
const Modal = ({
  isOpen, onClose, title, themeColor, maxWidth, highZ,
  placement = 'center', className = '', hideHeader = false, children,
}) => {
  const containerRef = useRef(null);

  // Take focus on open (so Escape and the trap work immediately, and screen
  // readers enter the dialog); hand it back to the opener on close/unmount.
  useEffect(() => {
    if (!isOpen) return undefined;
    const opener = document.activeElement;
    containerRef.current?.focus();
    return () => {
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        opener.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose?.();
      return;
    }
    if (e.key !== 'Tab') return;
    // Cycle Tab / Shift+Tab within the dialog.
    const nodes = containerRef.current?.querySelectorAll(FOCUSABLE);
    if (!nodes || nodes.length === 0) {
      e.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === containerRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const bottom = placement === 'bottom';
  const overlayClass = `modal-overlay${highZ ? ' modal-overlay--high' : ''}${bottom ? ' modal-overlay--bottom' : ''}`;
  const containerClass =
    `modal-container${highZ ? ' modal-container--high' : ''}` +
    `${bottom ? ' modal-container--bottom' : ''}${className ? ` ${className}` : ''}`;
  const headerClass = `modal-header${themeColor ? ' modal-header--themed' : ''}`;
  const containerStyle = {
    maxWidth: maxWidth || '600px',
    ...(themeColor ? { '--color-theme': themeColor } : {}),
  };

  const overlay = (
    <div className={overlayClass} onClick={onClose} onKeyDown={onKeyDown}>
      <div
        className={containerClass}
        style={containerStyle}
        onClick={(e) => e.stopPropagation()}
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' && title ? title : undefined}
        tabIndex={-1}
      >
        {!hideHeader && (
          <div className={headerClass}>
            <h2>{title}</h2>
            <button className="modal-close-button" onClick={onClose} aria-label="Close">&times;</button>
          </div>
        )}
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );

  // Portal to <body> so the fixed-position overlay always escapes ancestor
  // containing blocks (e.g. GM containers with backdrop-filter, which would
  // otherwise anchor position:fixed to themselves) and stacking contexts.
  if (typeof document === 'undefined') return overlay;
  return ReactDOM.createPortal(overlay, document.body);
};

export default Modal;
