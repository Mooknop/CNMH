import React from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import { useSyncedState } from '../../hooks/useSyncedState';
import './InitiativeEntry.css';

// Setup-phase banner shown above HandsPanel in the Encounter tab. Each player
// types their roll into their own sheet — the GM panel waits until every
// entry has a number before enabling "Begin Round 1". Renders nothing
// outside the setup phase or for characters that aren't in the order
// (so e.g. a viewing-only screen stays empty).
const InitiativeEntry = ({ charId }) => {
  const { encounter, setInitiative } = useEncounter();
  const [scoutBonusCharId] = useSyncedState('cnmh_scoutbonus_global', null);

  if (!encounter || encounter.phase !== 'setup') return null;
  const entry = (encounter.order || []).find(
    (e) => e && e.kind === 'pc' && e.charId === charId
  );
  if (!entry) return null;

  return (
    <div className="initiative-entry" role="region" aria-label="Initiative entry">
      {scoutBonusCharId && scoutBonusCharId !== charId && (
        <div className="initiative-entry-scout">
          +1 circumstance bonus to initiative — Scout active
        </div>
      )}
      <div className="initiative-entry-inner">
        <div className="initiative-entry-prompt">
          <strong>Roll for initiative.</strong> Enter your roll below — the GM
          will start Round 1 once everyone has theirs in.
        </div>
        <label className="initiative-entry-field">
          <span>Your initiative</span>
          <input
            aria-label="initiative-input"
            type="number"
            value={entry.initiative ?? ''}
            onChange={(e) => setInitiative(entry.entryId, e.target.value)}
          />
        </label>
      </div>
    </div>
  );
};

export default InitiativeEntry;
