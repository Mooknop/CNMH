import React, { useState } from 'react';
import Modal from '../shared/Modal';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useSessionLog } from '../../hooks/useSessionLog';
import { useCharacter } from '../../hooks/useCharacter';
import { useChambers } from '../../hooks/useChambers';
import { flattenInventory } from '../../utils/InventoryUtils';
import {
  defaultAmmo,
  loadedAmmoRef,
  isAmmoEligible,
  nextEmptyChamber,
} from '../../utils/ammunition';
import './ReloadSheet.css';

/**
 * Reload a chambered/capacity weapon (#675, S3). Lists the weapon's default
 * infinite bolt plus any eligible special ammunition carried in inventory; the
 * chosen ammo is written into the next empty chamber via useChambers (the single
 * writer for the cnmh_chambers_<id> overlay).
 *
 * Special ammo is NOT consumed on load — depletion is deferred to fire (S4) so an
 * unfired reload can be unloaded without losing the item. The Reload spends the
 * weapon's Reload action cost in encounter and logs a session line.
 *
 * @param {boolean}  isOpen
 * @param {Function} onClose
 * @param {Object}   reload     - the tile's raw reload descriptor:
 *                   { weaponUid, weaponName, capacity, reloadCost, strike }
 * @param {Object}   character  - raw character object (the loader)
 * @param {string}   themeColor
 * @param {number}   actionCost - actions to spend in encounter (the weapon's Reload). 0 out of combat.
 */
const ReloadSheet = ({ isOpen, onClose, reload, character, themeColor, actionCost = 1 }) => {
  const { encounter, appendLog } = useEncounter();
  const { appendEvent } = useSessionLog();
  const { spendActions } = useTurnState(character?.id || 'nobody');
  const { stateFor, load } = useChambers(character?.id);
  const charData = useCharacter(character);

  // The default infinite bolt is always the pre-selected first option.
  const [selectedKey, setSelectedKey] = useState('__default__');

  if (!isOpen || !reload || !character) return null;

  const { weaponUid, weaponName, capacity, strike } = reload;
  const encounterMode = !!(encounter?.active && encounter.phase === 'in-progress');

  // The next chamber a reload fills (left-to-right). Should always be ≥0 here —
  // the tile only surfaces when one is empty — but guard against a race.
  const chamberState = stateFor(weaponUid, capacity);
  const targetIndex = nextEmptyChamber(chamberState);

  const bolt = defaultAmmo(strike);
  // Carried special ammunition that loads this weapon (#673 eligibility), with a
  // remaining count > 0. Containers are flattened so a quivered bolt still shows.
  const specials = flattenInventory(charData?.inventory)
    .filter((it) => isAmmoEligible(it, strike) && (it.quantity ?? 1) > 0);

  // In-encounter log lines go to the combat log; otherwise to the session log.
  const log = encounter?.active
    ? appendLog
    : ({ type, text }) => appendEvent({ type, text });

  const handleConfirm = () => {
    if (targetIndex < 0) {
      onClose();
      return;
    }
    const special = selectedKey === '__default__'
      ? null
      : specials.find((it) => (it.uid || it.name) === selectedKey);
    const ref = special ? loadedAmmoRef(special) : bolt;

    load(weaponUid, targetIndex, ref, capacity);
    log({
      type: 'action',
      charId: character.id,
      text: `${character.name} Reloaded the ${weaponName} (${ref.name})`,
    });
    if (encounterMode && actionCost > 0) {
      spendActions(actionCost, `Reload ${weaponName}`);
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Reload ${weaponName}`}
      themeColor={themeColor}
      maxWidth="420px"
      placement="bottom"
      highZ
    >
      <section className="ct-section">
        <p className="rls-sub">
          Chamber {targetIndex + 1} of {capacity} · choose ammunition
        </p>
      </section>

      <hr className="ct-divider" />

      <section className="ct-section">
        <div className="rls-picks" role="radiogroup" aria-label="Ammunition">
          <button
            type="button"
            className={`rls-pick${selectedKey === '__default__' ? ' rls-pick--active' : ''}`}
            aria-pressed={selectedKey === '__default__'}
            onClick={() => setSelectedKey('__default__')}
          >
            <span className="rls-pick-name">{bolt.name}</span>
            <span className="rls-pick-meta">∞</span>
          </button>

          {specials.map((it) => {
            const key = it.uid || it.name;
            const extra = it.ammunition?.activate || 0;
            return (
              <button
                key={key}
                type="button"
                className={`rls-pick${selectedKey === key ? ' rls-pick--active' : ''}`}
                aria-pressed={selectedKey === key}
                onClick={() => setSelectedKey(key)}
              >
                <span className="rls-pick-name">{it.name}</span>
                <span className="rls-pick-meta">
                  ×{it.quantity ?? 1}
                  {extra > 0 && <span className="rls-pick-activate"> · +{extra} to fire</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="rls-footer">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={handleConfirm} disabled={targetIndex < 0}>
          Reload{encounterMode && actionCost > 0 ? ` (${actionCost} act)` : ''}
        </button>
      </div>
    </Modal>
  );
};

export default ReloadSheet;
