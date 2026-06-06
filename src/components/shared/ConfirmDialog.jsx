import React, { useEffect, useState } from 'react';
import Modal from './Modal';

// In-app replacement for window.confirm, used for every destructive GM action.
//
// Two modes:
//  - `requireType` set: the confirm button stays disabled until the GM types
//    that exact string (the entity name for deletes, "RESEED" for force
//    reseed). Guards against reflexive single-click confirmation.
//  - `requireType` absent: a plain Cancel / Confirm dialog (used for the
//    slug-collision overwrite warning, which is recoverable via history).
const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = true,
  requireType,
  onConfirm,
  onCancel,
}) => {
  const [typed, setTyped] = useState('');

  // Clear the typed guard whenever the dialog (re)opens so a prior attempt
  // never leaves the confirm button pre-armed.
  useEffect(() => {
    if (isOpen) setTyped('');
  }, [isOpen]);

  const armed = requireType ? typed === requireType : true;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} maxWidth="440px" highZ>
      <p className="confirm-message">{message}</p>

      {requireType && (
        <div className="form-group">
          <label>
            Type <strong>{requireType}</strong> to confirm
          </label>
          <input
            aria-label="confirm-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
          />
        </div>
      )}

      <div className="gm-actions confirm-actions">
        <button className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          className={danger ? 'btn-danger' : 'btn-primary'}
          disabled={!armed}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
