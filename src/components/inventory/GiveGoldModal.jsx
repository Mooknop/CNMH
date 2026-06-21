import React, { useState } from 'react';
import Modal from '../shared/Modal';
import { useContent } from '../../contexts/ContentContext';
import { useGiveGold } from '../../hooks/useGiveGold';
import { useSessionLog } from '../../hooks/useSessionLog';
import './GiveGoldModal.css';

// Give-gold flow (#655). Pick a party member, enter an amount, push it. The
// giver is the sheet's character; recipients are the rest of the roster. The
// amount is bounded to the giver's live balance so the transfer can never go
// negative. Only opened from exploration/downtime (gated in InventoryTab).
const GiveGoldModal = ({ isOpen, onClose, character }) => {
  const { characters } = useContent();
  const { myGold, give } = useGiveGold(character?.id);
  const { appendEvent } = useSessionLog();

  const recipients = (characters || []).filter((c) => c.id !== character?.id);
  const [recipientId, setRecipientId] = useState('');
  const [amount, setAmount] = useState('');

  const amt = Number(amount);
  const valid = !!recipientId && Number.isFinite(amt) && amt > 0 && amt <= myGold;

  const handleClose = () => {
    setRecipientId('');
    setAmount('');
    onClose();
  };

  const handleGive = () => {
    if (!valid) return;
    if (give(recipientId, amt)) {
      const recipient = recipients.find((c) => c.id === recipientId);
      appendEvent({
        type: 'action',
        text: `${character?.name || 'Someone'} gave ${amt} gp to ${recipient?.name || 'someone'}`,
      });
    }
    handleClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Give Gold" maxWidth="420px">
      <div className="give-gold-body">
        <p className="give-gold-balance">
          You have <strong>{myGold} gp</strong>
        </p>

        {recipients.length === 0 ? (
          <p className="give-gold-empty">No other party members to give to.</p>
        ) : (
          <>
            <span className="give-gold-label">Give to</span>
            <div className="give-gold-recipients">
              {recipients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`btn-small ${recipientId === c.id ? 'btn-primary' : 'btn-secondary'}`}
                  aria-pressed={recipientId === c.id}
                  onClick={() => setRecipientId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>

            <span className="give-gold-label">Amount</span>
            <div className="give-gold-entry">
              <input
                type="number"
                min="0"
                step="any"
                className="give-gold-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Amount to give"
              />
              <span className="give-gold-gp">gp</span>
            </div>

            <button
              type="button"
              className="btn-small btn-primary give-gold-submit"
              data-testid="give-gold-submit"
              disabled={!valid}
              onClick={handleGive}
            >
              Give
            </button>
          </>
        )}
      </div>
    </Modal>
  );
};

export default GiveGoldModal;
