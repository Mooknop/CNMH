import React, { useState } from 'react';
import Modal from '../shared/Modal';
import { useSession } from '../../contexts/SessionContext';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import { newEntryUid } from '../../utils/uid';
import { APP, syncKey } from '../../sync/keys';

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

const EffectsModal = ({
  isOpen,
  onClose,
  themeColor,
  selfCharId,
  selfName,
  highZ = false,
}) => {
  const { getState, sendUpdate } = useSession();
  const { characters, effects: effectCatalog } = useContent();
  const { encounter, appendLog } = useEncounter();
  const [targetId, setTargetId] = useState(selfCharId);

  const handleApply = (effectDef) => {
    const current = getState(targetId, APP.EFFECTS) || [];
    const newEntry = {
      id: newEntryUid(),
      effectId: effectDef.id,
      appliedBy: selfCharId,
      ts: Date.now(),
    };
    const next = [...current, newEntry];
    const key = syncKey(APP.EFFECTS, targetId);
    writeLocal(key, next);
    sendUpdate(targetId, APP.EFFECTS, next);

    if (encounter && encounter.active) {
      const targetChar = characters.find((c) => c.id === targetId);
      const targetName = targetChar ? targetChar.name : targetId;
      appendLog({
        type: 'action',
        charId: selfCharId,
        text: `${selfName} applied ${effectDef.name} to ${targetName}`,
      });
    }

    onClose();
  };

  const targetOptions = characters.filter(Boolean);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Apply Effect"
      themeColor={themeColor}
      maxWidth="680px"
      highZ={highZ}
    >
      {/* ── Target picker ── */}
      <section className="ct-section">
        <h3 className="ct-section-title">Apply To</h3>
        <select
          aria-label="effect-target"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          style={{ marginBottom: '1rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
        >
          {targetOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.id === selfCharId ? ' (you)' : ''}
            </option>
          ))}
        </select>
      </section>

      <hr className="ct-divider" />

      {/* ── Effect browser ── */}
      <section className="ct-section">
        <h3 className="ct-section-title">Choose Effect</h3>
        <div className="ct-browser-grid">
          {(effectCatalog || []).map((def) => (
            <button
              key={def.id}
              className="ct-browser-card"
              onClick={() => handleApply(def)}
              title={def.description}
              style={{ textAlign: 'left' }}
            >
              <span className="ct-browser-name">{def.name}</span>
              <span className="ct-browser-summary">{def.description}</span>
            </button>
          ))}
        </div>
      </section>
    </Modal>
  );
};

export default EffectsModal;
