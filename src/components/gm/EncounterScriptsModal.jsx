import React from 'react';
import Modal from '../shared/Modal';
import { useContent } from '../../contexts/ContentContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSessionLog } from '../../hooks/useSessionLog';
import { normalizeChallenges, isInfluence } from '../../utils/victoryPoints';
import { ENCOUNTER_SCRIPTS } from '../../data/encounterScripts';
import './EncounterScriptsModal.css';
import { APP, globalKey } from '../../sync/keys';

/**
 * GM quick action (#1472): launch a whole scene's worth of encounter tracks
 * from one button. A script bundles track definitions (encounterScripts.js);
 * launching stamps ids/targets and adds every track to the live collection —
 * alongside anything already running, never replacing it.
 */
const EncounterScriptsModal = ({ isOpen, onClose }) => {
  const { characters } = useContent();
  const { appendEvent } = useSessionLog();
  const [, setChallenges] = useSyncedState(globalKey(APP.VPCHALLENGE), null);

  const roster = Array.isArray(characters) ? characters : [];

  const handleLaunch = (script) => {
    if (!roster.length) return;
    const targetIds = roster.map((c) => c.id);
    const now = Date.now();

    const docs = script.tracks.map((track, i) => ({
      // Launch-time defaults first so the track definition can override.
      adjust: 0,
      drainPerRound: 0,
      lastDrainRound: null,
      ...(isInfluence(track) ? { revealed: [], dcModifier: 0, sceneRound: 1 } : {}),
      ...track,
      id: `${isInfluence(track) ? 'inf' : 'vpc'}-${now}-${i}`,
      target: 'all',
      targetIds,
      createdAt: now + i,
    }));

    setChallenges((cur) => ({
      ...normalizeChallenges(cur),
      ...Object.fromEntries(docs.map((d) => [d.id, d])),
    }));
    appendEvent({
      type: 'challenge',
      text: `Encounter script "${script.name}" launched — ${docs.map((d) => d.name).join(', ')}`,
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Encounter Scripts" maxWidth="520px">
      <ul className="es-list">
        {ENCOUNTER_SCRIPTS.map((script) => (
          <li className="es-script" key={script.id}>
            <div className="es-script-info">
              <span className="es-script-name">{script.name}</span>
              <span className="es-script-desc">{script.description}</span>
              <span className="es-script-tracks">
                {script.tracks.map((t) => t.name).join(' · ')}
              </span>
            </div>
            <button
              type="button"
              className="btn-primary es-launch-btn"
              onClick={() => handleLaunch(script)}
              disabled={!roster.length}
              aria-label={`Launch ${script.name}`}
            >
              Launch
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
};

export default EncounterScriptsModal;
