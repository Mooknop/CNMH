import React from 'react';
import Modal from '../shared/Modal';
import { useContent } from '../../contexts/ContentContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { usePartyGold } from '../../hooks/usePartyGold';
import { docGold } from '../../utils/gold';
import './PartyGoldModal.css';
import { APP, syncKey } from '../../sync/keys';

// One editable row per character. Each row owns its own useSyncedState so the
// per-character `cnmh_gold_<id>` keys can be edited without breaking rules of
// hooks (no per-character hooks in a parent loop). Writes sync immediately.
const GoldRow = ({ character }) => {
  // Authoritative GM write: setting party gold is authoring, not a player
  // resource burn, so it must stay editable even while Foundry is offline (the
  // offline-sandbox freeze would otherwise make the input uneditable).
  const [gold, setGold] = useSyncedState(syncKey(APP.GOLD, character.id), docGold(character), {
    authoritative: true,
  });

  const handleChange = (e) => {
    const raw = e.target.value;
    setGold(raw === '' ? 0 : Number(raw) || 0);
  };

  return (
    <div className="party-gold-row">
      <span className="party-gold-name">{character.name}</span>
      <div className="party-gold-entry">
        <input
          type="number"
          min="0"
          step="any"
          className="party-gold-input"
          value={gold}
          onChange={handleChange}
          aria-label={`${character.name} gold`}
        />
        <span className="party-gold-gp">gp</span>
      </div>
    </div>
  );
};

const PartyGoldModal = ({ isOpen, onClose }) => {
  const { characters } = useContent();
  const { total } = usePartyGold(characters);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Party Gold" maxWidth="420px">
      <div className="party-gold-body">
        {(characters || []).map((c) => (
          <GoldRow key={c.id} character={c} />
        ))}
        <div className="party-gold-total">
          <span className="party-gold-total-label">Party total</span>
          <span className="party-gold-total-value">{total} gp</span>
        </div>
      </div>
    </Modal>
  );
};

export default PartyGoldModal;
