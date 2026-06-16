import React, { useState } from 'react';
import Modal from '../shared/Modal';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useHuntPrey } from '../../hooks/useHuntPrey';
import { preyKeyFor } from '../../utils/huntPrey';
import './TreatWoundsModal.css';

/**
 * Designate a single encounter enemy as the ranger's prey (#223). In-combat
 * entry point only — picks from the current encounter's enemies. Setting prey
 * overwrites any previous designation.
 *
 * @param {boolean}  isOpen
 * @param {Function} onClose
 * @param {Object}   character   - the acting PC (the hunter)
 * @param {string}   themeColor
 * @param {number}   actionCost  - actions to spend on confirm (1 from her turn action, 0 otherwise)
 */
const HuntPreyModal = ({ isOpen, onClose, character, themeColor, actionCost = 0 }) => {
  const { encounter, appendLog } = useEncounter();
  const { spendActions } = useTurnState(character?.id || 'nobody');
  const { designate } = useHuntPrey(character?.id);
  const [selectedEntryId, setSelectedEntryId] = useState(null);

  const encounterMode = !!(encounter?.active && encounter.phase === 'in-progress');
  const enemies = (encounter?.order || []).filter((e) => e.kind === 'enemy');
  const selected = enemies.find((e) => e.entryId === selectedEntryId) || null;

  const handleConfirm = () => {
    if (!selected) return;
    designate({ targetKey: preyKeyFor(selected), targetName: selected.name });
    if (encounterMode && actionCost > 0) {
      spendActions(actionCost, 'Hunt Prey');
    }
    appendLog({
      type: 'action',
      charId: character.id,
      text: `${character.name} designated ${selected.name} as prey${
        encounterMode && actionCost > 0 ? ` (${actionCost} act)` : ''
      }`,
    });
    onClose();
  };

  if (!isOpen || !character) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Hunt Prey" themeColor={themeColor} maxWidth="460px" placement="bottom">
      <section className="ct-section">
        <h3 className="ct-section-title">Designate prey</h3>
        {enemies.length === 0 ? (
          <p className="tw-locked-notice">No enemies in the encounter to hunt.</p>
        ) : (
          <div className="tw-target-list" role="group" aria-label="Select prey">
            {enemies.map((e) => (
              <button
                key={e.entryId}
                type="button"
                className={[
                  'ttp-target-chip',
                  selectedEntryId === e.entryId ? 'ttp-target-chip--on' : '',
                ].filter(Boolean).join(' ')}
                aria-pressed={selectedEntryId === e.entryId}
                onClick={() => setSelectedEntryId((prev) => (prev === e.entryId ? null : e.entryId))}
              >
                {e.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="tw-footer">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={handleConfirm} disabled={!selected}>
          Hunt Prey{encounterMode && actionCost > 0 ? ` (${actionCost} act)` : ''}
        </button>
      </div>
    </Modal>
  );
};

export default HuntPreyModal;
