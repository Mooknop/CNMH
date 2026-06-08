import React, { useState } from 'react';
import Modal from '../shared/Modal';
import { useContent } from '../../contexts/ContentContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import './AdjustHpModal.css';

const EMPTY_HP = { current: 0, max: 0, temp: 0, dying: 0, wounded: 0, doomed: 0 };

const AdjustHpModal = ({ isOpen, onClose }) => {
  const { characters } = useContent();
  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('heal');

  const [hp, setHp] = useSyncedState(
    `cnmh_hp_${selectedId || 'none'}`,
    () => ({ ...EMPTY_HP }),
  );

  const handleApply = () => {
    const n = parseInt(amount, 10);
    if (!selectedId || !n || n < 1 || !hp) return;

    let newHp;
    if (mode === 'heal') {
      newHp = { ...hp, current: Math.min(hp.max, hp.current + n) };
    } else {
      const tempAbsorb = Math.min(hp.temp || 0, n);
      const remainder = n - tempAbsorb;
      newHp = {
        ...hp,
        temp: (hp.temp || 0) - tempAbsorb,
        current: Math.max(0, hp.current - remainder),
      };
    }
    setHp(newHp);
    setAmount('');
  };

  const handleClose = () => {
    setAmount('');
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleApply();
  };

  const canApply = !!selectedId && !!amount && parseInt(amount, 10) >= 1;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Adjust HP" maxWidth="400px">
      <div className="adj-hp-body">
        <div className="adj-hp-char-row">
          <label htmlFor="adj-hp-char">Character</label>
          <select
            id="adj-hp-char"
            value={selectedId}
            onChange={(e) => { setSelectedId(e.target.value); setAmount(''); }}
            aria-label="select character"
          >
            <option value="">— pick a character —</option>
            {(characters || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {selectedId && (
          <>
            <div className="adj-hp-status" aria-label="current hp">
              <span className="adj-hp-current">{hp?.current ?? 0}</span>
              <span className="adj-hp-sep">/</span>
              <span className="adj-hp-max">{hp?.max ?? 0}</span>
              {(hp?.temp ?? 0) > 0 && (
                <span className="adj-hp-temp">+{hp.temp} temp</span>
              )}
            </div>

            <div className="adj-hp-mode" role="group" aria-label="damage or heal">
              <button
                type="button"
                className={`adj-hp-mode-btn${mode === 'damage' ? ' is-active' : ''}`}
                data-mode="damage"
                onClick={() => setMode('damage')}
                aria-pressed={mode === 'damage'}
              >
                Damage
              </button>
              <button
                type="button"
                className={`adj-hp-mode-btn${mode === 'heal' ? ' is-active' : ''}`}
                data-mode="heal"
                onClick={() => setMode('heal')}
                aria-pressed={mode === 'heal'}
              >
                Heal
              </button>
            </div>

            <div className="adj-hp-entry">
              <input
                type="number"
                min="1"
                className="adj-hp-input"
                placeholder="Amount"
                aria-label="hp amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                type="button"
                className={`btn-primary adj-hp-apply${mode === 'damage' ? ' adj-hp-apply--damage' : ''}`}
                onClick={handleApply}
                disabled={!canApply}
                aria-label={`Apply ${mode}`}
              >
                Apply
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default AdjustHpModal;
