import React, { useState, useMemo } from 'react';
import Modal from '../shared/Modal';
import { useContent } from '../../contexts/ContentContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useMinions } from '../../hooks/useMinions';
import { minionRoster } from '../../utils/minionUtils';
import './AdjustHpModal.css';

const EMPTY_HP = { current: 0, max: 0, temp: 0, dying: 0, wounded: 0, doomed: 0 };

// Selection values are prefixed so a PC and an allied minion (#261) never collide:
//   char:<charId>            → the PC's own cnmh_hp_<charId>
//   minion:<ownerId>:<role>  → an entry in the owner's cnmh_minions_<ownerId>
const parseSelection = (value) => {
  if (!value) return null;
  const [kind, a, b] = value.split(':');
  if (kind === 'minion') return { kind: 'minion', ownerId: a, role: b };
  if (kind === 'char') return { kind: 'char', id: a };
  return null;
};

const AdjustHpModal = ({ isOpen, onClose }) => {
  const { characters } = useContent();
  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('heal');

  const sel = parseSelection(selectedId);

  // Both sources are subscribed unconditionally (hooks can't be conditional);
  // only the one matching the current selection is read/written.
  const charId = sel?.kind === 'char' ? sel.id : 'none';
  const [charHp, setCharHp] = useSyncedState(
    `cnmh_hp_${charId}`,
    () => ({ ...EMPTY_HP }),
  );
  const minionOwner = sel?.kind === 'minion' ? sel.ownerId : 'none';
  const { getHp, damage, heal } = useMinions(minionOwner);

  // The authored max HP for the selected minion (from owner character data).
  const minionMax = useMemo(() => {
    if (sel?.kind !== 'minion') return 0;
    const owner = (characters || []).find((c) => c.id === sel.ownerId);
    const entry = minionRoster(owner).find((r) => r.role === sel.role);
    return entry?.maxHp ?? 0;
  }, [sel, characters]);

  const hp = sel?.kind === 'minion' ? getHp(sel.role, minionMax) : charHp;

  const handleApply = () => {
    const n = parseInt(amount, 10);
    if (!sel || !n || n < 1 || !hp) return;

    if (sel.kind === 'minion') {
      if (mode === 'heal') heal(sel.role, n, minionMax);
      else damage(sel.role, n, minionMax);
    } else {
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
      setCharHp(newHp);
    }
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
            {(characters || []).map((c) => {
              const minions = minionRoster(c);
              return (
                <React.Fragment key={c.id}>
                  <option value={`char:${c.id}`}>{c.name}</option>
                  {minions.map((m) => (
                    <option key={m.role} value={`minion:${c.id}:${m.role}`}>
                      {c.name} — {m.name}
                    </option>
                  ))}
                </React.Fragment>
              );
            })}
          </select>
        </div>

        {sel && (
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
