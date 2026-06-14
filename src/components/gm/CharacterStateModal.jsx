import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../shared/Modal';
import { useContent } from '../../contexts/ContentContext';
import { useCharacterLiveState } from '../../hooks/useCharacterLiveState';
import { partitionLiveState } from '../../utils/liveStateRegistry';
import './CharacterStateModal.css';

// GM Character-State inspector (#229), Slice 1 — read-only. Shows every live
// synced key for one PC grouped + human-labelled (via liveStateRegistry), with
// a raw escape hatch for keys the registry doesn't describe. Edit affordances
// and reset presets land in the next slice.
const CharacterStateModal = ({ isOpen, onClose }) => {
  const { characters } = useContent();
  const [selectedId, setSelectedId] = useState('');
  const { liveState, refresh } = useCharacterLiveState(selectedId || null);

  // Re-snapshot on open so brand-new unrecognised keys that appeared while the
  // modal was closed show up (useCharacterLiveState only auto-tracks types it
  // was subscribed to at mount).
  useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen, refresh]);

  // Raw character (carries spellcasting.spell_slots / focus) lets formatters
  // show remaining/max rather than bare spent counts.
  const character = useMemo(
    () => (characters || []).find((c) => c.id === selectedId) || null,
    [characters, selectedId],
  );

  const { groups, unrecognized } = useMemo(
    () => partitionLiveState(liveState, character),
    [liveState, character],
  );

  const hasAny = groups.length > 0 || unrecognized.length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Character State" maxWidth="560px">
      <div className="cs-body">
        <div className="cs-char-row">
          <label htmlFor="cs-char">Character</label>
          <select
            id="cs-char"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            aria-label="select character"
          >
            <option value="">— pick a character —</option>
            {(characters || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {selectedId && !hasAny && (
          <p className="cs-empty gm-help">No live state recorded for this character yet.</p>
        )}

        {selectedId && groups.map((g) => (
          <section className="cs-group" key={g.key} aria-label={g.label}>
            <h3 className="cs-group-title">{g.label}</h3>
            <ul className="cs-list">
              {g.entries.map((e) => (
                <li className="cs-row" key={e.type} data-testid={`cs-row-${e.type}`}>
                  <span className="cs-label">{e.label}</span>
                  <span className="cs-value">{e.formatted}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {selectedId && unrecognized.length > 0 && (
          <section className="cs-group cs-group--raw" aria-label="Unrecognized">
            <h3 className="cs-group-title">Unrecognized</h3>
            <p className="cs-raw-note gm-help">
              Live keys with no display rule yet — shown raw.
            </p>
            <ul className="cs-list">
              {unrecognized.map((u) => (
                <li className="cs-row cs-row--raw" key={u.type} data-testid={`cs-raw-${u.type}`}>
                  <span className="cs-label">{u.type}</span>
                  <pre className="cs-raw">{JSON.stringify(u.value, null, 2)}</pre>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
};

export default CharacterStateModal;
